import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { dispatchAuth } from "@/server/auth-dispatch";
import { TEST_AUTO_VERIFY_ENV } from "@/server/test-auto-verify";
import { closeDb, unique } from "./helpers";

/**
 * Issue #124, CTO follow-up: the test-only sign-up auto-verify switch must be impossible to enable outside
 * FLOWLINE_ENV=test. Real HTTP through dispatchAuth (the same code path as the E2E stack), with the outcome asserted
 * from Postgres rows (user.emailVerified, verify tokens, emailed link in the outbox), never from return values.
 *
 * - FLOWLINE_ENV=staging ignores BOTH opt-ins (env var and cookie): the account stays unverified, still gets its
 *   verification e-mail and cannot sign in. A stray `FLOWLINE_TEST_AUTO_VERIFY` var logs exactly one configuration
 *   warning when auth is built without the Next.js server (scripts, tests), before any sign-up, and the cookie is
 *   ignored silently; the server itself refuses to start with the var set (src/instrumentation.ts).
 * - Under FLOWLINE_ENV=test each opt-in verifies the sign-up and sends no verification e-mail; the server-wide switch
 *   also turns off requireEmailVerification, so that sign-up returns a session itself. Without an opt-in the default
 *   behaviour is unchanged (unverified + verification e-mail).
 */
process.env.FLOWLINE_EMAIL_PROVIDER = "outbox";

beforeEach(() => {
  vi.stubEnv("FLOWLINE_BETA_MODE", "open");
  vi.stubEnv(TEST_AUTO_VERIFY_ENV, "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(closeDb);

const BASE = "http://localhost:3100";
const PASSWORD = "Auto-Verify-Test-1";
const email = (p: string) => `${unique(p)}@flowline-av.test`;

async function signUp(e: string, headers: Record<string, string> = {}, dispatch = dispatchAuth) {
  const res = await dispatch(new Request(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify({ email: e, password: PASSWORD, name: "Auto Verify" }),
  }), "POST");
  return { status: res.status, body: (await res.json().catch(() => null)) as { token: string | null; user?: { emailVerified?: boolean } } | null };
}

async function signIn(e: string, dispatch = dispatchAuth) {
  const res = await dispatch(new Request(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: e, password: PASSWORD }),
  }), "POST");
  return { status: res.status, body: (await res.json().catch(() => null)) as { code?: string } | null };
}

/** Rows after a sign-up, read from the database: the verified flag, pending verify tokens, and outbox e-mails. */
async function stored(e: string) {
  const [user] = await db.select().from(schema.user).where(eq(schema.user.email, e));
  if (!user) return { emailVerified: null, tokens: 0, outbox: 0 };
  const tokens = await db.select({ id: schema.emailToken.id }).from(schema.emailToken).where(and(eq(schema.emailToken.userId, user.id), eq(schema.emailToken.purpose, "verify")));
  const outbox = await db.select({ id: schema.emailOutbox.id }).from(schema.emailOutbox).where(eq(schema.emailOutbox.recipient, e));
  return { emailVerified: user.emailVerified, tokens: tokens.length, outbox: outbox.length };
}

/** Silences console.error and returns a snapshot of the lines that name the switch. */
function autoVerifyWarnings() {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => error.mock.calls.map((c) => String(c[0])).filter((m) => m.includes(TEST_AUTO_VERIFY_ENV));
}

describe("sign-up auto-verify switch (#124)", () => {
  it("staging: auth built outside the Next.js server warns once for a stray FLOWLINE_TEST_AUTO_VERIFY=1 and ignores it (unverified + verification e-mail)", async () => {
    vi.stubEnv("FLOWLINE_ENV", "staging");
    vi.stubEnv(TEST_AUTO_VERIFY_ENV, "1");
    const warnings = autoVerifyWarnings();
    // Start a fresh server module graph under the staging env (the @/db pool is shared through globalThis): its
    // once-per-process flag starts unset whatever ran before, and building auth alone must log the warning.
    vi.resetModules();
    const fresh = (await import("@/server/auth-dispatch")).dispatchAuth;
    expect(warnings()).toHaveLength(1);
    const e = email("staging-env");

    const up = await signUp(e, {}, fresh);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(false);
    expect(await stored(e)).toEqual({ emailVerified: false, tokens: 1, outbox: 1 });

    const signin = await signIn(e, fresh);
    expect(signin.status).toBe(403);
    expect(signin.body?.code).toBe("EMAIL_NOT_VERIFIED");

    // Still one: sign-up and sign-in add no further warning.
    const lines = warnings();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${TEST_AUTO_VERIFY_ENV} is ignored`);
  });

  it("staging: the fl_test_auto_verify=1 cookie is ignored silently (unverified + verification e-mail)", async () => {
    vi.stubEnv("FLOWLINE_ENV", "staging");
    const warnings = autoVerifyWarnings();
    const e = email("staging-cookie");

    const up = await signUp(e, { cookie: "fl_test_auto_verify=1" });
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(false);
    expect(await stored(e)).toEqual({ emailVerified: false, tokens: 1, outbox: 1 });

    const signin = await signIn(e);
    expect(signin.status).toBe(403);
    expect(signin.body?.code).toBe("EMAIL_NOT_VERIFIED");

    expect(warnings()).toHaveLength(0);
  });

  it("test: FLOWLINE_TEST_AUTO_VERIFY=1 verifies the sign-up, signs it in at once and sends no verification e-mail", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    vi.stubEnv(TEST_AUTO_VERIFY_ENV, "1");
    // Build auth under the switch, as a test stack started with it does: requireEmailVerification is then off, so the
    // sign-up itself returns a session (spec AC1).
    vi.resetModules();
    const fresh = (await import("@/server/auth-dispatch")).dispatchAuth;
    const e = email("test-env");

    const up = await signUp(e, {}, fresh);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(true);
    expect(up.body?.token).toEqual(expect.any(String));
    expect(await stored(e)).toEqual({ emailVerified: true, tokens: 0, outbox: 0 });
  });

  it("test: the fl_test_auto_verify=1 cookie verifies the sign-up and sends no verification e-mail", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    const e = email("test-cookie");

    const up = await signUp(e, { cookie: "fl_test_auto_verify=1" });
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(true);
    // Verification is still required on this stack (spec AC2), so sign-up gives no session; the form signs in next.
    expect(up.body?.token).toBeNull();
    expect(await stored(e)).toEqual({ emailVerified: true, tokens: 0, outbox: 0 });
  });

  it("test: without any opt-in the sign-up stays unverified and still gets its verification e-mail", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    const e = email("test-plain");

    const up = await signUp(e);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(false);
    expect(up.body?.token).toBeNull();
    expect(await stored(e)).toEqual({ emailVerified: false, tokens: 1, outbox: 1 });
  });
});
