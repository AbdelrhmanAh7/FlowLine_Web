import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/egress", () => ({ safeFetch: vi.fn() }));
vi.mock("@/server/zitadel-config", () => ({ activeZitadelConfig: vi.fn() }));

import { safeFetch } from "@/server/egress";
import { filterPublicDiscovery, filterPublicRsaSigningKeys, zitadelDiscovery, zitadelJwks } from "@/server/zitadel-metadata";

const fetchMock = vi.mocked(safeFetch);
const issuer = "https://tenant.zitadel.example";
const endpoints = {
  issuer,
  authorization_endpoint: `${issuer}/oauth/v2/authorize`,
  token_endpoint: `${issuer}/oauth/v2/token`,
  userinfo_endpoint: `${issuer}/oidc/v1/userinfo`,
  jwks_uri: `${issuer}/oauth/v2/keys`,
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
  id_token_signing_alg_values_supported: ["RS256"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
};

beforeEach(() => { vi.resetAllMocks(); });

describe("public ZITADEL metadata filtering", () => {
  it("keeps standard generic OAuth RS256 discovery fields and drops provider extensions", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: () => ({ ...endpoints, client_secret: "must-not-leak", private_extension: { key: "secret" } }) } as never);

    const doc = await zitadelDiscovery(issuer);

    expect(doc).toMatchObject({
      ...endpoints,
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
    expect(doc).not.toHaveProperty("client_secret");
    expect(doc).not.toHaveProperty("private_extension");
    expect(fetchMock).toHaveBeenCalledWith(`${issuer}/.well-known/openid-configuration`, expect.objectContaining({ maxRedirects: 0 }));
  });

  it("preserves a real-style public RSA signing JWK while stripping private and unknown members", () => {
    const jwk = {
      kty: "RSA", kid: "key-2026-01", use: "sig", alg: "RS256", n: "modulus-base64url", e: "AQAB",
      key_ops: ["verify"], x5c: ["MIIBpubliccertificate"], x5t: "thumbprint", "x5t#S256": "sha256thumbprint",
      d: "private-d", p: "private-p", q: "private-q", dp: "private-dp", dq: "private-dq", qi: "private-qi", oth: [{ r: "private-r" }, { d: "private-other-d" }], private_extension: "secret",
    };

    expect(filterPublicRsaSigningKeys([jwk])).toEqual([{
      kty: "RSA", kid: "key-2026-01", use: "sig", alg: "RS256", n: "modulus-base64url", e: "AQAB",
      key_ops: ["verify"], x5c: ["MIIBpubliccertificate"], x5t: "thumbprint", "x5t#S256": "sha256thumbprint",
    }]);
    expect(filterPublicRsaSigningKeys([
      { ...jwk, kty: "EC" },
      { ...jwk, alg: "HS256" },
      { ...jwk, use: "enc" },
      { ...jwk, key_ops: ["sign"] },
      { kty: "RSA", kid: "missing-modulus", e: "AQAB" },
    ])).toEqual([]);
  });

  it("returns only viable public RSA keys from the JWKS fetch path", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: () => ({ keys: [
      { kty: "RSA", kid: "verify-key", use: "sig", alg: "RS256", n: "modulus", e: "AQAB", d: "must-not-leak" },
      { kty: "RSA", kid: "encryption-key", use: "enc", alg: "RSA-OAEP", n: "modulus", e: "AQAB", d: "private" },
      { kty: "oct", kid: "hmac-key", k: "secret" },
    ] }) } as never);

    const jwks = await zitadelJwks(`${issuer}/oauth/v2/keys`);

    expect(jwks).toEqual({ keys: [{ kty: "RSA", kid: "verify-key", use: "sig", alg: "RS256", n: "modulus", e: "AQAB" }] });
    expect(JSON.stringify(jwks)).not.toMatch(/must-not-leak|private|secret/);
    expect(fetchMock).toHaveBeenCalledWith(`${issuer}/oauth/v2/keys`, expect.objectContaining({ maxRedirects: 0 }));
  });

  it("treats malformed standard fields as absent rather than relaying nested objects", () => {
    const result = filterPublicDiscovery({ ...endpoints, claims_supported: { client_secret: "secret" }, claims_parameter_supported: { leak: true }, extension: "secret" });
    expect(result).not.toHaveProperty("claims_supported");
    expect(result).not.toHaveProperty("claims_parameter_supported");
    expect(result).not.toHaveProperty("extension");
  });
});
