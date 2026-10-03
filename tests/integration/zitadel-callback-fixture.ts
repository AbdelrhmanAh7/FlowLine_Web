import { randomUUID } from "node:crypto";
import { vi, expect } from "vitest";
import { authFor } from "@/lib/auth";
import * as egress from "@/server/egress";
import { jwks, signedToken } from "./federation-fixture";
import { ORIGIN } from "./platform-helpers";

/** Real better-auth OIDC callbacks (including PKCE/state/nonce/JWKS), no server. */
export async function zitadelCallback(opts: { issuer: string; subject: string; email: string; next?: string }) {
  let jwt = "";
  const discovery = { issuer: opts.issuer, authorization_endpoint: `${opts.issuer}/authorize`, token_endpoint: `${opts.issuer}/oauth/v2/token`, userinfo_endpoint: `${opts.issuer}/oidc/v1/userinfo`, jwks_uri: `${opts.issuer}/jwks`, id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: ["client_secret_basic"] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/identity/zitadel/discovery") return Response.json(discovery);
    if (url.origin === opts.issuer && url.pathname === "/jwks") return Response.json(jwks);
    throw new Error(`Unexpected native-fetch request: ${url.pathname}`);
  }));
  vi.spyOn(egress, "safeFetch").mockImplementation(async (url, init) => {
    const target = new URL(String(url));
    let body: unknown;
    if (target.origin !== opts.issuer) throw new Error("Wrong issuer transport");
    if (target.pathname === "/oauth/v2/token") {
      expect(new URLSearchParams(String(init?.body)).get("code_verifier")).toBeTruthy();
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
      body = { access_token: "synthetic-access-token", id_token: jwt, expires_in: 300 };
    } else if (target.pathname === "/oidc/v1/userinfo") body = { sub: opts.subject, email: opts.email, email_verified: true, name: "Verified federated user" };
    else throw new Error(`Unexpected egress request: ${target.pathname}`);
    return { status: 200, json: () => body } as Awaited<ReturnType<typeof egress.safeFetch>>;
  });
  const instance = await authFor(`callback-fixture:${randomUUID()}`, {}, { issuer: opts.issuer, clientId: "test-zitadel-client", clientSecret: "synthetic-zitadel-secret" });
  expect((await instance.$context).socialProviders.some((p) => p.id === "zitadel")).toBe(true);
  const start = await instance.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ provider: "zitadel", callbackURL: opts.next ?? "/app" }) }));
  expect(start.status).toBe(200);
  const authorization = new URL((await start.json()).url);
  const nonce = authorization.searchParams.get("nonce");
  expect(nonce).toBeTruthy();
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  jwt = signedToken({ iss: opts.issuer, sub: opts.subject, aud: "test-zitadel-client", nonce, exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000), email: opts.email, email_verified: true });
  const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const response = await instance.handler(new Request(`${ORIGIN}/api/auth/callback/zitadel?state=${authorization.searchParams.get("state")}&code=synthetic-code`, { headers: { cookie } }));
  return { response, instance };
}

/** Real built-in social-provider callback, with only HTTP transport replaced. */
export async function githubCallback(opts: { subject: number; email: string; next: string }) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "synthetic-github-token", token_type: "bearer", scope: "read:user,user:email" });
    if (url.href === "https://api.github.com/user") return Response.json({ id: opts.subject, name: "Social factor test", login: "factor-test", email: opts.email });
    if (url.href === "https://api.github.com/user/emails") return Response.json([{ email: opts.email, verified: true, primary: true }]);
    throw new Error(`Unexpected GitHub fixture request: ${url.pathname}`);
  }));
  const instance = await authFor(`github-callback:${randomUUID()}`, { github: { clientId: "test-github-client", clientSecret: "synthetic-github-secret" } });
  const start = await instance.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ provider: "github", callbackURL: opts.next }) }));
  expect(start.status).toBe(200);
  const authorization = new URL((await start.json()).url);
  const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return instance.handler(new Request(`${ORIGIN}/api/auth/callback/github?state=${authorization.searchParams.get("state")}&code=synthetic-code`, { headers: { cookie } }));
}
