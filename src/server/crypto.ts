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

/**
 * v2: AES-256-GCM with the secret's CONTEXT bound as additional authenticated data, so a ciphertext copied to another
 * row, workspace, table, provider or purpose no longer decrypts (row-swap protection).
 * AAD = `flowline:v2:<table>:<rowId>:<workspaceId>:<provider>:<purpose>`. Format: `v2.<iv>.<tag>.<data>` (base64).
 * v1 (above) stays for existing rows; callers that require v2 refuse v1 blobs.
 */
export interface SecretContext {
  table: string;
  rowId: string;
  workspaceId: string;
  provider: string;
  purpose: string;
}

const V2_MAX_CIPHERTEXT = 64 * 1024;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function aadFor(ctx: SecretContext) {
  for (const [k, v] of Object.entries(ctx)) if (typeof v !== "string" || !v || v.includes(":")) throw new Error(`Invalid secret context field ${k}`);
  return Buffer.from(`flowline:v2:${ctx.table}:${ctx.rowId}:${ctx.workspaceId}:${ctx.provider}:${ctx.purpose}`, "utf8");
}

export function encryptSecretV2(value: unknown, ctx: SecretContext): { ciphertext: string; keyId: string } {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  cipher.setAAD(aadFor(ctx));
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: `v2.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`, keyId: current.id };
}

export function decryptSecretV2<T>(ciphertext: string, keyId: string, ctx: SecretContext): T {
  if (typeof ciphertext !== "string" || ciphertext.length > V2_MAX_CIPHERTEXT) throw new Error("Unrecognized ciphertext format");
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") throw new Error("Unrecognized ciphertext format");
  const [, ivB, tagB, dataB] = parts as [string, string, string, string];
  if (![ivB, tagB, dataB].every((p) => B64.test(p))) throw new Error("Unrecognized ciphertext format");
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Unrecognized ciphertext format");
  const key = keys().all.get(keyId);
  if (!key) throw new Error(`Encryption key ${keyId} is not available`);
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, iv, { authTagLength: 16 });
  decipher.setAAD(aadFor(ctx));
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
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
