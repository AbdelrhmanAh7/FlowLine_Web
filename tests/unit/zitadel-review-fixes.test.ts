import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/egress", () => ({ safeFetch: vi.fn() }));
vi.mock("@/server/platform-settings", () => ({ getSetting: vi.fn() }));
vi.mock("@/server/platform-secrets", () => ({ resolvePlatformCredential: vi.fn() }));

import { createMetadataCache, METADATA_FAIL_TTL_MS, METADATA_OK_TTL_MS } from "@/server/zitadel-metadata";

describe("ZITADEL metadata cache", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => { t = 1_000; });

  it("singleflights concurrent misses and serves hits within the TTL", async () => {
    const load = vi.fn(async (issuer: string) => ({ issuer }));
    const cache = createMetadataCache(load, now);
    const [a, b] = await Promise.all([cache.get("https://i.example", 1), cache.get("https://i.example", 1)]);
    expect(a).toBe(b);
    await cache.get("https://i.example", 1);
    expect(load).toHaveBeenCalledTimes(1);
    t += METADATA_OK_TTL_MS + 1;
    await cache.get("https://i.example", 1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidates on a new issuer revision or issuer", async () => {
    const load = vi.fn(async (issuer: string) => ({ issuer }));
    const cache = createMetadataCache(load, now);
    await cache.get("https://i.example", 1);
    await cache.get("https://i.example", 2);
    await cache.get("https://other.example", 2);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("recovers after an outage: the failure is cached only briefly, never forever", async () => {
    const load = vi.fn<(issuer: string) => Promise<string>>().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
    const cache = createMetadataCache(load, now);
    await expect(cache.get("https://i.example", 1)).rejects.toThrow("down");
    await expect(cache.get("https://i.example", 1)).rejects.toThrow("down"); // inside the short failure window
    expect(load).toHaveBeenCalledTimes(1);
    t += METADATA_FAIL_TTL_MS + 1;
    await expect(cache.get("https://i.example", 1)).resolves.toBe("ok");
  });

  it("is bounded", async () => {
    const load = vi.fn(async (issuer: string) => issuer);
    const cache = createMetadataCache(load, now);
    for (let i = 0; i < 20; i++) await cache.get(`https://i${i}.example`, 1);
    await cache.get("https://i0.example", 1);
    expect(load).toHaveBeenCalledTimes(21);
  });
});

describe("authFor (ZITADEL provider readiness)", () => {
  const providers: { id: string }[][] = [];
  const build = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    providers.length = 0;
    build.mockReset();
    build.mockImplementation(() => ({ $context: Promise.resolve({ socialProviders: providers.shift() ?? [] }) }));
    vi.doMock("better-auth", () => ({ betterAuth: build }));
    vi.doMock("better-auth/api", () => ({ APIError: class extends Error {} }));
    vi.doMock("better-auth/plugins/two-factor", () => ({ twoFactor: () => ({}) }));
    vi.doMock("better-auth/plugins/generic-oauth", () => ({ genericOAuth: () => ({}) }));
    vi.doMock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => () => ({}) }));
    vi.doMock("better-auth/next-js", () => ({ nextCookies: () => ({}) }));
    vi.doMock("@/db", () => ({ db: {}, schema: {} }));
    vi.doMock("@/server/redact", () => ({ redactString: (s: string) => s, safeErrorText: String }));
    vi.doMock("@/server/auth-token-adapter", () => ({ wrapAccountTokenEncryption: (a: unknown) => a }));
    vi.doMock("@/server/beta", () => ({ allowSignUp: vi.fn(), BETA_REFUSAL: "", betaMode: vi.fn() }));
    vi.doMock("@/server/email/flows", () => ({ issueAccountToken: vi.fn() }));
    vi.doMock("@/server/telemetry", () => ({ track: vi.fn() }));
    vi.doMock("@/server/zitadel-auth", () => ({ zitadelProvider: () => ({}) }));
    vi.doMock("@/server/federated-mfa", () => ({ federatedMfa: () => ({}) }));
    process.env.BETTER_AUTH_URL = "https://flowline.example";
  });
  afterEach(() => { vi.useRealTimers(); });

  const app = { issuer: "https://i.example", clientId: "c", clientSecret: "s" };

  it("does not cache an instance whose ZITADEL provider failed to load; recovers after the retry window", async () => {
    const { authFor, ZITADEL_RETRY_MS } = await import("@/lib/auth");
    build.mockClear(); // the module-level base instance
    providers.push([]); // first discovery failed: provider skipped
    const broken = await authFor("k", {}, app);
    expect(await authFor("k", {}, app)).toBe(broken); // short failure window: no hammering
    expect(build).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ZITADEL_RETRY_MS + 1);
    providers.push([{ id: "zitadel" }]);
    const healthy = await authFor("k", {}, app);
    expect(healthy).not.toBe(broken);
    expect(await authFor("k", {}, app)).toBe(healthy); // healthy instances stay cached
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected initialization as not ready and shares concurrent builds", async () => {
    const { authFor } = await import("@/lib/auth");
    build.mockClear();
    build.mockImplementationOnce(() => ({ $context: Promise.reject(new Error("init failed")) }));
    const [a, b] = await Promise.all([authFor("x", {}, app), authFor("x", {}, app)]);
    expect(a).toBe(b);
    expect(build).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchAuth social POST body guard", () => {
  it("rejects form-encoded and malformed bodies before better-auth, and keeps the idToken block", async () => {
    vi.resetModules();
    const handler = vi.fn(async () => new Response("{}"));
    vi.doMock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: handler, POST: handler }) }));
    vi.doMock("@/db", () => ({ db: {}, schema: {} }));
    vi.doMock("@/lib/auth", () => ({ auth: {}, authFor: vi.fn(async () => ({})) }));
    vi.doMock("@/server/crypto", () => ({ sha256Hex: String }));
    vi.doMock("@/server/platform-secrets", () => ({ markPlatformSecretVerified: vi.fn(), resolvePlatformCredential: vi.fn(async () => null) }));
    vi.doMock("@/server/platform-settings", () => ({ getSetting: vi.fn() }));
    const { dispatchAuth } = await import("@/server/auth-dispatch");
    const post = (body: string, type?: string) =>
      dispatchAuth(new Request("https://flowline.example/api/auth/sign-in/social", { method: "POST", body, headers: type ? { "content-type": type } : {} }), "POST");

    expect((await post("provider=zitadel&idToken=x", "application/x-www-form-urlencoded")).status).toBe(415);
    expect((await post('{"provider":"google"}')).status).toBe(415);
    expect((await post("{nope", "application/json")).status).toBe(400);
    expect((await post("[]", "application/json")).status).toBe(400);
    expect((await post('{"provider":"zitadel","idToken":{"token":"t"}}', "application/json; charset=utf-8")).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();

    expect((await post('{"provider":"google"}', "application/json")).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    // Other paths are untouched by the guard.
    const other = await dispatchAuth(new Request("https://flowline.example/api/auth/sign-in/email", { method: "POST", body: "a=b", headers: { "content-type": "application/x-www-form-urlencoded" } }), "POST");
    expect(other.status).toBe(200);
  });
});
