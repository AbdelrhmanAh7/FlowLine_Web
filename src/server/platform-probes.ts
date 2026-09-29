import { safeFetch } from "./egress";
import type { PurposeDef } from "./platform-purposes";
import type { ProbeResult } from "./platform-secrets";

/**
 * Fixed probe endpoints (reviewed code, never configurable). In the test environment only, requests go to the local
 * fake providers (FLOWLINE_PROVIDER_OVERRIDE), exactly like every other provider call.
 */
const OAUTH_TOKEN_URL: Record<string, string> = {
  google: "https://oauth2.googleapis.com/token",
  github: "https://github.com/login/oauth/access_token",
  slack: "https://slack.com/api/oauth.v2.access",
};
const FAKE_PROVIDER: Record<string, string> = { google: "google_sheets", github: "github", slack: "slack", resend: "resend", postmark: "postmark", paddle: "paddle", stripe: "stripe" };

function testBase(provider: string): string | null {
  if (process.env.FLOWLINE_ENV !== "test" || !process.env.FLOWLINE_PROVIDER_OVERRIDE) return null;
  return `${process.env.FLOWLINE_PROVIDER_OVERRIDE.replace(/\/$/, "")}/${FAKE_PROVIDER[provider] ?? provider}`;
}

/** Codes that mean "the CLIENT credentials were refused" (vs. a bad grant / code, which proves nothing more). */
export const CLIENT_AUTH_ERRORS = new Set(["invalid_client", "unauthorized_client", "incorrect_client_credentials", "invalid_client_id", "bad_client_secret"]);

async function oauthProbe(provider: string, clientId: string, secret: string): Promise<ProbeResult> {
  const base = testBase(provider);
  const url = base ? `${base}/oauth/token` : OAUTH_TOKEN_URL[provider];
  if (!url) return "unreachable";
  const grant: Record<string, string> = provider === "google" ? { grant_type: "refresh_token", refresh_token: "flowline-credential-probe" } : { grant_type: "authorization_code", code: "flowline-credential-probe" };
  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ ...grant, client_id: clientId, client_secret: secret }).toString(),
      timeoutMs: 15_000,
      maxBytes: 16_384,
      maxRedirects: 0,
    });
    let error = "";
    try {
      error = String((res.json() as { error?: unknown }).error ?? "");
    } catch {
      /* non-JSON: classify by status only */
    }
    if (CLIENT_AUTH_ERRORS.has(error) || res.status === 401) return "rejected";
    return res.status >= 500 ? "unreachable" : "client_accepted";
  } catch {
    return "unreachable";
  }
}

async function authProbe(url: string, headers: Record<string, string>): Promise<ProbeResult> {
  try {
    const res = await safeFetch(url, { method: "GET", headers: { accept: "application/json", ...headers }, timeoutMs: 15_000, maxBytes: 65_536, maxRedirects: 0 });
    if (res.status === 401 || res.status === 403) return "rejected";
    if (res.status >= 200 && res.status < 300) return "accepted";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function runProbe(def: PurposeDef, publicId: string | null, secret: string): Promise<ProbeResult> {
  switch (def.kind) {
    case "oauth_signin":
    case "oauth_integration":
      return oauthProbe(def.provider, publicId ?? "", secret);
    case "email":
      if (def.provider === "resend") return authProbe(`${testBase("resend") ?? "https://api.resend.com"}/domains`, { authorization: `Bearer ${secret}` });
      return authProbe(`${testBase("postmark") ?? "https://api.postmarkapp.com"}/server`, { "x-postmark-server-token": secret });
    case "billing_api":
      if (def.provider === "paddle") return authProbe(`${testBase("paddle") ?? "https://sandbox-api.paddle.com"}/event-types`, { authorization: `Bearer ${secret}` });
      return authProbe(`${testBase("stripe") ?? "https://api.stripe.com"}/v1/balance`, { authorization: `Bearer ${secret}` });
    case "billing_webhook":
      // A signing secret can't be checked remotely; it is verified by the next correctly signed delivery.
      return "client_accepted";
  }
}
