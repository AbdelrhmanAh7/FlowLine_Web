import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { safeFetch } from "./egress";
import { zitadelLocalUrl } from "./zitadel-url";
import { basicClientAuthorization } from "./oidc";

export interface ZitadelApp { issuer: string; clientId: string; clientSecret: string }

/** OIDC identity is (issuer, subject), never a bare subject shared across issuers.
 * Legacy bare-subject accounts deliberately require an explicit re-link; their
 * issuer cannot be inferred safely from today's platform configuration.
 */
export function zitadelAccountId(issuer: string, subject: string): string {
  return `oidc:${Buffer.from(JSON.stringify([issuer, subject]), "utf8").toString("base64url")}`;
}

/**
 * Better Auth owns state, PKCE, nonce, callback and verified ID-token handling.
 * Outbound requests carrying credentials or identity use the guarded egress client.
 */
export function zitadelProvider(app: ZitadelApp): GenericOAuthConfig<"zitadel"> {
  const discoveryUrl = zitadelLocalUrl("discovery");
  if (!discoveryUrl) throw new Error("BETTER_AUTH_URL is required for ZITADEL sign-in");
  const tokenUrl = `${app.issuer}/oauth/v2/token`;
  const userInfoUrl = `${app.issuer}/oidc/v1/userinfo`;
  return {
    providerId: "zitadel",
    accountSubject: ({ profile }) => {
      if (typeof profile.sub !== "string" || !profile.sub) throw new Error("ZITADEL subject missing");
      return zitadelAccountId(app.issuer, profile.sub);
    },
    name: "ZITADEL",
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    discoveryUrl,
    requireIdTokenVerification: true,
    tokenEndpointAuth: { method: "client_secret_basic" },
    scopes: ["openid", "profile", "email"],
    pkce: true,
    disableProviderLogout: true,
    async getToken({ code, redirectURI, codeVerifier }) {
      if (!codeVerifier) throw new Error("ZITADEL PKCE verifier missing");
      const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectURI });
      body.set("code_verifier", codeVerifier);
      const res = await safeFetch(tokenUrl, { method: "POST", headers: { authorization: basicClientAuthorization(app.clientId, app.clientSecret), "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: body.toString(), timeoutMs: 12_000, maxBytes: 64 * 1024, maxRedirects: 0 });
      if (res.status !== 200) throw new Error("ZITADEL token exchange failed");
      const raw = res.json<Record<string, unknown>>();
      if (typeof raw.access_token !== "string" || typeof raw.id_token !== "string") throw new Error("ZITADEL response omitted required tokens");
      // Sign-in needs the short-lived access token only for this userinfo request. Do not
      // persist an unused refresh token: Better Auth's generic refresh path bypasses safeFetch.
      return { accessToken: raw.access_token, idToken: raw.id_token, expiresIn: typeof raw.expires_in === "number" ? raw.expires_in : undefined, tokenType: "Bearer" };
    },
    async getUserInfo(tokens) {
      // The plugin verifies this ID token against discovery JWKS, issuer, audience and nonce before invoking us.
      if (!tokens.idToken || !tokens.accessToken) return null;
      const res = await safeFetch(userInfoUrl, { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json" }, timeoutMs: 10_000, maxBytes: 64 * 1024, maxRedirects: 0 });
      if (res.status !== 200) return null;
      const raw = res.json<Record<string, unknown>>();
      const email = typeof raw.email === "string" ? raw.email.trim() : "";
      const sub = typeof raw.sub === "string" ? raw.sub : "";
      if (!sub || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || raw.email_verified !== true) return null;
      let tokenSub: unknown;
      try { tokenSub = JSON.parse(Buffer.from(tokens.idToken.split(".")[1] ?? "", "base64url").toString("utf8")).sub; } catch { return null; }
      if (tokenSub !== sub) return null;
      return { sub, id: zitadelAccountId(app.issuer, sub), email, emailVerified: true, name: typeof raw.name === "string" ? raw.name : email, image: typeof raw.picture === "string" ? raw.picture : undefined };
    },
  };
}
