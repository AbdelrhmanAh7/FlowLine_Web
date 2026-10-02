import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "@/server/egress";
import { zitadelProvider } from "@/server/zitadel-auth";

vi.mock("@/server/egress", () => ({ safeFetch: vi.fn() }));

const fetchMock = vi.mocked(safeFetch);
const issuer = "https://example.zitadel.cloud";
const app = { issuer, clientId: "123@tenant", clientSecret: "secret:with!symbols" };
const idToken = (sub: string) => `e30.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;

beforeEach(() => { vi.resetAllMocks(); process.env.BETTER_AUTH_URL = "https://flowline.example"; });

describe("guarded ZITADEL requests", () => {
  it("uses Basic auth and PKCE at the fixed token endpoint without putting the secret in the body", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: () => ({ access_token: "at", id_token: "a.b.c", expires_in: 3600 }) } as never);
    const token = await zitadelProvider(app).getToken!({ code: "code", redirectURI: "https://flowline.example/api/auth/callback/zitadel", codeVerifier: "verifier" });
    expect(token.idToken).toBe("a.b.c");
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${issuer}/oauth/v2/token`);
    expect(options?.headers?.authorization).toMatch(/^Basic /);
    expect(options?.body).toContain("code_verifier=verifier");
    expect(options?.body).not.toContain("secret");
    expect(options?.maxRedirects).toBe(0);
  });

  it("rejects unverified email and userinfo subjects that differ from the verified ID token", async () => {
    const profile = { sub: "user-1", email: "user@example.com", email_verified: false };
    fetchMock.mockResolvedValue({ status: 200, json: () => profile } as never);
    const getUserInfo = zitadelProvider(app).getUserInfo!;
    expect(await getUserInfo({ accessToken: "at", idToken: idToken("user-1") })).toBeNull();
    profile.email_verified = true;
    expect(await getUserInfo({ accessToken: "at", idToken: idToken("different") })).toBeNull();
    expect(await getUserInfo({ accessToken: "at", idToken: idToken("user-1") })).toMatchObject({ sub: "user-1", emailVerified: true });
    expect(fetchMock.mock.calls.every(([url, opts]) => url === `${issuer}/oidc/v1/userinfo` && opts?.maxRedirects === 0)).toBe(true);
  });
});
