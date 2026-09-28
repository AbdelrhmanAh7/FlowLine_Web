import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Private beta access (P4-12). With FLOWLINE_BETA_MODE=invite_only, an account can only be created (email OR Google /
 * GitHub sign-up) when one of these holds:
 *   - the email has a pending, unexpired workspace invitation;
 *   - a valid beta access code is supplied with the sign-up (consumed atomically);
 *   - the email is on the FLOWLINE_BETA_ADMINS allowlist.
 * Existing users can always sign in. Any other mode (default "open") keeps sign-up open (dev/test/local staging).
 */
export type BetaMode = "open" | "invite_only";
export function betaMode(): BetaMode {
  return process.env.FLOWLINE_BETA_MODE === "invite_only" ? "invite_only" : "open";
}

export const BETA_REFUSAL = "Flowline is in private beta. Sign up with the email your invitation was sent to, or enter a beta access code.";

const hash = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
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

/** Decides whether a new account may be created for this email. Consumes a code use when a code is what allows it. */
export async function allowSignUp(email: string, code?: string | null): Promise<{ ok: true; via: "open" | "admin" | "invite" | "code" } | { ok: false }> {
  if (betaMode() === "open") return { ok: true, via: "open" };
  const e = email.trim().toLowerCase();
  if (admins().includes(e)) return { ok: true, via: "admin" };
  const [invite] = await db
    .select({ id: schema.workspaceInvite.id })
    .from(schema.workspaceInvite)
    .where(and(sql`lower(${schema.workspaceInvite.email}) = ${e}`, isNull(schema.workspaceInvite.acceptedAt), isNull(schema.workspaceInvite.revokedAt), gt(schema.workspaceInvite.expiresAt, new Date())))
    .limit(1);
  if (invite) return { ok: true, via: "invite" };
  if (code && code.trim()) {
    const used = await db
      .update(schema.betaAccessCode)
      .set({ usedCount: sql`${schema.betaAccessCode.usedCount} + 1` })
      .where(
        and(
          eq(schema.betaAccessCode.codeHash, hash(code)),
          isNull(schema.betaAccessCode.revokedAt),
          lt(schema.betaAccessCode.usedCount, schema.betaAccessCode.maxUses),
          or(isNull(schema.betaAccessCode.expiresAt), gt(schema.betaAccessCode.expiresAt, new Date())),
        ),
      )
      .returning({ id: schema.betaAccessCode.id });
    if (used.length > 0) return { ok: true, via: "code" };
  }
  return { ok: false };
}
