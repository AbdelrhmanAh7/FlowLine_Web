import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secret-at-rest encryption for connection credentials, webhook secrets and PKCE
 * verifiers. AES-256-GCM; key from FLOWLINE_ENCRYPTION_KEY (base64, 32 bytes).
 * Old keys can be listed in FLOWLINE_ENCRYPTION_KEYS_OLD (comma-separated) so
 * rotation never strands existing ciphertext. Plaintext never leaves the server.
 */
interface Key {
  id: string;
  bytes: Buffer;
}

function parseKey(b64: string): Key {
  const bytes = Buffer.from(b64.trim(), "base64");
  if (bytes.length !== 32) throw new Error("Encryption keys must be 32 bytes, base64-encoded");
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 12), bytes };
}

function keys(): { current: Key; all: Map<string, Key> } {
  const cur = process.env.FLOWLINE_ENCRYPTION_KEY;
  if (!cur) throw new Error("FLOWLINE_ENCRYPTION_KEY is not set (see .env.example)");
  const current = parseKey(cur);
  const all = new Map([[current.id, current]]);
  for (const old of (process.env.FLOWLINE_ENCRYPTION_KEYS_OLD ?? "").split(",").filter(Boolean)) {
    const k = parseKey(old);
    all.set(k.id, k);
  }
  return { current, all };
}

export function encryptSecret(value: unknown): { ciphertext: string; keyId: string } {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`, keyId: current.id };
}

export function decryptSecret<T>(ciphertext: string, keyId: string): T {
  const key = keys().all.get(keyId);
  if (!key) throw new Error(`Encryption key ${keyId} is not available`);
  const [v, iv, tag, data] = ciphertext.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

export function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical JSON (sorted keys) — used to hash approval arguments. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
