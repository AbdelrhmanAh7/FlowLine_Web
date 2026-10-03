import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError } from "./http";
import { platformAudit } from "./platform-audit";
import { getSetting, setSetting } from "./platform-settings";
import { platformCredentialStatus, setPlatformSecret } from "./platform-secrets";
import { checkRate } from "./rate-limit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * First-admin bootstrap and recovery (docs/security/CREDENTIALS_DESIGN.md MUST 3, §3 "Codex" decision).
 *
 * 1. The operator runs `scripts/admin/bootstrap.mts --email <addr>` on the host. It creates a random, single-use,
 *    short-lived challenge bound to that one email (only its SHA-256 is stored) and prints it once.
 * 2. In the browser, /admin/setup redeems it (POST, never a URL) into a narrow SETUP SESSION (httpOnly cookie). The
 *    setup session may do exactly one thing before an admin exists: configure the email provider — and while setup is
 *    incomplete that email configuration delivers only to the bound identity.
 * 3. The bound identity signs up / signs in normally and verifies its email through the real flow.
 * 4. It enrols TOTP (better-auth two-factor), then completes setup with a fresh code: the admin row is created, the
 *    challenge consumed and setup closed ATOMICALLY, under a DB lock. Completion is permanent; deleting every admin
 *    does not reopen setup. Recovery / additional admins need an explicit, audited operator challenge.
 */
export const SETUP_COOKIE = "fl_platform_setup";
const CHALLENGE_TTL_MS = 30 * 60_000;
const SETUP_SESSION_TTL_MS = 60 * 60_000;
const SETUP_LOCK = 0x464c5354; // "FLST"

export type ChallengeKind = "bootstrap" | "recovery" | "grant";

