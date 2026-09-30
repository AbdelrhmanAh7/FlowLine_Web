import { z } from "zod";
import { resolveBase } from "@/integrations/http";
import type { ProviderDef } from "@/integrations/types";
import { EgressError, safeFetch } from "./egress";
import { CLIENT_AUTH_ERRORS } from "./platform-probes";

/**
 * OAuth transport for integration providers (docs/security/CREDENTIALS_DESIGN.md MUST 11, 14, 15, 21).
 *
 * - Endpoints are the provider definitions' constants (reviewed code); only the client id/secret vary. Token calls
 *   use safeFetch with the exact expected host, NO redirects, a small response cap and a timeout.
 * - Token responses are schema-validated; anything else is a bounded error, never the provider's text.
 * - Errors are classified (CXH-14) — only a RECOGNIZED permanent grant failure may cost the user their connection:
 *   - `client_auth`: the APP's credentials were refused — never the user's fault, never expires a connection;
 *   - `grant`: the user's refresh token / code was permanently refused (invalid_grant and its provider aliases);
 *   - `transient`: rate limits (429), 408/425, 5xx, network failures, timeouts and the RFC 6749 transient codes —
 *     retry later (honouring Retry-After); the credentials are kept;
 *   - `unavailable`: anything else (an unrecognized error, a malformed response) — fails the operation, keeps credentials.
 */

/** Test env only: every provider's OAuth endpoints are the fake provider's uniform /oauth/<kind>. */
export function oauthUrl(provider: ProviderDef, kind: "authorize" | "token" | "revoke", url: string) {
  if (process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE) return `${resolveBase(provider)}/oauth/${kind}`;
  return url;
}

export function redirectUri() {
  return `${(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/oauth/callback`;
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(8192).optional(),
  expires_in: z.union([z.number().int().positive().max(10 * 365 * 86_400), z.string().regex(/^\d{1,9}$/).transform(Number)]).optional(),
  scope: z.string().max(4000).optional(),
  token_type: z.string().max(40).optional(),
});
export type TokenSet = z.infer<typeof tokenSchema>;

/** The user's grant was permanently refused (the only failures that expire a connection). */
const PERMANENT_GRANT_ERRORS = new Set(["invalid_grant", "access_denied", "expired_token", "bad_verification_code", "invalid_code", "code_already_used", "invalid_refresh_token", "bad_refresh_token", "token_revoked", "token_expired"]);
/** Temporary conditions (RFC 6749 §4.1.2.1 / RFC 8628 §3.5 and provider rate-limit codes): retry later. */
const TRANSIENT_ERRORS = new Set(["temporarily_unavailable", "server_error", "slow_down", "rate_limited", "ratelimited"]);
/** Other recognized codes we may surface (as codes only): request/configuration problems, not the user's grant. */
const OTHER_KNOWN_ERRORS = new Set(["invalid_request", "unsupported_grant_type", "invalid_scope"]);
/** HTTP statuses that mean "try again later". */
const TRANSIENT_STATUS = new Set([408, 425, 429]);
const MAX_RETRY_AFTER_MS = 60 * 60_000;

export type TokenFailureKind = "client_auth" | "grant" | "transient" | "unavailable";
export type TokenResult = { ok: true; tokens: TokenSet } | { ok: false; kind: TokenFailureKind; code: string; retryAfterMs?: number };

/** Provider error codes we may surface (as codes only). Anything else becomes "provider_error". */
export function boundedErrorCode(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  if (CLIENT_AUTH_ERRORS.has(s) || PERMANENT_GRANT_ERRORS.has(s) || TRANSIENT_ERRORS.has(s) || OTHER_KNOWN_ERRORS.has(s)) return s;
  return "provider_error";
}

