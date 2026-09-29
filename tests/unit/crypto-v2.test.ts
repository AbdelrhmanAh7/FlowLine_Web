import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPlatformKeyRing,
  currentKeyId,
  decryptSecretV2,
  encryptSecret,
  encryptSecretV2,
  envelopeKeyId,
  isCurrentEnvelope,
  openSecret,
  rewrapSecret,
  type SecretContext,
} from "@/server/crypto";
import { decryptAccountTokens, encryptAccountTokens } from "@/server/auth-token-adapter";

/**
 * Crypto v2 (docs/security/CREDENTIALS_DESIGN.md MUST 4–5, S6 "AAD swaps", "v1 downgrade refused").
 * Every field of the context is authenticated; the platform and workspace key rings are separate; parsing is strict.
 */
const key = () => randomBytes(32).toString("base64");
const WS = key();
const PLATFORM = key();

function rings(extra: Record<string, string | undefined> = {}) {
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEY", WS);
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEYS_OLD", "");
  vi.stubEnv("FLOWLINE_PLATFORM_ENCRYPTION_KEY", PLATFORM);
  vi.stubEnv("FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD", "");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v as string);
}
afterEach(() => vi.unstubAllEnvs());

const wsCtx = (): SecretContext => ({ table: "connection", rowId: randomUUID(), workspaceId: randomUUID(), provider: "slack", purpose: "credentials" });
const platformCtx = (): SecretContext => ({ table: "platform_secret", rowId: randomUUID(), workspaceId: "platform", scope: "platform", provider: "google", purpose: "integration.google", revision: 3 });