async function lock(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK})`);
}

async function setupCompleted(tx: Tx | Db) {
  const [row] = await tx.select({ completedAt: schema.platformSetup.completedAt }).from(schema.platformSetup).where(eq(schema.platformSetup.id, 1));
  return Boolean(row?.completedAt);
}

/** Operator CLI: issue a challenge. Serialized with the setup lock; any earlier outstanding challenge is cancelled. */
export async function issueChallenge(opts: { email: string; kind: ChallengeKind; operator: string }) {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email address is required");
  return db.transaction(async (tx) => {
    await lock(tx);
    const done = await setupCompleted(tx);
    if (opts.kind === "bootstrap" && done) throw new Error("Platform setup was already completed. Use --recover (audited) or --grant to add an admin.");
    if (opts.kind !== "bootstrap" && !done) throw new Error("Platform setup hasn't been completed yet. Use the bootstrap challenge first.");
    await tx.update(schema.platformSetupChallenge).set({ cancelledAt: new Date() }).where(and(isNull(schema.platformSetupChallenge.consumedAt), isNull(schema.platformSetupChallenge.cancelledAt)));
    const token = randomToken(32);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await tx.insert(schema.platformSetupChallenge).values({ id, tokenHash: sha256Hex(token), email, kind: opts.kind, expiresAt });
    await platformAudit(tx, { actor: { userId: null, label: `cli:${opts.operator}`.slice(0, 120) }, assurance: "cli", action: "setup.challenge_issued", result: "ok", targetType: "setup_challenge", targetId: id, data: { kind: opts.kind } });
    return { id, token, email, kind: opts.kind, expiresAt };
  });
}

/** Browser: redeem the challenge into a setup session (cookie value returned once). Rate-limited, audited. */
export async function redeemChallenge(token: string, clientKey: string) {
  if (!(await checkRate(`platform-setup-redeem:${clientKey}`, 5, 600)) || !(await checkRate("platform-setup-redeem:all", 30, 600))) {
    throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const tokenHash = sha256Hex(token.trim());
  return db.transaction(async (tx) => {
    await lock(tx);
    const [ch] = await tx.select().from(schema.platformSetupChallenge).where(eq(schema.platformSetupChallenge.tokenHash, tokenHash)).for("update");
    const usable = ch && !ch.consumedAt && !ch.cancelledAt && !ch.redeemedAt && ch.expiresAt > new Date();
    if (!usable || (ch.kind === "bootstrap" && (await setupCompleted(tx)))) {
      await platformAudit(tx, { actor: { userId: null, label: "setup" }, assurance: "setup_session", action: "setup.denied", result: "denied", data: { reason: "invalid_challenge" } });
      throw new HttpError(400, "SETUP_CHALLENGE_INVALID", "This setup code is invalid, expired or already used. Ask the operator for a new one.");
    }
    const session = randomToken(32);
    const sessionExpiresAt = new Date(Date.now() + SETUP_SESSION_TTL_MS);
    await tx.update(schema.platformSetupChallenge).set({ redeemedAt: new Date(), sessionHash: sha256Hex(session), sessionExpiresAt }).where(eq(schema.platformSetupChallenge.id, ch.id));
    await platformAudit(tx, { actor: { userId: null, label: "setup" }, assurance: "setup_session", action: "setup.challenge_redeemed", result: "ok", targetType: "setup_challenge", targetId: ch.id, data: { kind: ch.kind } });
    return { cookie: session, expiresAt: sessionExpiresAt };
  });
}

function cookieValue(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The live setup challenge behind this request's setup cookie, or null. */
export async function setupChallengeFrom(req: Request) {
  const value = cookieValue(req, SETUP_COOKIE);
  if (!value) return null;
  const [ch] = await db
    .select()
    .from(schema.platformSetupChallenge)
    .where(and(eq(schema.platformSetupChallenge.sessionHash, sha256Hex(value)), isNull(schema.platformSetupChallenge.consumedAt), isNull(schema.platformSetupChallenge.cancelledAt), gt(schema.platformSetupChallenge.sessionExpiresAt, new Date())));
  return ch ?? null;
}

/** Whether a real (admin- or setup-configured) email provider is active. */
async function emailConfigured() {
  const active = await getSetting("email.provider");
  if (!active?.value) return false;
  return Boolean((await platformCredentialStatus(`email.${active.value}`))?.configured);
}

/** What the setup page shows for this setup session (+ the signed-in user, if any). Public identifiers only. */
export async function setupState(ch: NonNullable<Awaited<ReturnType<typeof setupChallengeFrom>>>, user: { id: string; email: string; emailVerified: boolean } | null) {
  const outbox = process.env.FLOWLINE_EMAIL_PROVIDER === "outbox" || (process.env.FLOWLINE_ENV === "test" && !process.env.FLOWLINE_EMAIL_PROVIDER);
  return {
    kind: ch.kind,
    email: ch.email,
    expiresAt: ch.sessionExpiresAt,
    emailConfigured: (await emailConfigured()) || outbox,
    signedIn: Boolean(user),
    signedInEmail: user?.email ?? null,
    signedInAsBound: Boolean(user && user.email.toLowerCase() === ch.email),
    emailVerified: Boolean(user?.emailVerified && user.email.toLowerCase() === ch.email),
    totpEnrolled: Boolean(user && user.email.toLowerCase() === ch.email && (await (await import("./platform-access")).hasVerifiedTotp(user.id))),
  };
}

/**
 * The ONE thing a setup session may configure before an admin exists: the email provider (so verification mail can
 * reach the bound identity). Refused once an administrator configured email.
 */
export async function setupConfigureEmail(ch: NonNullable<Awaited<ReturnType<typeof setupChallengeFrom>>>, input: { provider: "resend" | "postmark"; from: string; secret: string }) {
  if (ch.kind !== "bootstrap") throw new HttpError(403, "SETUP_EMAIL_NOT_ALLOWED", "Only the first-admin setup can configure email here");
  const purpose = `email.${input.provider}`;
  const status = await platformCredentialStatus(purpose);
  if (status?.configured && !status.setBy?.startsWith("setup:")) throw new HttpError(409, "EMAIL_ALREADY_CONFIGURED", "Email is already configured by an administrator");
  const actor = { userId: null, label: `setup:${ch.email}`, assurance: "setup_session" as const };
  await setPlatformSecret(actor, purpose, { publicId: input.from, secret: input.secret, expectedRevision: status?.revision ?? 0 }, { setupChallengeId: ch.id });
  const current = await getSetting("email.provider");
  if (current?.value !== input.provider) await setSetting(actor, "email.provider", input.provider, current?.revision ?? 0);
  await platformAudit(db, { actor: { userId: null, label: actor.label }, assurance: "setup_session", action: "setup.email_configured", result: "ok", targetType: "setup_challenge", targetId: ch.id, purpose });
}

/**
 * Atomic completion: the signed-in user must be the bound identity with a verified email and an enrolled TOTP, and
 * present a fresh code. Creates (or re-activates) the admin, consumes the challenge and closes setup — all in one
 * transaction under the setup lock.
 */
export async function completeSetup(ch: NonNullable<Awaited<ReturnType<typeof setupChallengeFrom>>>, user: { id: string; email: string; emailVerified: boolean; sessionToken?: string; sessionExpiresAt?: Date }, code: string) {
  if (!(await checkRate(`platform-setup-complete:${ch.id}`, 5, 300))) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  if (user.email.toLowerCase() !== ch.email) throw new HttpError(403, "SETUP_WRONG_IDENTITY", "Sign in as the email address this setup code was issued for");
  if (!user.emailVerified) throw new HttpError(403, "SETUP_EMAIL_UNVERIFIED", "Verify your email address first");
  // Loaded lazily: the operator CLI imports this module without the web auth stack.
  const { hasVerifiedTotp, verifyTotp } = await import("./platform-access");
  if (!(await hasVerifiedTotp(user.id))) throw new HttpError(403, "PLATFORM_TOTP_REQUIRED", "Enrol an authenticator app first");
  const step = await verifyTotp(user.id, code);
  if (step === null) {
    await platformAudit(db, { actor: { userId: user.id, label: user.email }, assurance: "setup_session", action: "setup.denied", result: "denied", data: { reason: "invalid_code" } });
    throw new HttpError(403, "STEP_UP_INVALID", "That code isn't valid. Enter the current code from your authenticator app.");
  }
  await db.transaction(async (tx) => {
    await lock(tx);
    const [fresh] = await tx.select().from(schema.platformSetupChallenge).where(eq(schema.platformSetupChallenge.id, ch.id)).for("update");
    if (!fresh || fresh.consumedAt || fresh.cancelledAt || !fresh.sessionExpiresAt || fresh.sessionExpiresAt < new Date()) throw new HttpError(400, "SETUP_CHALLENGE_INVALID", "This setup session expired. Ask the operator for a new code.");
    if (fresh.kind === "bootstrap" && (await setupCompleted(tx))) throw new HttpError(409, "SETUP_ALREADY_COMPLETED", "Platform setup was already completed");
    const [existing] = await tx.select().from(schema.platformAdmin).where(eq(schema.platformAdmin.userId, user.id)).for("update");
    if (existing && existing.lastTotpStep !== null && existing.lastTotpStep >= step) throw new HttpError(403, "STEP_UP_INVALID", "That code was already used. Wait for the next one.");
    if (existing) await tx.update(schema.platformAdmin).set({ status: "active", grantedAt: new Date(), grantedBy: `cli:${fresh.id}`, revokedAt: null, revokedBy: null, lastTotpStep: step }).where(eq(schema.platformAdmin.userId, user.id));
    else await tx.insert(schema.platformAdmin).values({ userId: user.id, status: "active", grantedBy: `cli:${fresh.id}`, lastTotpStep: step });
    await tx.update(schema.platformSetupChallenge).set({ consumedAt: new Date(), consumedBy: user.id }).where(eq(schema.platformSetupChallenge.id, fresh.id));
    if (fresh.kind === "bootstrap") {
      await tx.insert(schema.platformSetup).values({ id: 1, completedAt: new Date(), completedBy: user.id }).onConflictDoUpdate({ target: schema.platformSetup.id, set: { completedAt: new Date(), completedBy: user.id } });
    }
    if (user.sessionToken && user.sessionExpiresAt) {
      const { recordMfaAssurance } = await import("./federated-mfa");
      await recordMfaAssurance(user.sessionToken, user.id, user.sessionExpiresAt, tx);
    }
    await platformAudit(tx, { actor: { userId: user.id, label: user.email }, assurance: "session_totp_stepup", action: "admin.totp_enrolled", result: "ok", targetType: "platform_admin", targetId: user.id });
    await platformAudit(tx, { actor: { userId: user.id, label: user.email }, assurance: "session_totp_stepup", action: "admin.granted", result: "ok", targetType: "platform_admin", targetId: user.id, data: { via: fresh.kind } });
    if (fresh.kind === "bootstrap") await platformAudit(tx, { actor: { userId: user.id, label: user.email }, assurance: "session_totp_stepup", action: "setup.completed", result: "ok", targetType: "setup_challenge", targetId: fresh.id });
  });
}

/** Admin-panel action: revoke another admin (or yourself). Drops their elevations; setup never reopens. */
export async function revokeAdmin(actor: { id: string; email: string }, userId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.platformAdmin).where(eq(schema.platformAdmin.userId, userId)).for("update");
    if (!row || row.status !== "active") throw new HttpError(404, "NOT_FOUND", "Not an active admin");
    await tx.update(schema.platformAdmin).set({ status: "revoked", revokedAt: new Date(), revokedBy: actor.id }).where(eq(schema.platformAdmin.userId, userId));
    await tx.delete(schema.platformStepup).where(eq(schema.platformStepup.userId, userId));
    await platformAudit(tx, { actor: { userId: actor.id, label: actor.email }, assurance: "session_totp_stepup", action: "admin.revoked", result: "ok", targetType: "platform_admin", targetId: userId });
  });
}

export async function listAdmins() {
  const rows = await db
    .select({ userId: schema.platformAdmin.userId, email: schema.user.email, status: schema.platformAdmin.status, grantedAt: schema.platformAdmin.grantedAt, revokedAt: schema.platformAdmin.revokedAt })
    .from(schema.platformAdmin)
    .innerJoin(schema.user, eq(schema.user.id, schema.platformAdmin.userId));
  return rows;
}
