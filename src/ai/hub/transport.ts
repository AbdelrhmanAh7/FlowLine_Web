import { isIP } from "node:net";
import { parseRetryAfter } from "@/integrations/http";
import { EgressError, safeFetch, type SafeResponse } from "@/server/egress";
import type { ProviderDefinition } from "./registry";
import { HubError } from "./types";

/**
 * The only way the hub talks to a provider. Every request:
 * - goes to the provider's documented base URL, and only to a host in its registry allowlist (checked before DNS);
 *   provider-specific fields (Alibaba region/workspace, Cloudflare account) are validated against the registry's
 *   anchored patterns BEFORE they are placed into a host or path, so a field can never redirect the request;
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

/**
 * Validates the non-secret connection settings against the registry: unknown keys are refused, every value must
 * match its field's anchored pattern, required fields must be present. Returns the cleaned settings.
 */
export function validateSettings(def: ProviderDefinition, settings: Record<string, string> = {}): Record<string, string> {
  if (settings.baseUrl) throw new HubError("AI_CUSTOM_ENDPOINT_NOT_APPROVED", `${def.name} doesn't accept a custom endpoint; custom endpoints need an owner-approved provider entry`);
  const fields = def.connectionFields ?? [];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(settings)) {
    const f = fields.find((x) => x.key === k);
    if (!f) throw new HubError("AI_SETTINGS_INVALID", `${def.name} has no setting "${k.slice(0, 40)}"`);
    const val = typeof v === "string" ? v.trim() : "";
    if (!val) continue;
    if (!new RegExp(f.pattern).test(val)) throw new HubError("AI_SETTINGS_INVALID", `${f.label} has an invalid value`);
    out[k] = val;
  }
  for (const f of fields) if (f.required && !out[f.key]) throw new HubError("AI_SETTINGS_INVALID", `${f.label} is required for ${def.name}`);
  return out;
}

/** Fills `{field}` placeholders from VALIDATED settings (values already matched the anchored patterns). */
function fill(template: string, def: ProviderDefinition, settings: Record<string, string>) {
  const clean = validateSettings(def, settings);
  return template.replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => {
    const v = clean[k];
    if (!v) throw new HubError("AI_SETTINGS_INVALID", `${def.name} needs the "${k}" setting`);
    return v;
  });
}

/** Documented base URL with settings filled in (no test override). */
function documentedBase(def: ProviderDefinition, settings: Record<string, string>) {
  if (!def.baseUrl) throw new HubError("AI_PROVIDER_NOT_AVAILABLE", `${def.name} isn't available`);
  return fill(def.baseUrl, def, settings).replace(/\/$/, "");
}

/** Base URL actually used for a provider (documented base, or the test double under FLOWLINE_ENV=test). */
export function resolveBaseUrl(def: ProviderDefinition, settings: Record<string, string> = {}): string {
  const base = documentedBase(def, settings);
  const override = testOverride();
  if (override) return `${override.origin}${override.pathname.replace(/\/$/, "")}/${def.id}${new URL(base).pathname.replace(/\/$/, "")}`;
  return base;
}

/** Origin (scheme + host) of the provider, for documented paths that are not under the base path. */
export function resolveOrigin(def: ProviderDefinition, settings: Record<string, string> = {}): string {
  const base = documentedBase(def, settings);
  const override = testOverride();
  if (override) return `${override.origin}${override.pathname.replace(/\/$/, "")}/${def.id}`;
  return new URL(base).origin;
}

/** Hosts the provider may be called on, with placeholders filled from validated settings. */
export function allowedHostsFor(def: ProviderDefinition, settings: Record<string, string> = {}): string[] {
  return def.allowedHosts.map((h) => (h.includes("{") ? fill(h, def, settings) : h).toLowerCase());
}

/** Host policy: https + exact registry host (or the test double's host:port in the test env). Throws HubError. */
export function assertAllowedUrl(def: ProviderDefinition, raw: string, settings: Record<string, string> = {}): URL {
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
  if (!allowedHostsFor(def, settings).includes(hostKey(u))) throw new HubError("AI_EGRESS_BLOCKED", `Host ${host} isn't an allowed ${def.name} endpoint`);
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

/** Non-secret headers: fixed provider headers + header-mapped connection fields (validated). */
export function providerHeaders(def: ProviderDefinition, settings: Record<string, string>): Record<string, string> {
  const clean = validateSettings(def, settings);
  const out: Record<string, string> = { ...(def.staticHeaders ?? {}) };
  for (const f of def.connectionFields ?? []) if (f.header && clean[f.key]) out[f.header] = clean[f.key]!;
  return out;
}

export interface HubRequest {
  method: "GET" | "POST";
  path: string;
  /** Resolve `path` against the provider origin instead of its base URL. */
  fromOrigin?: boolean;
  query?: Record<string, string | undefined>;
  json?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  /** Streaming body consumer (see safeFetch onChunk); the response body is then empty for 2xx. */
  onChunk?: (chunk: Uint8Array) => void | "stop";
}

export async function hubFetch(def: ProviderDefinition, apiKey: string, settings: Record<string, string>, req: HubRequest): Promise<SafeResponse> {
  if (def.transport !== "https") throw new HubError("AI_TRANSPORT_UNSUPPORTED", `The ${def.transport} transport is not implemented`);
  const path = req.path.includes("{") ? fill(req.path, def, settings) : req.path;
  const url = assertAllowedUrl(def, `${req.fromOrigin ? resolveOrigin(def, settings) : resolveBaseUrl(def, settings)}${path}`, settings);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: req.onChunk ? "text/event-stream" : "application/json", ...providerHeaders(def, settings), ...authHeaders(def, apiKey) };
  if (req.json !== undefined) headers["content-type"] = "application/json";
  let received = false;
  try {
    return await safeFetch(url.toString(), {
      method: req.method,
      headers,
      body: req.json !== undefined ? JSON.stringify(req.json) : null,
      timeoutMs: req.timeoutMs ?? 120_000,
      maxBytes: req.maxBytes ?? 4 * 1024 * 1024,
      maxRedirects: 0,
      signal: req.signal,
      onChunk: req.onChunk
        ? (c) => {
            received = true;
            return req.onChunk!(c);
          }
        : undefined,
    });
  } catch (e) {
    if (e instanceof HubError) throw e; // raised by a stream consumer (e.g. a mid-stream provider error)
    if (e instanceof EgressError) {
      if (e.code === "EGRESS_TOO_MANY_REDIRECTS") throw new HubError("AI_REDIRECT_REFUSED", `${def.name} answered with a redirect; redirects are never followed for AI providers`);
      if (e.code === "EGRESS_TOO_LARGE") throw new HubError("AI_RESPONSE_TOO_LARGE", `${def.name} sent a response larger than allowed`, { possibleCharge: true });
      throw new HubError("AI_EGRESS_BLOCKED", e.message);
    }
    if (req.signal?.aborted && req.signal.reason?.name !== "TimeoutError") throw e; // cancelled by the caller
    const name = (e as Error).name;
    // A request that was sent and then timed out (or a stream cut mid-way) may have been billed by the provider.
    if (name === "TimeoutError" || name === "AbortError") throw new HubError("AI_TIMEOUT", `${def.name} did not respond in time`, { retryable: true, possibleCharge: req.method === "POST" });
    if (received) throw new HubError("AI_STREAM_INTERRUPTED", `${def.name} closed the stream before it finished`, { retryable: true, possibleCharge: true });
    throw new HubError("AI_UNAVAILABLE", `${def.name} is unreachable`, { retryable: true });
  }
}

export { parseRetryAfter };