describe("crypto v2 envelope", () => {
  it("round-trips, and each envelope has its own data key (same value → different ciphertexts)", () => {
    rings();
    const ctx = wsCtx();
    const a = encryptSecretV2({ token: "FLCANARY_abc" }, ctx);
    const b = encryptSecretV2({ token: "FLCANARY_abc" }, ctx);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ciphertext.split(".")).toHaveLength(9);
    expect(a.ciphertext.startsWith("v2.a256gcm-kw.")).toBe(true);
    expect(envelopeKeyId(a.ciphertext)).toBe(a.keyId);
    expect(decryptSecretV2(a.ciphertext, a.keyId, ctx)).toEqual({ token: "FLCANARY_abc" });
    expect(a.ciphertext).not.toContain("FLCANARY");
  });

  it("a swap of ANY context field fails: table, row, owner/workspace, scope, provider, purpose, revision", () => {
    rings();
    const ctx = platformCtx();
    const enc = encryptSecretV2("s3cret-value", ctx);
    const variants: SecretContext[] = [
      { ...ctx, table: "workspace_oauth_app" },
      { ...ctx, rowId: randomUUID() },
      { ...ctx, provider: "slack" },
      { ...ctx, purpose: "signin.google" },
      { ...ctx, revision: 2 },
      { ...ctx, revision: undefined },
      // owner/scope: the same blob opened as a workspace secret (workspace ring, other owner) fails
      { ...ctx, scope: "workspace", workspaceId: randomUUID() },
      { ...ctx, scope: "user", workspaceId: randomUUID() },
    ];
    for (const v of variants) expect(() => decryptSecretV2(enc.ciphertext, enc.keyId, v), JSON.stringify(v)).toThrow();
    const w = wsCtx();
    const wenc = encryptSecretV2("tenant", w);
    expect(() => decryptSecretV2(wenc.ciphertext, wenc.keyId, { ...w, workspaceId: randomUUID() })).toThrow();
    expect(() => decryptSecretV2(wenc.ciphertext, wenc.keyId, { ...w, scope: "platform", workspaceId: "platform" })).toThrow();
    expect(decryptSecretV2(enc.ciphertext, enc.keyId, ctx)).toBe("s3cret-value");
  });

  it("context fields can't smuggle separators, and ownership rules hold", () => {
    rings();
    expect(() => encryptSecretV2("x", { ...wsCtx(), rowId: "a:b" })).toThrow();
    expect(() => encryptSecretV2("x", { ...wsCtx(), purpose: "a b" })).toThrow();
    expect(() => encryptSecretV2("x", { ...platformCtx(), workspaceId: randomUUID() })).toThrow(); // platform scope must be owned by "platform"
    expect(() => encryptSecretV2("x", { ...wsCtx(), workspaceId: "platform" })).toThrow();
    expect(() => encryptSecretV2("x", { ...platformCtx(), revision: 0 })).toThrow();
  });

  it("strict parsing: segments, algorithm, base64, lengths, size cap, key ids", () => {
    rings();
    const ctx = wsCtx();
    const enc = encryptSecretV2({ a: 1 }, ctx);
    const p = enc.ciphertext.split(".");
    const flip = (b64: string) => Buffer.from(Buffer.from(b64, "base64").map((x, i) => (i === 0 ? x ^ 1 : x))).toString("base64");
    const bad = [
      p.slice(0, 8).join("."),
      [...p, "x"].join("."),
      ["v3", ...p.slice(1)].join("."),
      ["v2", "a256gcm", ...p.slice(2)].join("."),
      [...p.slice(0, 2), "zz" + p[2]!.slice(2), ...p.slice(3)].join("."),
      [...p.slice(0, 3), flip(p[3]!), ...p.slice(4)].join("."), // wrap iv
      [...p.slice(0, 4), flip(p[4]!), ...p.slice(5)].join("."), // wrap tag
      [...p.slice(0, 5), flip(p[5]!), ...p.slice(6)].join("."), // wrapped DEK
      [...p.slice(0, 7), flip(p[7]!), p[8]].join("."), // payload tag
      [...p.slice(0, 8), flip(p[8]!)].join("."), // payload
      [...p.slice(0, 3), "AAAA", ...p.slice(4)].join("."), // wrong nonce length
      [...p.slice(0, 8), p[8] + "!"].join("."), // bad base64
      [...p.slice(0, 8), p[8]!.replace(/=+$/, "")].join("."), // non-canonical base64 (padding stripped)
      "v2." + "A".repeat(70_000),
      "",
    ];
    for (const b of bad) expect(() => decryptSecretV2(b, enc.keyId, ctx), b.slice(0, 50)).toThrow();
    expect(() => decryptSecretV2(enc.ciphertext, "000000000000", ctx)).toThrow(); // key id ≠ embedded KEK id
    expect(() => decryptSecretV2(enc.ciphertext, "unknown-key", ctx)).toThrow();
  });

  it("v1 (no AAD) is refused by v2 decryption and by migrated rows; only a legacy-marked row may hold it", () => {
    rings();
    const ctx = wsCtx();
    const v1 = encryptSecret({ token: "legacy" });
    expect(() => decryptSecretV2(v1.ciphertext, v1.keyId, ctx)).toThrow();
    expect(() => openSecret({ ciphertext: v1.ciphertext, keyId: v1.keyId, legacy: false }, ctx)).toThrow(/Legacy ciphertext refused/);
    expect(openSecret({ ciphertext: v1.ciphertext, keyId: v1.keyId, legacy: true }, ctx)).toEqual({ token: "legacy" });
    // rewrapping a legacy row requires the explicit legacy flag, and yields a bound v2 envelope
    expect(() => rewrapSecret(v1.ciphertext, v1.keyId, ctx)).toThrow();
    const up = rewrapSecret(v1.ciphertext, v1.keyId, ctx, { legacyV1: true });
    expect(openSecret({ ciphertext: up.ciphertext, keyId: up.keyId, legacy: false }, ctx)).toEqual({ token: "legacy" });
  });

  it("separate key rings: platform secrets need their own key, which must differ from the workspace key", () => {
    rings({ FLOWLINE_PLATFORM_ENCRYPTION_KEY: "" });
    expect(() => encryptSecretV2("x", platformCtx())).toThrow(/FLOWLINE_PLATFORM_ENCRYPTION_KEY/);
    rings({ FLOWLINE_PLATFORM_ENCRYPTION_KEY: WS });
    expect(() => assertPlatformKeyRing()).toThrow(/differ/);
    rings({ FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD: WS });
    expect(() => assertPlatformKeyRing()).toThrow(/differ/);
    rings();
    const ctx = platformCtx();
    const enc = encryptSecretV2("platform-only", ctx);
    expect(enc.keyId).toBe(currentKeyId("platform"));
    expect(enc.keyId).not.toBe(currentKeyId("workspace"));
  });

  it("KEK rotation: old KEKs still decrypt; rewrap moves the DEK to the current KEK without touching the payload", () => {
    const oldKey = key();
    rings({ FLOWLINE_ENCRYPTION_KEY: oldKey });
    const ctx = wsCtx();
    const enc = encryptSecretV2({ token: "rotate-me" }, ctx);
    const payload = enc.ciphertext.split(".").slice(6).join(".");
    const next = key();
    rings({ FLOWLINE_ENCRYPTION_KEY: next, FLOWLINE_ENCRYPTION_KEYS_OLD: oldKey });
    expect(decryptSecretV2(enc.ciphertext, enc.keyId, ctx)).toEqual({ token: "rotate-me" });
    expect(isCurrentEnvelope(enc.ciphertext, ctx)).toBe(false);
    const re = rewrapSecret(enc.ciphertext, enc.keyId, ctx);
    expect(re.keyId).toBe(currentKeyId("workspace"));
    expect(re.ciphertext.split(".").slice(6).join(".")).toBe(payload); // payload untouched, only the DEK re-wrapped
    expect(isCurrentEnvelope(re.ciphertext, ctx)).toBe(true);
    rings({ FLOWLINE_ENCRYPTION_KEY: next });
    expect(() => decryptSecretV2(enc.ciphertext, enc.keyId, ctx)).toThrow(); // old KEK retired
    expect(decryptSecretV2(re.ciphertext, re.keyId, ctx)).toEqual({ token: "rotate-me" });
    // rewrapping can't be used to re-bind a blob to another context
    expect(() => rewrapSecret(re.ciphertext, re.keyId, { ...ctx, rowId: randomUUID() })).toThrow();
  });

  it("social-login tokens: encrypted per account row and field; a swapped field or row reads as null", () => {
    rings();
    const row = { id: randomUUID(), userId: randomUUID(), providerId: "google" };
    const enc = encryptAccountTokens({ ...row, accessToken: "ya29.FLCANARY-access", refreshToken: "1//FLCANARY-refresh", idToken: null }, row);
    expect(String(enc.accessToken)).toMatch(/^v2\.a256gcm-kw\./);
    expect(JSON.stringify(enc)).not.toContain("FLCANARY");
    expect(decryptAccountTokens(enc)).toMatchObject({ accessToken: "ya29.FLCANARY-access", refreshToken: "1//FLCANARY-refresh", idToken: null });
    // field swap
    expect(decryptAccountTokens({ ...enc, accessToken: enc.refreshToken })).toMatchObject({ accessToken: null, refreshToken: "1//FLCANARY-refresh" });
    // row swap (another user's account row)
    expect(decryptAccountTokens({ ...enc, id: randomUUID() })).toMatchObject({ accessToken: null, refreshToken: null });
    // legacy plaintext rows stay readable until rewrapped
    expect(decryptAccountTokens({ ...row, accessToken: "plain" })).toMatchObject({ accessToken: "plain" });
  });
});
