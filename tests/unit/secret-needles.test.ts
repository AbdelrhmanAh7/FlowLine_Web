import { describe, expect, it } from "vitest";
import { apiKeySecret, inviteTokenFromUrl, MIN_NEEDLE_LENGTH, secretNeedles } from "../integration/secret-needles";

/**
 * Guard for the projection leak checks (p3-matrix "secrets never leave the server"). CI run 37059910151
 * failed with `not to contain 'E'`: the API-key fragment was built with `key.split("_").pop()`, and the
 * base64url secret itself can contain `_`, so the "fragment" was whatever followed the secret's last
 * underscore — sometimes a single character that matches any JSON.
 */
describe("secret needles", () => {
  it("takes the API-key secret by shape, even when the base64url secret contains underscores", () => {
    const secret = "AbC_dE-fG_E".padEnd(43, "x"); // ends in `_E…`, the CI failure shape
    const key = `fl_test_ab12cd34_${secret}`;
    expect(apiKeySecret(key)).toBe(secret);
    expect(apiKeySecret(key).length).toBe(43);
    expect(key.split("_").pop()).not.toBe(secret); // the old derivation was wrong for this key
  });

  it("rejects strings that are not API keys", () => {
    expect(() => apiKeySecret("fl_test_short")).toThrow(/not an API key/);
    expect(() => apiKeySecret("")).toThrow(/not an API key/);
  });

  it("reads the invite token from the URL path and rejects other URLs", () => {
    const token = "t".repeat(43);
    expect(inviteTokenFromUrl(`http://localhost:3000/invite/${token}`)).toBe(token);
    expect(() => inviteTokenFromUrl("http://localhost:3000/invite/")).toThrow(/not an invite URL/);
    expect(() => inviteTokenFromUrl("http://localhost:3000/invite/abc?x=1")).toThrow(/not an invite URL/);
  });

  it("refuses secret needles shorter than the minimum instead of dropping them", () => {
    expect(MIN_NEEDLE_LENGTH).toBeGreaterThanOrEqual(8);
    expect(() => secretNeedles({ fields: ["keyHash"], secrets: ["E"] })).toThrow(/secret needle "E" is shorter than 8/);
    expect(() => secretNeedles({ secrets: ["x".repeat(43), ""] })).toThrow(/shorter than 8/);
    expect(() => secretNeedles({ fields: ["keyHash"], secrets: [] })).toThrow(/empty/);
    expect(() => secretNeedles({ fields: ["id"], secrets: ["x".repeat(43)] })).toThrow(/field needle "id" is shorter than 4/);
  });

  it("keeps every needle that passes, fields first (nothing is silently dropped)", () => {
    const fields = ["secretEnc", "keyHash", "clientSecretEnc"];
    const secrets = ["sso-test-secret-not-logged", "x".repeat(43)];
    expect(secretNeedles({ fields, secrets })).toEqual([...fields, ...secrets]);
  });
});
