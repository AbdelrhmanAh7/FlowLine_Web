import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "./crypto";
import { HttpError, notFound } from "./http";
import { platformAudit } from "./platform-audit";
import { checkRate } from "./rate-limit";
import { hotp, TOTP_PERIOD } from "./totp";
import { hasSessionMfa } from "./federated-mfa";

/**
 * The platform-admin trust boundary (docs/security/CREDENTIALS_DESIGN.md MUST 1–2).
 *
 * - A separate principal (`platform_admin`, keyed by user id), checked against the DB on EVERY request.
 * - Session cookies only: any request carrying an Authorization header (workspace API keys) is refused.
 * - Everyone who isn't an active admin gets 404 — the panel's existence isn't confirmed.
 * - Admins additionally need a verified email, an enrolled TOTP authenticator, session-bound MFA assurance and a session ≤ 24 h old.
 * - Writes need a step-up: a TOTP code verified in the last 10 minutes, bound to the SHA-256 of THIS session's token.
 *   Workspace SSO never satisfies it (TOTP only).
 */
export const PANEL_SESSION_MAX_AGE_MS = 24 * 60 * 60_000;
export const STEP_UP_TTL_MS = 10 * 60_000;

export interface PlatformAdminContext {
  user: { id: string; email: string; name: string };
  session: { id: string; tokenHash: string; createdAt: Date };
}

interface SessionInfo {
  user: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled?: boolean | null };
  session: { id: string; token: string; createdAt: Date };
}

async function sessionFrom(h: Headers): Promise<SessionInfo | null> {
  const s = await auth.api.getSession({ headers: h }).catch(() => null);
  if (!s) return null;
  return s as unknown as SessionInfo;
}

export async function requestHeaders(req?: Request): Promise<Headers> {
  // Route handlers pass the Request; server components read next/headers. Either way the SAME rules apply.
  if (req) {
    const h = new Headers(await nextHeaders().catch(() => new Headers()));
    req.headers.forEach((v, k) => h.set(k, v));
    return h;
  }
  return new Headers(await nextHeaders());
}

async function denied(userId: string | null, label: string, reason: string) {
  // Authenticated non-admin probes are recorded (bounded code only); anonymous ones are not (no identity to record).
  if (!userId) return;
  await platformAudit(db, { actor: { userId, label }, assurance: "session", action: "admin.access_denied", result: "denied", data: { reason } }).catch(() => {});
}

/**
 * Resolves the current platform admin or throws. Setup runs through its separate
 * enrollment flow before the admin row exists; panel routes require MFA assurance.
 */
export async function requirePlatformAdmin(req?: Request): Promise<PlatformAdminContext> {
  const h = await requestHeaders(req);
  if (h.get("authorization")) throw notFound(); // API keys (Bearer) never reach the panel, even with a valid cookie.
  const s = await sessionFrom(h);
  if (!s) throw notFound();
  const [admin] = await db.select().from(schema.platformAdmin).where(eq(schema.platformAdmin.userId, s.user.id));
  if (!admin || admin.status !== "active") {
    await denied(s.user.id, s.user.email, "not_admin");
    throw notFound();
  }
  if (!s.user.emailVerified) throw new HttpError(403, "PLATFORM_EMAIL_UNVERIFIED", "Verify your email address before using the platform panel");
  if (!(await hasVerifiedTotp(s.user.id))) throw new HttpError(403, "PLATFORM_TOTP_REQUIRED", "Enrol an authenticator app before using the platform panel");
  if (!(await hasSessionMfa(s.session.token, s.user.id))) throw new HttpError(403, "PLATFORM_MFA_REQUIRED", "Sign in again and complete your authenticator challenge");
  if (Date.now() - new Date(s.session.createdAt).getTime() > PANEL_SESSION_MAX_AGE_MS) {
    throw new HttpError(401, "PLATFORM_REAUTH_REQUIRED", "Sign in again to use the platform panel (sessions older than 24 hours are refused)");
  }
  return { user: { id: s.user.id, email: s.user.email, name: s.user.name }, session: { id: s.session.id, tokenHash: sha256Hex(s.session.token), createdAt: new Date(s.session.createdAt) } };
}

/** For server components: null instead of throwing (the page then renders notFound()). */
export async function platformAdminOrNull(): Promise<PlatformAdminContext | null> {
  try {
    return await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof HttpError) return null;
    throw e;
  }
}

