import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { dispatchAuth } from "@/server/auth-dispatch";
import { TEST_AUTO_VERIFY_ENV } from "@/server/test-auto-verify";
import { closeDb } from "./helpers";

/**
 * Issue #124, CTO follow-up: the test-only sign-up auto-verify switch must be impossible to enable outside
 * FLOWLINE_ENV=test. Real HTTP through dispatchAuth (the same code path as the E2E stack), with the outcome asserted
 * from Postgres rows (user.emailVerified, verify tokens, emailed link in the outbox), never from return values.
 *
 * - FLOWLINE_ENV=staging ignores BOTH opt-ins (env var and cookie): the account stays unverified, still gets its
 *   verification e-mail and cannot sign in. A stray `FLOWLINE_TEST_AUTO_VERIFY` var logs exactly one configuration
 *   warning at the first sign-up attempt; the cookie is ignored silently.
 * - Under FLOWLINE_ENV=test each opt-in verifies the sign-up and sends no verification e-mail; without an opt-in the
 *   default behaviour is unchanged (unverified + verification e-mail).
 */
process.env.FLOWLINE_EMAIL_PROVIDER = "outbox";

const prevEnv = process.env.FLOWLINE_ENV;
const prevMode = process.env.FLOWLINE_BETA_MODE;
const prevAuto = process.env[TEST_AUTO_VERIFY_ENV];
afterEach(() => {
  process.env.FLOWLINE_ENV = prevEnv;
  process.env.FLOWLINE_BETA_MODE = prevMode;
  if (prevAuto === undefined) delete process.env[TEST_AUTO_VERIFY_ENV];
  else process.env[TEST_AUTO_VERIFY_ENV] = prevAuto;
  vi.restoreAllMocks();
});
afterAll(closeDb);

const BASE = "http://localhost:3100";
const PASSWORD = "Auto-Verify-Test-1";
const email = (p: string) => `${p}-${randomUUID().slice(0, 8)}@flowline-av.test`;

async function signUp(e: string, headers: Record<string, string> = {}) {
  const res = await dispatchAuth(new Request(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
    body: JSON.stringify({ email: e, password: PASSWORD, name: "Auto Verify" }),
  }), "POST");
  return { status: res.status, body: (await res.json().catch(() => null)) as { token: string | null; user?: { emailVerified?: boolean } } | null };
}

async function signIn(e: string) {
  const res = await dispatchAuth(new Request(`${BASE}/api/auth/sign-in/email`, {
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
  it("staging: a stray FLOWLINE_TEST_AUTO_VERIFY=1 is ignored (unverified + verification e-mail) and logs exactly one warning", async () => {
    process.env.FLOWLINE_ENV = "staging";
    process.env.FLOWLINE_BETA_MODE = "open";
    process.env[TEST_AUTO_VERIFY_ENV] = "1";
    const warnings = autoVerifyWarnings();
    const e = email("staging-env");

    const up = await signUp(e);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(false);
    expect(await stored(e)).toEqual({ emailVerified: false, tokens: 1, outbox: 1 });

    const signin = await signIn(e);
    expect(signin.status).toBe(403);
    expect(signin.body?.code).toBe("EMAIL_NOT_VERIFIED");

    const lines = warnings();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${TEST_AUTO_VERIFY_ENV} is ignored`);
  });

  it("staging: the fl_test_auto_verify=1 cookie is ignored silently (unverified + verification e-mail)", async () => {
    process.env.FLOWLINE_ENV = "staging";
    process.env.FLOWLINE_BETA_MODE = "open";
    delete process.env[TEST_AUTO_VERIFY_ENV];
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

  it("test: FLOWLINE_TEST_AUTO_VERIFY=1 verifies the sign-up and sends no verification e-mail", async () => {
    process.env.FLOWLINE_ENV = "test";
    process.env.FLOWLINE_BETA_MODE = "open";
    process.env[TEST_AUTO_VERIFY_ENV] = "1";
    const e = email("test-env");

    const up = await signUp(e);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(true);
    expect(await stored(e)).toEqual({ emailVerified: true, tokens: 0, outbox: 0 });
  });

  it("test: the fl_test_auto_verify=1 cookie verifies the sign-up and sends no verification e-mail", async () => {
    process.env.FLOWLINE_ENV = "test";
    process.env.FLOWLINE_BETA_MODE = "open";
    delete process.env[TEST_AUTO_VERIFY_ENV];
    const e = email("test-cookie");

    const up = await signUp(e, { cookie: "fl_test_auto_verify=1" });
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(true);
    expect(await stored(e)).toEqual({ emailVerified: true, tokens: 0, outbox: 0 });
  });

  it("test: without any opt-in the sign-up stays unverified and still gets its verification e-mail", async () => {
    process.env.FLOWLINE_ENV = "test";
    process.env.FLOWLINE_BETA_MODE = "open";
    delete process.env[TEST_AUTO_VERIFY_ENV];
    const e = email("test-plain");

    const up = await signUp(e);
    expect(up.status).toBe(200);
    expect(up.body?.user?.emailVerified).toBe(false);
    expect(await stored(e)).toEqual({ emailVerified: false, tokens: 1, outbox: 1 });
  });
});