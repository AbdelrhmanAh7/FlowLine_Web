import { describe, expect, it } from "vitest";
import { base32Decode as e2eBase32, totpCodeFor as e2eTotp } from "../../e2e/tools/totp";
import { base32Decode, totpCodeFor } from "@/server/totp";

describe("E2E authenticator emulator", () => {
  it("matches the RFC 6238 SHA-1 test vectors (8 digits, key '12345678901234567890')", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    for (const [t, code] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"]] as const) {
      expect(e2eTotp(key, t * 1000, 8)).toBe(code);
    }
  });
  it("agrees with the product implementation for random base32 secrets", () => {
    for (const s of ["JBSWY3DPEHPK3PXP", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "MFRGGZDFMZTWQ2LK"]) {
      const now = Date.now();
      expect(e2eBase32(s)).toEqual(base32Decode(s));
      expect(e2eTotp(e2eBase32(s), now)).toBe(totpCodeFor(base32Decode(s), now));
    }
  });
});