export async function hasVerifiedTotp(userId: string) {
  const [u] = await db.select({ on: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.id, userId));
  if (!u?.on) return false;
  const [tf] = await db.select({ verified: schema.twoFactor.verified }).from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  return Boolean(tf && tf.verified !== false);
}

/** Current step-up expiry for this session, or null. */
export async function stepUpUntil(ctx: PlatformAdminContext): Promise<Date | null> {
  const [row] = await db
    .select({ expiresAt: schema.platformStepup.expiresAt })
    .from(schema.platformStepup)
    .where(and(eq(schema.platformStepup.sessionTokenHash, ctx.session.tokenHash), eq(schema.platformStepup.userId, ctx.user.id), gt(schema.platformStepup.expiresAt, new Date())));
  return row?.expiresAt ?? null;
}

/** Writes need a TOTP step-up in the last 10 minutes on THIS session. */
export async function requireStepUp(ctx: PlatformAdminContext) {
  if (!(await stepUpUntil(ctx))) throw new HttpError(403, "STEP_UP_REQUIRED", "Confirm with a code from your authenticator app to make changes");
}

/* ───────────── TOTP (secret enrolled through better-auth's two-factor plugin) ───────────── */

async function totpSecret(userId: string): Promise<string | null> {
  const [tf] = await db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, userId));
  if (!tf || tf.verified === false) return null;
  const ctx = await auth.$context;
  const { symmetricDecrypt } = await import("better-auth/crypto");
  return symmetricDecrypt({ key: ctx.secretConfig as never, data: tf.secret });
}

/**
 * Verifies a TOTP code for a user (±1 step) and returns the matched time step, or null. Constant work per call.
 * Replay protection is the caller's job (`lastTotpStep`).
 */
export async function verifyTotp(userId: string, code: string, now = Date.now()): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = await totpSecret(userId);
  if (!secret) return null;
  const step = Math.floor(now / 1000 / TOTP_PERIOD);
  let matched: number | null = null;
  for (const s of [step - 1, step, step + 1]) {
    const expected = hotp(secret, s);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (diff === 0 && matched === null) matched = s;
  }
  return matched;
}

/**
 * Step-up: verifies a TOTP code, refuses a replayed step, and elevates THIS session for 10 minutes.
 * Rate-limited (5 attempts / 5 minutes per admin, shared across instances). Every attempt is audited.
 */
export async function performStepUp(ctx: PlatformAdminContext, code: string) {
  if (!(await checkRate(`platform-stepup:${ctx.user.id}`, 5, 300))) {
    await platformAudit(db, { actor: { userId: ctx.user.id, label: ctx.user.email }, assurance: "session", action: "admin.stepup", result: "denied", data: { reason: "rate_limited" } });
    throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
  const step = await verifyTotp(ctx.user.id, code);
  const ok = step !== null && (await consumeTotpStep(ctx.user.id, step));
  if (!ok) {
    await platformAudit(db, { actor: { userId: ctx.user.id, label: ctx.user.email }, assurance: "session", action: "admin.stepup", result: "denied", data: { reason: step === null ? "invalid_code" : "replayed_code" } });
    throw new HttpError(403, "STEP_UP_INVALID", "That code isn't valid. Enter the current code from your authenticator app.");
  }
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.platformStepup)
      .values({ sessionTokenHash: ctx.session.tokenHash, userId: ctx.user.id, method: "totp", verifiedAt: new Date(), expiresAt })
      .onConflictDoUpdate({ target: schema.platformStepup.sessionTokenHash, set: { userId: ctx.user.id, method: "totp", verifiedAt: new Date(), expiresAt } });
    await platformAudit(tx, { actor: { userId: ctx.user.id, label: ctx.user.email }, assurance: "session_totp_stepup", action: "admin.stepup", result: "ok" });
  });
  return { expiresAt };
}

/** Atomically records `step` as used; false when it (or a later step) was already accepted. */
export async function consumeTotpStep(userId: string, step: number): Promise<boolean> {
  const rows = await db
    .update(schema.platformAdmin)
    .set({ lastTotpStep: step })
    .where(and(eq(schema.platformAdmin.userId, userId), or(isNull(schema.platformAdmin.lastTotpStep), lt(schema.platformAdmin.lastTotpStep, step))))
    .returning({ userId: schema.platformAdmin.userId });
  return rows.length === 1;
}

/** Revoking an admin also drops every elevation they hold. */
export async function dropStepUps(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
  await tx.delete(schema.platformStepup).where(eq(schema.platformStepup.userId, userId));
}
