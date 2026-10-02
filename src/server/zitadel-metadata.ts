import { activeZitadelConfig } from "./zitadel-config";
import { safeFetch } from "./egress";
export { zitadelLocalUrl } from "./zitadel-url";

/** Fixed owner-configured source. These routes never accept a caller-provided URL. */
export async function activeZitadelSource(): Promise<{ issuer: string; revision: number } | null> {
  const config = await activeZitadelConfig();
  return config ? { issuer: config.issuer, revision: config.issuerRevision } : null;
}

export async function activeZitadelIssuer(): Promise<string | null> {
  return (await activeZitadelSource())?.issuer ?? null;
}

// Only standard, public OIDC metadata is relayed. In particular, provider extensions are not copied into the
// anonymous discovery endpoint where an accidental secret-bearing extension would become public.
const PUBLIC_DISCOVERY_FIELDS = [
  "issuer", "authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri",
  "response_types_supported", "response_modes_supported", "grant_types_supported", "subject_types_supported",
  "id_token_signing_alg_values_supported", "token_endpoint_auth_methods_supported",
  "token_endpoint_auth_signing_alg_values_supported", "userinfo_signing_alg_values_supported",
  "request_object_signing_alg_values_supported", "scopes_supported", "claims_supported",
  "code_challenge_methods_supported", "claims_parameter_supported", "request_parameter_supported",
  "request_uri_parameter_supported", "require_request_uri_registration", "claim_types_supported",
  "display_values_supported", "acr_values_supported", "ui_locales_supported",
  "authorization_response_iss_parameter_supported", "frontchannel_logout_supported",
  "frontchannel_logout_session_supported", "backchannel_logout_supported",
  "backchannel_logout_session_supported", "service_documentation", "op_policy_uri", "op_tos_uri",
] as const;
const PUBLIC_DISCOVERY_ARRAYS = new Set<string>(PUBLIC_DISCOVERY_FIELDS.filter((field) => field.endsWith("_supported") || ["scopes_supported", "claims_supported", "claim_types_supported", "display_values_supported", "acr_values_supported", "ui_locales_supported"].includes(field)));
const PUBLIC_DISCOVERY_BOOLEANS = new Set([
  "claims_parameter_supported", "request_parameter_supported", "request_uri_parameter_supported",
  "require_request_uri_registration", "authorization_response_iss_parameter_supported",
  "frontchannel_logout_supported", "frontchannel_logout_session_supported", "backchannel_logout_supported",
  "backchannel_logout_session_supported",
]);

/** Copy only public standard OIDC fields with their expected JSON types. */
export function filterPublicDiscovery(doc: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of PUBLIC_DISCOVERY_FIELDS) {
    const value = doc[field];
    if (typeof value === "string") result[field] = value;
    else if (PUBLIC_DISCOVERY_ARRAYS.has(field) && Array.isArray(value) && value.every((item) => typeof item === "string")) result[field] = value;
    else if (PUBLIC_DISCOVERY_BOOLEANS.has(field) && typeof value === "boolean") result[field] = value;
  }
  return result;
}

const PUBLIC_RSA_JWK_FIELDS = ["kty", "kid", "use", "alg", "n", "e", "key_ops", "x5c", "x5t", "x5t#S256"] as const;

/** Return only public RSA signing keys suitable for RS256 verification; private/unknown members are never relayed. */
export function filterPublicRsaSigningKeys(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const result: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const key = item as Record<string, unknown>;
    if (key.kty !== "RSA" || typeof key.kid !== "string" || !key.kid || typeof key.n !== "string" || !key.n || typeof key.e !== "string" || !key.e) continue;
    if (key.alg !== undefined && key.alg !== "RS256") continue;
    if (key.use !== undefined && key.use !== "sig") continue;
    if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes("verify") || !key.key_ops.every((operation) => operation === "verify"))) continue;
    if (key.x5c !== undefined && (!Array.isArray(key.x5c) || !key.x5c.every((cert) => typeof cert === "string"))) continue;
    if (key.x5t !== undefined && typeof key.x5t !== "string") continue;
    if (key["x5t#S256"] !== undefined && typeof key["x5t#S256"] !== "string") continue;
    const clean: Record<string, unknown> = {};
    for (const field of PUBLIC_RSA_JWK_FIELDS) {
      const fieldValue = key[field];
      if (fieldValue !== undefined) clean[field] = field === "key_ops" ? ["verify"] : fieldValue;
    }
    result.push(clean);
  }
  return result;
}

