import { createHmac } from "node:crypto";

/**
 * An independent authenticator-app emulator for E2E (RFC 4648 base32 + RFC 6238 TOTP: HMAC-SHA1, 30 s, 6 digits).
 * Deliberately NOT imported from product code: E2E specs run in the WebKit container with only `e2e/` copied, and an
 * independent implementation checks the product the way a real authenticator app would.
 */
export function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
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

export function totpCodeFor(key: Buffer, now = Date.now(), digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const off = mac[mac.length - 1]! & 15;
  const bin = ((mac[off]! & 127) << 24) | ((mac[off + 1]! & 255) << 16) | ((mac[off + 2]! & 255) << 8) | (mac[off + 3]! & 255);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}
