import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { EgressError, isAllowlisted, safeFetch } from "./egress";
import { HttpError } from "./http";

/**
 * OIDC client primitives for per-workspace SSO: discovery-document fetching and
 * id_token validation. No database or session dependencies — safe to unit-test
 * in isolation.
 */

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

/** ZITADEL Web apps use client_secret_basic. OAuth requires form encoding before base64. */
export function basicClientAuthorization(clientId: string, clientSecret: string): string {
  const formEncode = (value: string) => new URLSearchParams({ x: value }).toString().slice(2);
  return `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`, "utf8").toString("base64")}`;
}

export interface Jwks {
  keys: { kty: string; kid?: string; alg?: string; use?: string; n?: string; e?: string }[];
}

export interface IdTokenClaims {
  email: string;
  emailVerified: true;
  name?: string;
  sub?: string;
}

/* ───────────── Discovery ───────────── */

export function assertIssuerUrl(issuer: string): URL {
  let u: URL;
  try {
    u = new URL(issuer);
  } catch {
    throw new HttpError(400, "VALIDATION", "Issuer must be a valid URL");
  }
  if (u.username || u.password || u.search || u.hash) throw new HttpError(400, "VALIDATION", "Issuer must be a plain origin (optionally with a path)");
  if (u.protocol === "https:") return u;
  // Plain http issuers exist only for the in-process test IdP, and only via the egress allowlist.
  if (u.protocol === "http:" && process.env.FLOWLINE_ENV === "test") {
    const port = u.port ? Number(u.port) : 80;
    if (isAllowlisted(u.hostname, port)) return u;
  }
  throw new HttpError(400, "VALIDATION", "Issuer must be https");
}

/** Fetches and validates `<issuer>/.well-known/openid-configuration` via the egress guard. */
export async function fetchDiscovery(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  let res;
  try {
    res = await safeFetch(url, { headers: { accept: "application/json" }, timeoutMs: 10_000, maxBytes: 256 * 1024 });
  } catch (e) {
    if (e instanceof EgressError) throw new HttpError(400, "EGRESS_BLOCKED", e.message);
    throw new HttpError(400, "SSO_DISCOVERY_FAILED", "Couldn't reach the identity provider's discovery document");
  }
  if (res.status !== 200) throw new HttpError(400, "SSO_DISCOVERY_FAILED", `The identity provider's discovery document returned HTTP ${res.status}`);
  let doc: Partial<OidcDiscovery>;
  try {
    doc = res.json<Partial<OidcDiscovery>>();
  } catch {
    throw new HttpError(400, "SSO_DISCOVERY_FAILED", "The discovery document isn't valid JSON");
  }
  if (doc.issuer !== issuer) throw new HttpError(400, "SSO_DISCOVERY_FAILED", "The discovery document's issuer doesn't match the configured issuer");
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof doc[key] !== "string" || !doc[key]) throw new HttpError(400, "SSO_DISCOVERY_FAILED", `The discovery document is missing ${key}`);
  }
  return doc as OidcDiscovery;
}

/* ───────────── id_token validation ───────────── */

const CLOCK_LEEWAY_MS = 60_000;

function b64urlJson(part: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "SSO_TOKEN_INVALID", "The identity token is malformed");
  }
}

const tokenInvalid = (msg: string) => new HttpError(400, "SSO_TOKEN_INVALID", msg);

/**
 * Validates an OIDC id_token: RS256 signature against the provider JWKS, issuer,
 * audience, expiry, nonce, and a verified email in an allowed domain.
 * Every failure throws an HttpError; success returns the checked claims.
 */
export function validateIdToken(
  idToken: string,
  opts: { issuer: string; clientId: string; nonce: string; domains: string[]; jwks: Jwks; now?: number },
): IdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw tokenInvalid("The identity token is malformed");
  const [h, p, s] = parts as [string, string, string];
  const header = b64urlJson(h);
  const claims = b64urlJson(p);
  if (header.alg !== "RS256") throw tokenInvalid("The identity token uses an unsupported signing algorithm");
  const rsaKeys = opts.jwks.keys.filter((k) => k.kty === "RSA" && k.n && k.e);
  const jwk = typeof header.kid === "string" ? rsaKeys.find((k) => k.kid === header.kid) : rsaKeys.length === 1 ? rsaKeys[0] : undefined;
  if (!jwk) throw tokenInvalid("The identity token was signed by an unknown key");
  let key;
  try {
    key = createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw tokenInvalid("The identity provider's signing key is unusable");
  }
  let signature: Buffer;
  try {
    signature = Buffer.from(s, "base64url");
  } catch {
    throw tokenInvalid("The identity token is malformed");
  }
  if (!cryptoVerify("RSA-SHA256", Buffer.from(`${h}.${p}`, "utf8"), key, signature)) {
    throw tokenInvalid("The identity token's signature is invalid");
  }

  if (claims.iss !== opts.issuer) throw tokenInvalid("The identity token was issued by a different provider");
  const aud = claims.aud;
  const audienceOk = typeof aud === "string" ? aud === opts.clientId : Array.isArray(aud) && aud.includes(opts.clientId);
  if (!audienceOk) throw tokenInvalid("The identity token was issued for a different client");
  const now = opts.now ?? Date.now();
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now - CLOCK_LEEWAY_MS) throw tokenInvalid("The identity token has expired");
  if (typeof claims.iat === "number" && claims.iat * 1000 > now + CLOCK_LEEWAY_MS) throw tokenInvalid("The identity token was issued in the future");
  if (claims.nonce !== opts.nonce) throw tokenInvalid("The identity token doesn't match this sign-in attempt");
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw tokenInvalid("The identity token has no usable email address");
  if (claims.email_verified !== true) throw tokenInvalid("The identity provider hasn't verified this email address");
  const domain = email.split("@")[1]!.toLowerCase();
  if (!opts.domains.map((d) => d.toLowerCase()).includes(domain)) throw tokenInvalid(`Sign-in via SSO is limited to ${opts.domains.join(", ")}`);
  return { email, emailVerified: true, name: typeof claims.name === "string" ? claims.name : undefined, sub: typeof claims.sub === "string" ? claims.sub : undefined };
}