export async function zitadelDiscovery(issuer: string): Promise<Record<string, unknown>> {
  const res = await safeFetch(`${issuer}/.well-known/openid-configuration`, { headers: { accept: "application/json" }, timeoutMs: 8_000, maxBytes: 128 * 1024, maxRedirects: 0 });
  if (res.status !== 200) throw new Error("ZITADEL discovery unavailable");
  const doc = res.json<Record<string, unknown>>();
  if (doc.issuer !== issuer || !["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "jwks_uri"].every((k) => {
    try { const u = new URL(doc[k] as string); return typeof doc[k] === "string" && u.origin === issuer && !u.username && !u.password; } catch { return false; }
  })) throw new Error("ZITADEL discovery did not match the configured issuer");
  if (!Array.isArray(doc.token_endpoint_auth_methods_supported) || !doc.token_endpoint_auth_methods_supported.includes("client_secret_basic")) throw new Error("ZITADEL Basic authentication unavailable");
  if (!Array.isArray(doc.id_token_signing_alg_values_supported) || !doc.id_token_signing_alg_values_supported.includes("RS256")) throw new Error("ZITADEL signing metadata unavailable");
  return filterPublicDiscovery(doc);
}

export async function zitadelJwks(jwksUri: string): Promise<{ keys: unknown[] }> {
  const res = await safeFetch(jwksUri, { headers: { accept: "application/json" }, timeoutMs: 8_000, maxBytes: 256 * 1024, maxRedirects: 0 });
  if (res.status !== 200) throw new Error("JWKS unavailable");
  const keys = res.json<{ keys?: unknown }>();
  if (!Array.isArray(keys.keys)) throw new Error("Invalid JWKS");
  return { keys: filterPublicRsaSigningKeys(keys.keys) };
}

/**
 * Small in-memory cache for the public discovery/JWKS routes, so anonymous requests cannot fan out to the owner's
 * ZITADEL instance. Keyed by issuer + the issuer setting's revision (an issuer change or re-save never serves stale
 * metadata). Concurrent misses share one upstream call (singleflight); successes live `OK_TTL_MS`, failures
 * `FAIL_TTL_MS` (rethrown, so a recovering outage is retried within seconds). Bounded size. Instances of
 * `createMetadataCache` are independent: no module-level state is shared with tests.
 */
export const METADATA_OK_TTL_MS = 60_000;
export const METADATA_FAIL_TTL_MS = 5_000;
const MAX_ENTRIES = 8;

export function createMetadataCache<T>(load: (issuer: string, arg?: string) => Promise<T>, now: () => number = Date.now) {
  const entries = new Map<string, { until: number; value?: T; error?: unknown }>();
  const inflight = new Map<string, Promise<T>>();
  return {
    async get(issuer: string, revision: number, arg?: string): Promise<T> {
      const key = JSON.stringify([issuer, revision, arg ?? null]);
      const hit = entries.get(key);
      if (hit && hit.until > now()) {
        if ("error" in hit) throw hit.error;
        return hit.value as T;
      }
      const pending = inflight.get(key);
      if (pending) return pending;
      const run = load(issuer, arg)
        .then((value) => { entries.delete(key); entries.set(key, { until: now() + METADATA_OK_TTL_MS, value }); return value; })
        .catch((error) => { entries.delete(key); entries.set(key, { until: now() + METADATA_FAIL_TTL_MS, error }); throw error; })
        .finally(() => {
          inflight.delete(key);
          while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
        });
      inflight.set(key, run);
      return run;
    },
    clear() { entries.clear(); inflight.clear(); },
  };
}

const discoveryCache = createMetadataCache((issuer) => zitadelDiscovery(issuer));
const jwksCache = createMetadataCache((_issuer, uri) => zitadelJwks(uri!));

export const cachedZitadelDiscovery = (issuer: string, revision: number) => discoveryCache.get(issuer, revision);
/** The JWKS URI comes from the validated (same-origin) discovery document, never from the caller. */
export async function cachedZitadelJwks(issuer: string, revision: number) {
  const doc = await cachedZitadelDiscovery(issuer, revision);
  return jwksCache.get(issuer, revision, doc.jwks_uri as string);
}
