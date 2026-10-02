import { describe, expect, it, vi } from "vitest";
import { basicClientAuthorization } from "@/server/oidc";
import { zitadelIssuerSchema } from "@/server/platform-setting-schemas";
import { zitadelProvider } from "@/server/zitadel-auth";
import * as egress from "@/server/egress";

describe("platform ZITADEL configuration", () => {
  it("accepts only an exact HTTPS issuer origin", () => {
    expect(zitadelIssuerSchema.safeParse("https://example.zitadel.cloud").success).toBe(true);
    for (const value of ["http://example.zitadel.cloud", "https://example.zitadel.cloud/path", "https://example.zitadel.cloud?x=1", "https://user@example.zitadel.cloud", "https://example.zitadel.cloud/"])
      expect(zitadelIssuerSchema.safeParse(value).success).toBe(false);
  });

  it("form-encodes both client credentials for HTTP Basic", () => {
    const encoded = basicClientAuthorization("123@tenant", "secret:with!symbols");
    expect(Buffer.from(encoded.slice(6), "base64").toString()).toBe("123%40tenant:secret%3Awith%21symbols");
  });

  it("requires verified ID tokens and PKCE at the platform callback", () => {
    const old = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://flowline.example";
    try {
      const config = zitadelProvider({ issuer: "https://example.zitadel.cloud", clientId: "123@tenant", clientSecret: "secret" });
      expect(config.discoveryUrl).toBe("https://flowline.example/api/identity/zitadel/discovery");
      expect(config.requireIdTokenVerification).toBe(true);
      expect(config.pkce).toBe(true);
      expect(config.tokenEndpointAuth).toEqual({ method: "client_secret_basic" });
      expect(config.getToken).toBeTypeOf("function");
      expect(config.getUserInfo).toBeTypeOf("function");
    } finally { if (old === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = old; }
  });

  it("rejects caller-supplied ZITADEL ID tokens before loading a sign-in app", async () => {
    const oldDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/flowline_test";
    const request = new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "zitadel", idToken: { token: "untrusted" } }),
    });
    try {
      const { dispatchAuth } = await import("@/server/auth-dispatch");
      const response = await dispatchAuth(request, "POST");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "ZITADEL_CODE_FLOW_REQUIRED" });
    } finally {
      if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
    }
  });

  it("does not persist an unused refresh token from the code exchange", async () => {
    const old = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = "https://flowline.example";
    const fetch = vi.spyOn(egress, "safeFetch").mockResolvedValue({
      status: 200,
      json: () => ({ access_token: "access", id_token: "id.token.signature", refresh_token: "refresh" }),
    } as Awaited<ReturnType<typeof egress.safeFetch>>);
    try {
      const config = zitadelProvider({ issuer: "https://example.zitadel.cloud", clientId: "123@tenant", clientSecret: "secret" });
      const tokens = await config.getToken!({ code: "code", redirectURI: "https://flowline.example/api/auth/callback/zitadel", codeVerifier: "verifier" });
      expect(tokens.refreshToken).toBeUndefined();
      expect(tokens.accessToken).toBe("access");
    } finally {
      fetch.mockRestore();
      if (old === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = old;
    }
  });
});
