import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #124: the test-only sign-up auto-verify switch. It must be impossible to turn on unless FLOWLINE_ENV=test
 * (env or cookie), must need an explicit opt-in even there, and must only touch e-mail/password sign-ups after the
 * private-beta admission check.
 */
type Hook = (user: { email: string; emailVerified?: boolean }, ctx: unknown) => Promise<unknown>;
type SendVerification = (data: { user: { email: string; emailVerified: boolean }; url: string }, request?: Request) => Promise<void>;
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  issue: vi.fn(),
  options: undefined as undefined | { databaseHooks: { user: { create: { before: Hook } } }; emailVerification: { sendVerificationEmail: SendVerification } },
}));
vi.mock("@/db", async () => ({ db: { select: mocks.select }, schema: await import("@/db/schema") }));
vi.mock("better-auth", () => ({ betterAuth: (options: NonNullable<typeof mocks.options>) => {
  mocks.options = options;
  return { $context: Promise.resolve({}), api: {} };
} }));
vi.mock("@/server/email/flows", () => ({ issueAccountToken: mocks.issue }));
vi.mock("@/server/zitadel-auth", () => ({ zitadelProvider: vi.fn() }));

const OPT_IN_COOKIE = new Headers({ cookie: "fl_test_beta_mode=open; fl_test_auto_verify=1" });
const PLAIN = new Headers({ cookie: "fl_test_beta_mode=open" });

async function load() {
  vi.resetModules();
  await import("@/lib/auth");
  const { autoVerifySignUps } = await import("@/server/test-auto-verify");
  const o = mocks.options!;
  return { autoVerifySignUps, before: o.databaseHooks.user.create.before, send: o.emailVerification.sendVerificationEmail };
}

beforeEach(() => {
  mocks.select.mockReset();
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }));
  mocks.issue.mockReset();
  vi.stubEnv("FLOWLINE_BETA_MODE", "open");
  vi.stubEnv("FLOWLINE_BETA_ADMINS", "");
  vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("auto-verify is impossible outside FLOWLINE_ENV=test", () => {
  it.each([undefined, "", "production", "staging", "beta", "development", "Test", "test "])("ignores both opt-ins with FLOWLINE_ENV=%s and logs once", async (env) => {
    vi.stubEnv("FLOWLINE_ENV", env as string);
    vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", "1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { autoVerifySignUps, before } = await load();
    expect(autoVerifySignUps(OPT_IN_COOKIE)).toBe(false);
    expect(autoVerifySignUps(null)).toBe(false);
    expect(await before({ email: "x@example.test" }, { path: "/sign-up/email", headers: OPT_IN_COOKIE })).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain("FLOWLINE_TEST_AUTO_VERIFY is ignored");
  });

  it("stays silent when the switch is not set", async () => {
    vi.stubEnv("FLOWLINE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { autoVerifySignUps } = await load();
    expect(autoVerifySignUps(OPT_IN_COOKIE)).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("under FLOWLINE_ENV=test it needs an explicit opt-in", () => {
  beforeEach(() => vi.stubEnv("FLOWLINE_ENV", "test"));

  it("is off by default and for any value other than exactly 1", async () => {
    const { autoVerifySignUps } = await load();
    expect(autoVerifySignUps(PLAIN)).toBe(false);
    expect(autoVerifySignUps(null)).toBe(false);
    for (const v of ["true", "yes", "0", " 1", "on"]) {
      vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", v);
      expect(autoVerifySignUps(PLAIN), v).toBe(false);
      expect(autoVerifySignUps(new Headers({ cookie: `fl_test_auto_verify=${v}` })), v).toBe(false);
    }
    expect(autoVerifySignUps(new Headers({ cookie: "xfl_test_auto_verify=1" }))).toBe(false);
  });

  it("is on with FLOWLINE_TEST_AUTO_VERIFY=1 (server-wide) or the per-context cookie", async () => {
    const { autoVerifySignUps } = await load();
    expect(autoVerifySignUps(OPT_IN_COOKIE)).toBe(true);
    vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", "1");
    expect(autoVerifySignUps(null)).toBe(true);
    expect(autoVerifySignUps(PLAIN)).toBe(true);
  });

  it("marks an opted-in e-mail sign-up verified and sends it no verification link", async () => {
    const { before, send } = await load();
    expect(await before({ email: "a@example.test", emailVerified: false }, { path: "/sign-up/email", headers: OPT_IN_COOKIE }))
      .toEqual({ data: { email: "a@example.test", emailVerified: true } });
    const request = new Request("http://localhost/api/auth/sign-up/email", { headers: OPT_IN_COOKIE });
    await send({ user: { email: "a@example.test", emailVerified: true }, url: "http://localhost/verify-email?token=t" }, request);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("leaves a sign-up without the opt-in unverified and still sends its link", async () => {
    const { before, send } = await load();
    expect(await before({ email: "b@example.test", emailVerified: false }, { path: "/sign-up/email", headers: PLAIN })).toBeUndefined();
    const request = new Request("http://localhost/api/auth/sign-up/email", { headers: PLAIN });
    await send({ user: { email: "b@example.test", emailVerified: false }, url: "http://localhost/verify-email?token=t" }, request);
    expect(mocks.issue).toHaveBeenCalledWith("verify", expect.objectContaining({ email: "b@example.test" }), request, { callbackURL: null });
  });

  it("does not touch social sign-ups (the provider's verified flag stands)", async () => {
    vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", "1");
    const { before } = await load();
    expect(await before({ email: "c@example.test", emailVerified: false }, { path: "/callback/google", headers: PLAIN })).toBeUndefined();
  });

  it("still refuses an uninvited sign-up in invite_only mode", async () => {
    vi.stubEnv("FLOWLINE_TEST_AUTO_VERIFY", "1");
    vi.stubEnv("FLOWLINE_BETA_MODE", "invite_only");
    const { before } = await load();
    await expect(before({ email: "d@example.test" }, { path: "/sign-up/email", headers: new Headers() }))
      .rejects.toMatchObject({ body: { code: "BETA_INVITE_REQUIRED" } });
  });
});
