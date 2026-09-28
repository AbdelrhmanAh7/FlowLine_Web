import { isIP } from "node:net";
import { parseRetryAfter } from "@/integrations/http";
import { EgressError, safeFetch, type SafeResponse } from "@/server/egress";
import type { ProviderDefinition } from "./registry";
import { HubError } from "./types";

/**
 * The only way the hub talks to a provider. Every request:
 * - goes to the provider's documented base URL, and only to a host in its registry allowlist (checked before DNS);
 * - goes through safeFetch (public addresses only, DNS pinned at connect time → no rebinding, size cap, timeout);
 * - never follows a redirect (maxRedirects 0): an API endpoint that redirects is refused, so credentials can never
 *   be forwarded to another origin;
 * - carries the key only in the provider's auth header, never in the URL.
 *
 * Test doubles: ONLY when FLOWLINE_ENV=test, FLOWLINE_AI_TEST_OVERRIDE (e.g. http://127.0.0.1:4011) replaces the
 * provider origin with `<override>/<providerId><documented path>` and that single host:port is allowlisted. The
 * variable is ignored in every other environment (staging/beta/production never set FLOWLINE_ENV=test).
 */

export function testOverride(): URL | null {
  if (process.env.FLOWLINE_ENV !== "test") return null;
  const raw = process.env.FLOWLINE_AI_TEST_OVERRIDE?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function hostKey(u: URL) {
  return u.port ? `${u.hostname.toLowerCase()}:${u.port}` : u.hostname.toLowerCase();
}

/** Base URL actually used for a provider (documented base, or the test double under FLOWLINE_ENV=test). */
export function resolveBaseUrl(def: ProviderDefinition, settings: Record<string, string> = {}): string {
  if (settings.baseUrl) throw new HubError("AI_CUSTOM_ENDPOINT_NOT_APPROVED", `${def.name} doesn't accept a custom endpoint; custom endpoints need an owner-approved provider entry`);
  if (!def.baseUrl) throw new HubError("AI_PROVIDER_NOT_AVAILABLE", `${def.name} isn't available yet`);
  const override = testOverride();
  if (override) return `${override.origin}${override.pathname.replace(/\/$/, "")}/${def.id}${new URL(def.baseUrl).pathname.replace(/\/$/, "")}`;
  return def.baseUrl.replace(/\/$/, "");
}

/** Host policy: https + exact registry host (or the test double's host:port in the test env). Throws HubError. */
export function assertAllowedUrl(def: ProviderDefinition, raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HubError("AI_EGRESS_BLOCKED", "Invalid provider URL");
  }
  if (u.username || u.password) throw new HubError("AI_EGRESS_BLOCKED", "Credentials in URLs are not allowed");
  const override = testOverride();
  if (override && u.origin === override.origin) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (u.protocol !== "https:") throw new HubError("AI_EGRESS_BLOCKED", `${def.name} must be called over https`);
  if (isIP(host)) throw new HubError("AI_EGRESS_BLOCKED", `${def.name} can't be called by IP address`);
  if (!def.allowedHosts.map((h) => h.toLowerCase()).includes(hostKey(u))) throw new HubError("AI_EGRESS_BLOCKED", `Host ${host} isn't an allowed ${def.name} endpoint`);
  return u;
}

function authHeaders(def: ProviderDefinition, apiKey: string): Record<string, string> {
  switch (def.auth) {
    case "bearer":
      return { authorization: `Bearer ${apiKey}` };
    case "x-api-key":
      return { "x-api-key": apiKey };
    case "x-goog-api-key":
      return { "x-goog-api-key": apiKey };
    default:
      return {};
  }
}

export interface HubRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  json?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

export async function hubFetch(def: ProviderDefinition, apiKey: string, settings: Record<string, string>, req: HubRequest): Promise<SafeResponse> {
  if (def.transport !== "https") throw new HubError("AI_TRANSPORT_UNSUPPORTED", `The ${def.transport} transport is not implemented`);
  const url = assertAllowedUrl(def, `${resolveBaseUrl(def, settings)}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json", ...authHeaders(def, apiKey) };
  if (req.json !== undefined) headers["content-type"] = "application/json";
  try {
    return await safeFetch(url.toString(), {
      method: req.method,
      headers,
      body: req.json !== undefined ? JSON.stringify(req.json) : null,
      timeoutMs: req.timeoutMs ?? 120_000,
      maxBytes: req.maxBytes ?? 4 * 1024 * 1024,
      maxRedirects: 0,
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof EgressError) {
      if (e.code === "EGRESS_TOO_MANY_REDIRECTS") throw new HubError("AI_REDIRECT_REFUSED", `${def.name} answered with a redirect; redirects are never followed for AI providers`);
      if (e.code === "EGRESS_TOO_LARGE") throw new HubError("AI_RESPONSE_TOO_LARGE", `${def.name} sent a response larger than allowed`);
      throw new HubError("AI_EGRESS_BLOCKED", e.message);
    }
    if (req.signal?.aborted && req.signal.reason?.name !== "TimeoutError") throw e; // cancelled by the caller
    const name = (e as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw new HubError("AI_TIMEOUT", `${def.name} did not respond in time`, { retryable: true });
    throw new HubError("AI_UNAVAILABLE", `${def.name} is unreachable`, { retryable: true });
  }
}

export { parseRetryAfter };
