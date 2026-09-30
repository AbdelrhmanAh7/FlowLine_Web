import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptLegacyV1, decryptSecretV2, encryptSecret, encryptSecretV2, openSecret, rewrapSecret, type SecretContext } from "@/server/crypto";

/**
 * CXH-05: size limits are per purpose. Credentials keep the small cap; run step data (input up to 256 KB + output,
 * UTF-8 up to 3 bytes per character, base64 + envelope) has its own. Large legacy v1 rows stay readable/rewrappable.
 */
const WS = randomBytes(32).toString("base64");
function rings() {
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEY", WS);
  vi.stubEnv("FLOWLINE_ENCRYPTION_KEYS_OLD", "");
  vi.stubEnv("FLOWLINE_PLATFORM_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
}
afterEach(() => vi.unstubAllEnvs());

const stepCtx = (): SecretContext => ({ table: "run_step", rowId: `${randomUUID()}.${"a".repeat(32)}`, workspaceId: randomUUID(), provider: "engine", purpose: "step_data" });
const credCtx = (): SecretContext => ({ table: "connection", rowId: randomUUID(), workspaceId: randomUUID(), provider: "slack", purpose: "credentials" });

describe("crypto size limits per purpose (CXH-05)", () => {
  it("Codex's probe: a 50,000-byte ASCII step payload is stored and read back", () => {
    rings();
    const ctx = stepCtx();
    const value = { input: { body: "x".repeat(50_000) }, output: { ok: true } };
    const enc = encryptSecretV2(value, ctx);
    expect(decryptSecretV2(enc.ciphertext, enc.keyId, ctx)).toEqual(value);
  });

  it("the maximum run input (256 KB of 3-byte UTF-8 characters) plus an equally large output round-trips", () => {
    rings();
    const ctx = stepCtx();
    const big = "中".repeat(256 * 1024 - 16); // JSON length just under VALUE_MAX_BYTES, ~768 KB of UTF-8
    const value = { input: big, output: big };
    const enc = encryptSecretV2(value, ctx);
    expect(enc.ciphertext.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(decryptSecretV2<typeof value>(enc.ciphertext, enc.keyId, ctx).output).toBe(big);
    // Rewrapping (KEK rotation) keeps working at this size.
    const re = rewrapSecret(enc.ciphertext, enc.keyId, ctx);
    expect(decryptSecretV2<typeof value>(re.ciphertext, re.keyId, ctx).input).toBe(big);
  });

  it("credentials keep the small cap, for writes and for parsing", () => {
    rings();
    const ctx = credCtx();
    expect(() => encryptSecretV2({ token: "t".repeat(100_000) }, ctx)).toThrow(/too large/);
    const step = stepCtx();
    const bigStep = encryptSecretV2({ input: "y".repeat(100_000), output: null }, step);
    // A large (valid-looking) blob is refused before any crypto when opened as a credential.
    expect(() => decryptSecretV2(bigStep.ciphertext, bigStep.keyId, { ...ctx })).toThrow();
    expect(() => decryptSecretV2("v2." + "A".repeat(70_000), bigStep.keyId, ctx)).toThrow();
  });

  it("step data still has a cap (strict parsing is kept)", () => {
    rings();
    const ctx = stepCtx();
    expect(() => encryptSecretV2({ input: "z".repeat(20 * 1024 * 1024), output: null }, ctx)).toThrow(/too large/);
    expect(() => decryptSecretV2("v2." + "A".repeat(41 * 1024 * 1024), "000000000000", ctx)).toThrow();
  });

  it("a large legacy v1 step payload (written before v2 had any cap) stays readable and rewraps to v2", () => {
    rings();
    const ctx = stepCtx();
    const value = { input: "م".repeat(400_000), output: { rows: Array.from({ length: 2000 }, (_, i) => ({ i, s: "row".repeat(20) })) } };
    const v1 = encryptSecret(value);
    expect(v1.ciphertext.length).toBeGreaterThan(1024 * 1024);
    expect(decryptLegacyV1(v1.ciphertext, v1.keyId)).toEqual(value);
    expect(openSecret({ ciphertext: v1.ciphertext, keyId: v1.keyId, legacy: true }, ctx)).toEqual(value);
    const up = rewrapSecret(v1.ciphertext, v1.keyId, ctx, { legacyV1: true });
    expect(openSecret({ ciphertext: up.ciphertext, keyId: up.keyId, legacy: false }, ctx)).toEqual(value);
    // The legacy marker is still required.
    expect(() => openSecret({ ciphertext: v1.ciphertext, keyId: v1.keyId, legacy: false }, ctx)).toThrow(/Legacy ciphertext refused/);
  });
});
