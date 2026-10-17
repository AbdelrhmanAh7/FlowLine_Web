import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Private beta access (P4-12). With FLOWLINE_BETA_MODE=invite_only, an account can only be created (email OR Google /
 * GitHub sign-up) when one of these holds:
 *   - the email has a pending, unexpired workspace invitation;
 *   - a valid beta access code is supplied with the sign-up (consumed atomically);
 *   - the email is on the FLOWLINE_BETA_ADMINS allowlist.
 * Existing users can always sign in. Only explicit "open" keeps sign-up open (dev/test/local staging).
 * Missing or malformed configuration defaults to invitation-only and logs a configuration error.
 */
export type BetaMode = "open" | "invite_only";

/**
 * TEST ENVIRONMENT ONLY: the isolated E2E stack runs one server for many parallel tests, so a test switches the
 * beta mode for its own browser context with this cookie (set via /api/test/beta) instead of flipping the server env.
 * Outside FLOWLINE_ENV=test the cookie is ignored.
 */
export const TEST_BETA_COOKIE = "fl_test_beta_mode";
let lastInvalidConfig: string | undefined;

/** The beta mode for this request. `headers` only matters on the test stack (see TEST_BETA_COOKIE). */
export function betaMode(headers?: Headers | null): BetaMode {
  if (process.env.FLOWLINE_ENV === "test" && headers) {
    const m = /(?:^|;\s*)fl_test_beta_mode=(open|invite_only)(?:;|$)/.exec(headers.get("cookie") ?? "");
    if (m) return m[1] as BetaMode;
  }
  const configured = process.env.FLOWLINE_BETA_MODE;
  if (configured === "invite_only" || configured === "open") {
    lastInvalidConfig = undefined;
    return configured;
  }
  const invalidConfig = JSON.stringify([process.env.FLOWLINE_ENV, configured]);
  if (lastInvalidConfig !== invalidConfig) {
    // Do not print arbitrary environment values; emit once per changed invalid configuration.
    console.error("[config] FLOWLINE_BETA_MODE is missing or invalid; defaulting to invite_only. Set invite_only or open explicitly.");
    lastInvalidConfig = invalidConfig;
  }
  return "invite_only";
}

/** Beta support channels shown in the user menu (P4-14). Unset values render as disabled items with a reason. */
export interface BetaSupport {
  beta: boolean;
  supportEmail: string | null;
  feedbackUrl: string | null;
}
export function betaSupport(): BetaSupport {
  const email = process.env.FLOWLINE_SUPPORT_EMAIL?.trim() || null;
  const url = process.env.FLOWLINE_FEEDBACK_URL?.trim() || null;
  return {
    beta: betaMode() === "invite_only",
    supportEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    feedbackUrl: url && /^https:\/\//.test(url) ? url : null,
  };
}

export const BETA_REFUSAL = "Flowline is in private beta. Sign up with the email your invitation was sent to, or enter a beta access code.";

const hash = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
/**
 * FLOWLINE_BETA_ADMINS is a SIGN-UP allowlist only (these emails may create an account during the invite-only beta).
 * It is never authorization: platform administrators are the separate `platform_admin` principal, created only by the
 * operator bootstrap challenge (scripts/admin/bootstrap.mts) — never from this list.
 */
const admins = () =>
  (process.env.FLOWLINE_BETA_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Creates a code; the plain code is returned ONCE (only its hash is stored). */
export async function createBetaCode(opts: { label: string; maxUses?: number; expiresInDays?: number }) {
  const code = `FL-${randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  const [row] = await db
    .insert(schema.betaAccessCode)
    .values({ codeHash: hash(code), label: opts.label.slice(0, 80), maxUses: Math.max(1, opts.maxUses ?? 1), expiresAt: opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86_400_000) : null })
    .returning();
  return { code, id: row!.id };
}

type Decision = { ok: true; via: "open" | "admin" | "invite" | "code" | "setup" } | { ok: false };

const usableCode = (code: string) =>
  and(
    eq(schema.betaAccessCode.codeHash, hash(code)),
    isNull(schema.betaAccessCode.revokedAt),
    lt(schema.betaAccessCode.usedCount, schema.betaAccessCode.maxUses),
    or(isNull(schema.betaAccessCode.expiresAt), gt(schema.betaAccessCode.expiresAt, new Date())),
  );

async function decide(email: string, code: string | null | undefined, mode: BetaMode, consume: boolean): Promise<Decision> {
  if (mode === "open") return { ok: true, via: "open" };
  const e = email.trim().toLowerCase();
  if (admins().includes(e)) return { ok: true, via: "admin" };
  const [invite] = await db
    .select({ id: schema.workspaceInvite.id })
    .from(schema.workspaceInvite)
    .where(and(sql`lower(${schema.workspaceInvite.email}) = ${e}`, isNull(schema.workspaceInvite.acceptedAt), isNull(schema.workspaceInvite.revokedAt), gt(schema.workspaceInvite.expiresAt, new Date())))
    .limit(1);
  if (invite) return { ok: true, via: "invite" };
  // The identity bound to an operator-issued platform setup challenge (redeemed, unexpired) may create its account.
  const [setup] = await db
    .select({ id: schema.platformSetupChallenge.id })
    .from(schema.platformSetupChallenge)
    .where(and(sql`lower(${schema.platformSetupChallenge.email}) = ${e}`, isNull(schema.platformSetupChallenge.consumedAt), isNull(schema.platformSetupChallenge.cancelledAt), gt(schema.platformSetupChallenge.sessionExpiresAt, new Date())))
    .limit(1);
  if (setup) return { ok: true, via: "setup" };
  if (code && code.trim()) {
    const rows = consume
      ? await db
          .update(schema.betaAccessCode)
          .set({ usedCount: sql`${schema.betaAccessCode.usedCount} + 1` })
          .where(usableCode(code))
          .returning({ id: schema.betaAccessCode.id })
      : await db.select({ id: schema.betaAccessCode.id }).from(schema.betaAccessCode).where(usableCode(code)).limit(1);
    if (rows.length > 0) return { ok: true, via: "code" };
  }
  return { ok: false };
}

/** Decides whether a new account may be created for this email. Consumes a code use when a code is what allows it. */
export async function allowSignUp(email: string, code?: string | null, mode: BetaMode = betaMode()): Promise<Decision> {
  return decide(email, code, mode, true);
}

/**
 * The sign-up form's pre-check: the same decision as allowSignUp, but a code is only looked at, never consumed
 * (the use is taken atomically by the sign-up itself).
 */
export async function previewSignUp(email: string, code?: string | null, mode: BetaMode = betaMode()): Promise<Decision> {
  return decide(email, code, mode, false);
}
