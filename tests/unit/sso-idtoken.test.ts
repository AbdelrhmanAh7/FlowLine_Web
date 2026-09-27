import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HttpError } from "@/server/http";
import { validateIdToken, type Jwks } from "@/server/oidc";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwks: Jwks = { keys: [{ ...(publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string }), kid: "test-key" }] };

function makeToken(claims: Record<string, unknown>, opts: { key?: KeyObject; kid?: string | null; alg?: string } = {}): string {
  const header: Record<string, unknown> = { alg: opts.alg ?? "RS256", typ: "JWT" };
  if (opts.kid !== null) header.kid = opts.kid ?? "test-key";
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = cryptoSign("RSA-SHA256", Buffer.from(`${h}.${p}`), opts.key ?? privateKey).toString("base64url");
  return `${h}.${p}.${s}`;
}

const now = 1_800_000_000_000;
const baseClaims = () => ({
  iss: "https://idp.example",
  sub: "user-1",
  aud: "client-1",
  exp: (now + 300_000) / 1000,
  iat: now / 1000,
  nonce: "nonce-1",
  email: "ada@acme.com",
  email_verified: true,
});

const opts = { issuer: "https://idp.example", clientId: "client-1", nonce: "nonce-1", domains: ["acme.com"], jwks, now };

function expectInvalid(token: string, match: RegExp, o: typeof opts = opts) {
  try {
    validateIdToken(token, o);
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(400);
    expect((e as HttpError).code).toBe("SSO_TOKEN_INVALID");
    expect((e as HttpError).message).toMatch(match);
    return;
  }
  throw new Error(`Expected the token to be refused (${match})`);
}

describe("validateIdToken", () => {
  it("accepts a well-formed token and returns the checked claims", () => {
    const claims = validateIdToken(makeToken({ ...baseClaims(), name: "Ada Lovelace" }), opts);
    expect(claims.email).toBe("ada@acme.com");
    expect(claims.name).toBe("Ada Lovelace");
  });

  it("accepts an aud array that contains the client id, and exp inside the leeway", () => {
    validateIdToken(makeToken({ ...baseClaims(), aud: ["other", "client-1"] }), opts);
    validateIdToken(makeToken({ ...baseClaims(), exp: (now - 30_000) / 1000 }), opts);
  });

  it("refuses malformed tokens", () => {
    expectInvalid("not-a-jwt", /malformed/);
    expectInvalid("a.b", /malformed/);
    expectInvalid(`${Buffer.from("{").toString("base64url")}.b.c`, /malformed/);
  });

  it("refuses a non-RS256 algorithm", () => {
    expectInvalid(makeToken(baseClaims(), { alg: "HS256" }), /unsupported signing algorithm/);
  });

  it("refuses an unknown kid and an ambiguous key set", () => {
    expectInvalid(makeToken(baseClaims(), { kid: "nope" }), /unknown key/);
    expectInvalid(makeToken(baseClaims(), { kid: null }), /unknown key/, { ...opts, jwks: { keys: [...jwks.keys, { ...jwks.keys[0]!, kid: "second" }] } });
  });

  it("refuses a bad signature (wrong key or tampered body)", () => {
    expectInvalid(makeToken(baseClaims(), { key: otherKey }), /signature is invalid/);
    const [h, , s] = makeToken(baseClaims()).split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...baseClaims(), email: "mallory@acme.com" })).toString("base64url")}.${s}`;
    expectInvalid(tampered, /signature is invalid/);
  });

  it("refuses a wrong issuer", () => {
    expectInvalid(makeToken({ ...baseClaims(), iss: "https://evil.example" }), /different provider/);
  });

  it("refuses a wrong audience", () => {
    expectInvalid(makeToken({ ...baseClaims(), aud: "client-2" }), /different client/);
    expectInvalid(makeToken({ ...baseClaims(), aud: ["client-2"] }), /different client/);
  });

  it("refuses an expired token and one issued in the future", () => {
    expectInvalid(makeToken({ ...baseClaims(), exp: (now - 120_000) / 1000 }), /expired/);
    expectInvalid(makeToken({ ...baseClaims(), iat: (now + 120_000) / 1000 }), /future/);
  });

  it("refuses a nonce mismatch", () => {
    expectInvalid(makeToken({ ...baseClaims(), nonce: "other-nonce" }), /doesn't match/);
  });

  it("refuses a missing or unverified email", () => {
    const noEmail = baseClaims() as Record<string, unknown>;
    delete noEmail.email;
    expectInvalid(makeToken(noEmail), /no usable email/);
    expectInvalid(makeToken({ ...baseClaims(), email: "not-an-email" }), /no usable email/);
    expectInvalid(makeToken({ ...baseClaims(), email_verified: false }), /hasn't verified/);
  });

  it("refuses an email outside the allowed domains", () => {
    expectInvalid(makeToken({ ...baseClaims(), email: "ada@other.com" }), /limited to acme\.com/);
  });
});
