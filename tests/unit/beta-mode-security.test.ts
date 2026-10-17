import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowSignUp, betaMode, previewSignUp } from "@/server/beta";
import { auth } from "@/lib/auth";

const mocks = vi.hoisted(() => ({ select: vi.fn(), hook: undefined as undefined | ((user: { email: string }, ctx: unknown) => Promise<unknown>) }));
vi.mock("@/db", async () => ({ db: { select: mocks.select }, schema: await import("@/db/schema") }));
vi.mock("better-auth", () => ({ betterAuth: (options: { databaseHooks: { user: { create: { before: typeof mocks.hook } } } }) => {
  mocks.hook = options.databaseHooks.user.create.before;
  return { $context: Promise.resolve({}), api: {} };
} }));
vi.mock("@/server/email/flows", () => ({ issueAccountToken: vi.fn() }));
vi.mock("@/server/zitadel-auth", () => ({ zitadelProvider: vi.fn() }));

beforeEach(() => {
  mocks.select.mockReset();
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }));
  vi.stubEnv("FLOWLINE_BETA_ADMINS", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("beta configuration fails closed", () => {
  it.each(["beta", "production"])("defaults missing/empty/malformed modes to invite_only in %s, logs an error, and denies uninvited signup", async (env) => {
    vi.stubEnv("FLOWLINE_ENV", env);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const value of [undefined, "", "invite-only", "OPEN"]) {
      vi.stubEnv("FLOWLINE_BETA_MODE", value);
      error.mockClear();
      expect(betaMode()).toBe("invite_only");
      expect(error).toHaveBeenCalledWith(expect.stringContaining("FLOWLINE_BETA_MODE"));
      expect(await allowSignUp("uninvited@example.test")).toEqual({ ok: false });
      expect(await previewSignUp("uninvited@example.test")).toEqual({ ok: false });
      // The common better-auth create hook covers both password and social account creation.
      expect(auth).toBeDefined();
      for (const path of ["/sign-up/email", "/callback/google"]) {
        await expect(mocks.hook!({ email: "uninvited@example.test" }, { path, headers: new Headers({ cookie: "fl_test_beta_mode=open" }) }))
          .rejects.toMatchObject({ body: { code: "BETA_INVITE_REQUIRED" } });
      }
    }
  });

  it.each(["development", "test"])("keeps explicitly configured open mode in %s", async (env) => {
    vi.stubEnv("FLOWLINE_ENV", env); vi.stubEnv("FLOWLINE_BETA_MODE", "open");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(betaMode()).toBe("open");
    expect(await allowSignUp("uninvited@example.test")).toEqual({ ok: true, via: "open" });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("restricts cookie overrides to the exact test environment", () => {
    const headers = new Headers({ cookie: "fl_test_beta_mode=open" });
    vi.stubEnv("FLOWLINE_BETA_MODE", "invite_only");
    for (const env of ["beta", "production", "staging", "development"]) {
      vi.stubEnv("FLOWLINE_ENV", env);
      expect(betaMode(headers)).toBe("invite_only");
    }
    vi.stubEnv("FLOWLINE_ENV", "test");
    expect(betaMode(headers)).toBe("open");
  });
});
