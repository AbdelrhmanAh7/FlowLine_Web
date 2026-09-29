import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the same parameters better-auth's two-factor plugin enrols. The key is the
 * UTF-8 bytes of the secret string (what the otpauth:// URI encodes in base32).
 */
export const TOTP_PERIOD = 30;

export function hotp(secret: string | Buffer, counter: number, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", typeof secret === "string" ? Buffer.from(secret, "utf8") : secret).update(buf).digest();
  const off = mac[mac.length - 1]! & 15;
  const bin = ((mac[off]! & 127) << 24) | ((mac[off + 1]! & 255) << 16) | ((mac[off + 2]! & 255) << 8) | (mac[off + 3]! & 255);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

export function totpStep(now = Date.now()) {
  return Math.floor(now / 1000 / TOTP_PERIOD);
}

/** The current code for a raw TOTP secret (tests / E2E compute codes the way an authenticator app does). */
export function totpCodeFor(secret: string | Buffer, now = Date.now(), digits = 6) {
  return hotp(secret, totpStep(now), digits);
}

/** Decodes an RFC 4648 base32 string (the `secret=` of an otpauth:// URI). */
export function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
