import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  app: null as null | { id: string; publicId: string; secret: string; revision: number; previous: { secret: string; revision: number; validUntil: Date } | null },
  cookie: "better-auth.session_token=; Max-Age=0; Path=/", revokeDuringCallback: false,
  marked: vi.fn(), handler: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: {}, authFor: async () => ({}) }));
vi.mock("@/server/platform-secrets", () => ({
  resolvePlatformCredential: async (purpose: string) => purpose === "signin.github" ? fixture.app : null,
  markPlatformSecretVerified: fixture.marked,
}));
vi.mock("@/server/zitadel-config", () => ({ activeZitadelConfig: async () => null }));
vi.mock("@/db", async () => ({
  schema: await import("@/db/schema"),
  db: {
    select: () => ({ from: () => ({ where: async () => [{ secretId: "app-1", provider: "github", revision: 1 }] }) }),
    delete: () => ({ where: async () => {} }),
  },
}));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: fixture.handler, POST: fixture.handler }) }));
import { dispatchAuth, federatedProviderStamp, markFederatedProviderVerified } from "@/server/auth-dispatch";

beforeEach(() => {
  fixture.app = { id: "app-1", publicId: "client-1", secret: "synthetic-secret-1", revision: 1, previous: null };
  fixture.cookie = "better-auth.session_token=; Max-Age=0; Path=/";
  fixture.revokeDuringCallback = false;
  fixture.marked.mockReset().mockResolvedValue(undefined);
  fixture.handler.mockReset().mockImplementation(async () => {
    if (fixture.revokeDuringCallback) fixture.app = null;
    return new Response(null, { status: 302, headers: { location: "/auth/step-up", "set-cookie": fixture.cookie } });
  });
});
const callback = () => dispatchAuth(new Request("http://localhost:3100/api/auth/callback/github?state=synthetic-state&code=synthetic-code"), "GET");

describe("global provider authority fences", () => {
  it("marks only the same accepted app identity/revision after completed MFA", async () => {
    const stamp = (await federatedProviderStamp("github"))!;
    await markFederatedProviderVerified("github", stamp);
    expect(fixture.marked).toHaveBeenCalledExactlyOnceWith("signin.github", 1, "signin", "app-1");
    fixture.marked.mockClear();
    fixture.app!.id = "replacement-app";
    await markFederatedProviderVerified("github", stamp);
    expect(fixture.marked).not.toHaveBeenCalled();
  });
  it("invalidates the stamp after revocation, replacement and rotation", async () => {
    const original = await federatedProviderStamp("github");
    expect(original).toBeTruthy();
    fixture.app!.revision++;
    expect(await federatedProviderStamp("github")).not.toBe(original);
    fixture.app!.revision = 1;
    fixture.app!.id = "recreated-app";
    expect(await federatedProviderStamp("github")).not.toBe(original);
    fixture.app = null;
    expect(await federatedProviderStamp("github")).toBeNull();
    expect(await federatedProviderStamp("unconfigured")).toBeNull();
  });

  it("refuses an obsolete callback configuration while retaining explicit secret-rotation grace", async () => {
    const expected = { clientId: "client-1", clientSecret: "synthetic-secret-1" };
    expect(await federatedProviderStamp("github", expected)).toBeTruthy();
    fixture.app!.secret = "synthetic-secret-2";
    expect(await federatedProviderStamp("github", expected)).toBeNull();
    fixture.app!.previous = { secret: expected.clientSecret, revision: 1, validUntil: new Date(Date.now() + 60_000) };
    expect(await federatedProviderStamp("github", expected)).toBeTruthy();
    fixture.app!.previous.validUntil = new Date(0);
    expect(await federatedProviderStamp("github", expected)).toBeNull();
  });

  it("does not mark a provider verified for the deleted pre-MFA session cookie", async () => {
    expect((await callback()).headers.get("location")).toBe("/auth/step-up");
    expect(fixture.marked).not.toHaveBeenCalled();
    fixture.cookie = "better-auth.session_token=synthetic-issued-token; Path=/; HttpOnly";
    await callback();
    expect(fixture.marked).toHaveBeenCalledExactlyOnceWith("signin.github", 1, "signin");
  });

  it("does not publish callback cookies after the app is revoked during exchange", async () => {
    fixture.revokeDuringCallback = true;
    fixture.cookie = "better-auth.session_token=synthetic-issued-token; Path=/";
    const response = await callback();
    expect(response.headers.get("location")).toContain("error=signin_expired");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fixture.marked).not.toHaveBeenCalled();
  });
});