/** Retry-After as delay-seconds or an HTTP-date (RFC 9110 §10.2.3); bounded; undefined when absent or unusable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  let ms: number;
  if (/^\d{1,9}$/.test(v)) ms = Number(v) * 1000;
  else {
    const at = Date.parse(v);
    if (Number.isNaN(at)) return undefined;
    ms = Math.max(0, at - now);
  }
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

function expectedHost(provider: ProviderDef, url: string) {
  // The configured endpoint's host is the only acceptable destination for a request carrying the client secret.
  const expected = new URL(oauthUrl(provider, "token", provider.oauth!.tokenUrl)).host;
  if (new URL(url).host !== expected) throw new EgressError("EGRESS_BLOCKED", "Unexpected OAuth endpoint host");
}

export async function tokenRequest(provider: ProviderDef, client: { clientId: string; secret: string }, params: Record<string, string>): Promise<TokenResult> {
  const o = provider.oauth!;
  const url = oauthUrl(provider, "token", o.tokenUrl);
  expectedHost(provider, url);
  const body = new URLSearchParams({ ...params, client_id: client.clientId, client_secret: client.secret });
  let res;
  try {
    res = await safeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
      timeoutMs: 15_000,
      maxBytes: 64 * 1024,
      maxRedirects: 0,
    });
  } catch {
    // Network failure, timeout, refused connection: nothing reached a decision about the grant.
    return { ok: false, kind: "transient", code: "provider_unreachable" };
  }
  const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
  const transientStatus = TRANSIENT_STATUS.has(res.status) || res.status >= 500;
  let data: Record<string, unknown> = {};
  try {
    data = res.json();
  } catch {
    if (transientStatus) return { ok: false, kind: "transient", code: res.status === 429 ? "rate_limited" : "provider_unavailable", retryAfterMs };
    return { ok: false, kind: "unavailable", code: "provider_error" };
  }
  // Slack wraps OAuth v2 responses: { ok, access_token | error }.
  if (data.ok === false || data.error || res.status >= 400) {
    const code = boundedErrorCode(data.error);
    if (CLIENT_AUTH_ERRORS.has(code) || res.status === 401) return { ok: false, kind: "client_auth", code: CLIENT_AUTH_ERRORS.has(code) ? code : "invalid_client" };
    if (transientStatus || TRANSIENT_ERRORS.has(code)) return { ok: false, kind: "transient", code: res.status === 429 ? "rate_limited" : TRANSIENT_ERRORS.has(code) ? code : "provider_unavailable", retryAfterMs };
    if (PERMANENT_GRANT_ERRORS.has(code)) return { ok: false, kind: "grant", code };
    return { ok: false, kind: "unavailable", code };
  }
  const parsed = tokenSchema.safeParse(data);
  if (!parsed.success) return { ok: false, kind: "unavailable", code: "malformed_token_response" };
  return { ok: true, tokens: parsed.data };
}

/**
 * Provider-specific revocation of a connection's grant at the provider. Returns what happened, honestly: local
 * deletion proceeds regardless (a remote failure never blocks it).
 */
export async function revokeAtProvider(provider: ProviderDef, tokens: { access?: string; refresh?: string }, client: { clientId: string; secret: string } | null): Promise<"revoked" | "failed" | "unsupported"> {
  const o = provider.oauth;
  // GitHub and Slack revoke by ACCESS token; Google revokes the whole grant best by its refresh token.
  const token = provider.id === "github" || provider.id === "slack" ? tokens.access : (tokens.refresh ?? tokens.access);
  if (!o || !token) return "unsupported";
  const testEnv = process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE;
  try {
    if (provider.id === "github") {
      // GitHub: DELETE /applications/{client_id}/grant with the APP's basic auth (the token alone can't revoke).
      if (!client) return "unsupported";
      const base = testEnv ? resolveBase(provider) : "https://api.github.com";
      const res = await safeFetch(`${base}/applications/${encodeURIComponent(client.clientId)}/grant`, {
        method: "DELETE",
        headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString("base64")}`, accept: "application/vnd.github+json", "content-type": "application/json" },
        body: JSON.stringify({ access_token: token }),
        timeoutMs: 8000,
        maxBytes: 16_384,
        maxRedirects: 0,
      });
      return res.status === 204 || res.status === 200 ? "revoked" : "failed";
    }
    if (provider.id === "slack") {
      // Slack: auth.revoke authenticates with the token itself.
      const url = oauthUrl(provider, "revoke", o.revokeUrl ?? "https://slack.com/api/auth.revoke");
      const res = await safeFetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), timeoutMs: 8000, maxBytes: 16_384, maxRedirects: 0 });
      return res.status < 300 ? "revoked" : "failed";
    }
    if (!o.revokeUrl) return "unsupported";
    // Google (RFC 7009 style): POST token=… to the fixed revoke endpoint.
    const res = await safeFetch(oauthUrl(provider, "revoke", o.revokeUrl), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString(), timeoutMs: 8000, maxBytes: 16_384, maxRedirects: 0 });
    return res.status < 300 ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}
