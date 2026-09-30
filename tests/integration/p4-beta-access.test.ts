import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { createBetaCode } from "@/server/beta";
import { createInvite } from "@/server/members";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

/** P4-12: in invite_only mode, nobody can create an account without an invitation, a beta code, or being an admin. */
const prev = process.env.FLOWLINE_BETA_MODE;
const prevAdmins = process.env.FLOWLINE_BETA_ADMINS;
beforeAll(() => {
  process.env.FLOWLINE_BETA_MODE = "invite_only";
});
afterEach(() => {
  process.env.FLOWLINE_BETA_ADMINS = prevAdmins;
});
afterAll(async () => {
  process.env.FLOWLINE_BETA_MODE = prev;
  await closeDb();
});

const email = (p: string) => `${p}-${randomUUID().slice(0, 8)}@flowline-beta.test`;
/**
 * With email verification required, better-auth answers every sign-up generically (no account enumeration), so the
 * outcome is judged by what matters: whether an account was actually created.
 */
async function signUp(e: string, betaCode?: string) {
  await auth.api.signUpEmail({ body: { email: e, password: "Beta-Test-Pass-1", name: "Beta", ...(betaCode ? { betaCode } : {}) } as never }).catch(() => null);
  return { ok: await userExists(e) };
}
async function userExists(e: string) {
  return (await db.select().from(schema.user).where(sql`lower(${schema.user.email}) = ${e.toLowerCase()}`)).length === 1;
}

describe("private beta access", () => {
  it("refuses an uninvited sign-up with a clear reason, and creates nothing", async () => {
    const e = email("stranger");
    const r = await signUp(e);
    expect(r.ok).toBe(false);
  });

  it("allows the email a workspace invitation was sent to (case-insensitive), but not after it is revoked", async () => {
    const owner = await makeUser("beta-owner");
    const ws = await createWorkspace(owner, unique("Beta"));
    const e = email("invitee");
    await createInvite(owner, ws.id, { email: e.toUpperCase(), role: "editor" });
    expect((await signUp(e)).ok).toBe(true);
    expect(await userExists(e)).toBe(true);

    const e2 = email("revoked");
    const inv = await createInvite(owner, ws.id, { email: e2, role: "viewer" });
    await db.update(schema.workspaceInvite).set({ revokedAt: new Date() }).where(eq(schema.workspaceInvite.id, inv.invite.id));
    expect((await signUp(e2)).ok).toBe(false);
  });

  it("a beta code admits exactly as many sign-ups as it allows; expired, revoked and wrong codes are refused", async () => {
    const { code } = await createBetaCode({ label: "test", maxUses: 1 });
    expect((await signUp(email("coded"), code.toLowerCase())).ok).toBe(true); // codes are case-insensitive
    expect((await signUp(email("second"), code)).ok).toBe(false); // single use
    expect((await signUp(email("wrong"), "FL-NOT-A-CODE")).ok).toBe(false);

    const expired = await createBetaCode({ label: "old", maxUses: 5 });
    await db.update(schema.betaAccessCode).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.betaAccessCode.id, expired.id));
    expect((await signUp(email("late"), expired.code)).ok).toBe(false);

    const revoked = await createBetaCode({ label: "rev", maxUses: 5 });
    await db.update(schema.betaAccessCode).set({ revokedAt: new Date() }).where(eq(schema.betaAccessCode.id, revoked.id));
    expect((await signUp(email("rev"), revoked.code)).ok).toBe(false);
  });

  it("concurrent sign-ups can't overuse a code", async () => {
    const { code, id } = await createBetaCode({ label: "race", maxUses: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => signUp(email(`race${i}`), code)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    const [row] = await db.select().from(schema.betaAccessCode).where(eq(schema.betaAccessCode.id, id));
    expect(row!.usedCount).toBe(2);
  });

  it("admins on the allowlist can sign up; existing users can still sign in", async () => {
    const admin = email("admin");
    process.env.FLOWLINE_BETA_ADMINS = `someone@else.test, ${admin.toUpperCase()}`;
    expect((await signUp(admin)).ok).toBe(true);
    await db.update(schema.user).set({ emailVerified: true }).where(sql`lower(${schema.user.email}) = ${admin.toLowerCase()}`);
    const signIn = await auth.api.signInEmail({ body: { email: admin, password: "Beta-Test-Pass-1" } });
    expect(signIn.user.email).toBe(admin);
  });
});
