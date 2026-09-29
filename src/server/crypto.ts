import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secret-at-rest encryption (docs/security/CREDENTIALS_DESIGN.md §2 MUST 4–5).
 *
 * Current format — **v2 envelope**: every secret gets its own random 32-byte data key (DEK). The payload is
 * AES-256-GCM(DEK) with the secret's CONTEXT as additional authenticated data; the DEK is wrapped by a key-encryption
 * key (KEK) with AES-256-GCM whose AAD binds the key ring, the KEK id and the same context. A ciphertext copied to
 * another row, table, workspace, scope, provider, purpose or revision fails its GCM tag.
 *
 *   `v2.a256gcm-kw.<kekId>.<wrapIv>.<wrapTag>.<wrappedDek>.<iv>.<tag>.<ciphertext>` (base64 segments)
 *   AAD = `flowline:v2:<table>:<rowId>:<scope>:<owner>:<provider>:<purpose>[:r<revision>]`
 *
 * Two SEPARATE key rings (the root key bytes must differ):
 *   - workspace ring: FLOWLINE_ENCRYPTION_KEY (+ FLOWLINE_ENCRYPTION_KEYS_OLD) — tenant data (connections, SSO,
 *     webhooks, step data, AI BYOK, workspace OAuth apps, social-login tokens).
 *   - platform ring:  FLOWLINE_PLATFORM_ENCRYPTION_KEY (+ FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD) — platform
 *     credentials only (platform_secret).
 *
 * Also readable (never written):
 *   - `v2.<iv>.<tag>.<ct>` — AI hub Wave A: AAD-bound but not enveloped (workspace ring only). `rewrapSecret` upgrades it.
 *   - `v1.<iv>.<tag>.<ct>` — no AAD. ONLY through `openSecret(..., legacy: true)` / `decryptLegacyV1`, which callers use
 *     solely for rows explicitly marked legacy, so planting a v1 blob in a migrated row cannot bypass the AAD.
 * Parsing is strict: exact segment counts, canonical base64, nonce/tag/key lengths, a size cap, and known key ids.
 */
interface Key {
  id: string;
  bytes: Buffer;
}

export type KeyRing = "workspace" | "platform";

export class CryptoConfigError extends Error {}
export class SecretFormatError extends Error {
  constructor(message = "Unrecognized ciphertext format") {
    super(message);
  }
}

function parseKey(b64: string, name: string): Key {
  const bytes = Buffer.from(b64.trim(), "base64");
  if (bytes.length !== 32) throw new CryptoConfigError(`${name} must be 32 bytes, base64-encoded`);
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 12), bytes };
}

function ringFromEnv(currentVar: string, oldVar: string): { current: Key; all: Map<string, Key> } | null {
  const cur = process.env[currentVar];
  if (!cur) return null;
  const current = parseKey(cur, currentVar);
  const all = new Map([[current.id, current]]);
  for (const old of (process.env[oldVar] ?? "").split(",").filter((s) => s.trim())) {
    const k = parseKey(old, oldVar);
    all.set(k.id, k);
  }
  return { current, all };
}

function keys(ring: KeyRing = "workspace"): { current: Key; all: Map<string, Key> } {
  const ws = ringFromEnv("FLOWLINE_ENCRYPTION_KEY", "FLOWLINE_ENCRYPTION_KEYS_OLD");
  if (ring === "workspace") {
    if (!ws) throw new CryptoConfigError("FLOWLINE_ENCRYPTION_KEY is not set (see .env.example)");
    return ws;
  }
  const platform = ringFromEnv("FLOWLINE_PLATFORM_ENCRYPTION_KEY", "FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD");
  if (!platform) throw new CryptoConfigError("FLOWLINE_PLATFORM_ENCRYPTION_KEY is not set (see .env.example)");
  // Separate rings are only separate if the root bytes differ: a leaked workspace key must not open platform secrets.
  if (ws) for (const p of platform.all.values()) for (const w of ws.all.values()) if (timingSafeEqual(p.bytes, w.bytes)) throw new CryptoConfigError("FLOWLINE_PLATFORM_ENCRYPTION_KEY must differ from every workspace encryption key");
  return platform;
}

/** Throws a CryptoConfigError when the platform key ring is missing or reuses workspace key bytes. */
export function assertPlatformKeyRing() {
  keys("platform");
}

/** The current key id of a ring (used by the rewrap script to count what still needs rewrapping). */
export function currentKeyId(ring: KeyRing) {
  return keys(ring).current.id;
}

/* ───────────── v1 (legacy, no AAD) ───────────── */

/**
 * @deprecated v1 has no AAD. Kept ONLY so tests can plant legacy rows; production code must not import it
 * (eslint `no-restricted-imports`). Use `encryptSecretV2`.
 */
export function encryptSecret(value: unknown): { ciphertext: string; keyId: string } {
  const { current } = keys("workspace");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`, keyId: current.id };
}

/** Decrypts a v1 blob. Callers MUST only use this for rows explicitly marked legacy (never for migrated domains). */
export function decryptLegacyV1<T>(ciphertext: string, keyId: string): T {
  const parts = checkedParts(ciphertext, "v1", 4);
  const [, ivB, tagB, dataB] = parts as [string, string, string, string];
  const iv = b64(ivB, 12);
  const tag = b64(tagB, 16);
  const key = keys("workspace").all.get(keyId);
  if (!key) throw new CryptoConfigError(`Encryption key ${keyId} is not available`);
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(b64(dataB)), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

/** @deprecated Alias of `decryptLegacyV1` for tests; production code must not import it. */
export const decryptSecret = decryptLegacyV1;

/* ───────────── v2 ───────────── */

/**
 * The trusted context a secret is bound to. Callers derive it from the DB row and the authorized operation — never
 * from the browser. `workspaceId` is the owner: a workspace id, a user id (scope "user"), or "platform" (scope
 * "platform").
 */
export interface SecretContext {
  table: string;
  rowId: string;
  workspaceId: string;
  provider: string;
  purpose: string;
  /** "workspace" (default) | "user" → workspace key ring; "platform" → platform key ring. */
  scope?: "workspace" | "platform" | "user";
  /** Immutable secret revision (platform secrets / workspace OAuth apps): swapping revisions fails too. */
  revision?: number;
}

const V2_MAX_CIPHERTEXT = 64 * 1024;
const ENVELOPE_ALG = "a256gcm-kw";
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const KEY_ID = /^[0-9a-f]{12}$/;

function field(name: string, v: unknown) {
  if (typeof v !== "string" || !v || v.length > 200 || v.includes(":") || /\s/.test(v)) throw new SecretFormatError(`Invalid secret context field ${name}`);
  return v;
}

function ringOf(ctx: SecretContext): KeyRing {
  return ctx.scope === "platform" ? "platform" : "workspace";
}

function aadV2(ctx: SecretContext): string {
  const scope = ctx.scope ?? "workspace";
  if (!["workspace", "platform", "user"].includes(scope)) throw new SecretFormatError("Invalid secret context field scope");
  if (scope === "platform" && ctx.workspaceId !== "platform") throw new SecretFormatError("Platform secrets are owned by the platform");
  if (scope !== "platform" && ctx.workspaceId === "platform") throw new SecretFormatError("Tenant secrets can't be owned by the platform");
  if (ctx.revision !== undefined && (!Number.isInteger(ctx.revision) || ctx.revision < 1)) throw new SecretFormatError("Invalid secret context field revision");
  const base = `flowline:v2:${field("table", ctx.table)}:${field("rowId", ctx.rowId)}:${scope}:${field("owner", ctx.workspaceId)}:${field("provider", ctx.provider)}:${field("purpose", ctx.purpose)}`;
  return ctx.revision === undefined ? base : `${base}:r${ctx.revision}`;
}

/** AI hub Wave A AAD (non-envelope v2 blobs, read-only). */
function aadWaveA(ctx: SecretContext) {
  return `flowline:v2:${field("table", ctx.table)}:${field("rowId", ctx.rowId)}:${field("workspaceId", ctx.workspaceId)}:${field("provider", ctx.provider)}:${field("purpose", ctx.purpose)}`;
}

function b64(s: string, len?: number): Buffer {
  if (!B64.test(s)) throw new SecretFormatError();
  const buf = Buffer.from(s, "base64");
  if (buf.toString("base64") !== s) throw new SecretFormatError(); // non-canonical encodings are refused
  if (len !== undefined && buf.length !== len) throw new SecretFormatError();
  return buf;
}

function checkedParts(ciphertext: unknown, version: string, count: number): string[] {
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > V2_MAX_CIPHERTEXT) throw new SecretFormatError();
  const parts = ciphertext.split(".");
  if (parts.length !== count || parts[0] !== version) throw new SecretFormatError();
  return parts;
}

function gcmEncrypt(key: Buffer, plain: Buffer, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv, tag: c.getAuthTag(), ct };
}

function gcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: string) {
  const d = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function wrapAad(ring: KeyRing, kekId: string, aad: string) {
  return `flowline:v2:kek:${ring}:${kekId}:${aad}`;
}

function wrapDek(ring: KeyRing, kek: Key, dek: Buffer, aad: string) {
  const w = gcmEncrypt(kek.bytes, dek, wrapAad(ring, kek.id, aad));
  return [kek.id, w.iv.toString("base64"), w.tag.toString("base64"), w.ct.toString("base64")];
}

/** Encrypts `value` in the v2 envelope, bound to `ctx`. The row id must exist BEFORE encryption (allocate it app-side). */
export function encryptSecretV2(value: unknown, ctx: SecretContext): { ciphertext: string; keyId: string } {
  const ring = ringOf(ctx);
  const aad = aadV2(ctx);
  const { current } = keys(ring);
  const dek = randomBytes(32);
  try {
    const p = gcmEncrypt(dek, Buffer.from(JSON.stringify(value), "utf8"), aad);
    const ciphertext = ["v2", ENVELOPE_ALG, ...wrapDek(ring, current, dek, aad), p.iv.toString("base64"), p.tag.toString("base64"), p.ct.toString("base64")].join(".");
    if (ciphertext.length > V2_MAX_CIPHERTEXT) throw new SecretFormatError("Secret is too large");
    return { ciphertext, keyId: current.id };
  } finally {
    dek.fill(0);
  }
}

type Parsed =
  | { kind: "envelope"; kekId: string; wrapIv: Buffer; wrapTag: Buffer; wrapped: Buffer; iv: Buffer; tag: Buffer; ct: Buffer }
  | { kind: "waveA"; iv: Buffer; tag: Buffer; ct: Buffer };

function parseV2(ciphertext: unknown): Parsed {
  if (typeof ciphertext !== "string" || ciphertext.length > V2_MAX_CIPHERTEXT) throw new SecretFormatError();
  const parts = ciphertext.split(".");
  if (parts[0] !== "v2") throw new SecretFormatError();
  if (parts.length === 4) {
    const [, ivB, tagB, dataB] = parts as [string, string, string, string];
    return { kind: "waveA", iv: b64(ivB, 12), tag: b64(tagB, 16), ct: b64(dataB) };
  }
  if (parts.length !== 9 || parts[1] !== ENVELOPE_ALG) throw new SecretFormatError();
  const [, , kekId, wIv, wTag, wrapped, ivB, tagB, dataB] = parts as [string, string, string, string, string, string, string, string, string];
  if (!KEY_ID.test(kekId)) throw new SecretFormatError();
  return { kind: "envelope", kekId, wrapIv: b64(wIv, 12), wrapTag: b64(wTag, 16), wrapped: b64(wrapped, 32), iv: b64(ivB, 12), tag: b64(tagB, 16), ct: b64(dataB) };
}

function openDek(ring: KeyRing, p: Extract<Parsed, { kind: "envelope" }>, keyId: string, aad: string): Buffer {
  if (p.kekId !== keyId) throw new SecretFormatError("Key id mismatch");
  const kek = keys(ring).all.get(p.kekId);
  if (!kek) throw new CryptoConfigError(`Encryption key ${p.kekId} is not available`);
  return gcmDecrypt(kek.bytes, p.wrapIv, p.wrapTag, p.wrapped, wrapAad(ring, kek.id, aad));
}

/**
 * Decrypts a v2 secret for `ctx`. Refuses v1 (and anything else unknown). A context mismatch of any field — or a
 * platform blob opened with the workspace ring — fails authentication.
 */
export function decryptSecretV2<T>(ciphertext: string, keyId: string, ctx: SecretContext): T {
  const ring = ringOf(ctx);
  const p = parseV2(ciphertext);
  if (p.kind === "waveA") {
    if (ring !== "workspace" || ctx.revision !== undefined || (ctx.scope ?? "workspace") !== "workspace") throw new SecretFormatError();
    const key = keys("workspace").all.get(keyId);
    if (!key) throw new CryptoConfigError(`Encryption key ${keyId} is not available`);
    return JSON.parse(gcmDecrypt(key.bytes, p.iv, p.tag, p.ct, aadWaveA(ctx)).toString("utf8")) as T;
  }
  const aad = aadV2(ctx);
  const dek = openDek(ring, p, keyId, aad);
  try {
    return JSON.parse(gcmDecrypt(dek, p.iv, p.tag, p.ct, aad).toString("utf8")) as T;
  } finally {
    dek.fill(0);
  }
}

/** The KEK id embedded in a v2 envelope (for columns that store only the ciphertext). Strictly parsed. */
export function envelopeKeyId(ciphertext: string): string {
  const p = parseV2(ciphertext);
  if (p.kind !== "envelope") throw new SecretFormatError();
  return p.kekId;
}

/** True when the blob is a v2 envelope under the ring's CURRENT key (nothing to rewrap). */
export function isCurrentEnvelope(ciphertext: string, ctx: SecretContext): boolean {
  try {
    const p = parseV2(ciphertext);
    return p.kind === "envelope" && p.kekId === keys(ringOf(ctx)).current.id;
  } catch {
    return false;
  }
}

/**
 * KEK rotation / format upgrade. An envelope under an old KEK gets its DEK re-wrapped with the current KEK (payload
 * untouched). A Wave A v2 blob is re-encrypted into an envelope. Use `legacyV1: true` ONLY for rows marked legacy.
 * Rewrapping does NOT invalidate a copy an attacker already stole with the old KEK — rotate the provider secret too.
 */
export function rewrapSecret(ciphertext: string, keyId: string, ctx: SecretContext, opts: { legacyV1?: boolean } = {}): { ciphertext: string; keyId: string } {
  if (ciphertext.startsWith("v1.")) {
    if (!opts.legacyV1) throw new SecretFormatError("Legacy ciphertext refused for a migrated row");
    return encryptSecretV2(decryptLegacyV1(ciphertext, keyId), ctx);
  }
  const ring = ringOf(ctx);
  const p = parseV2(ciphertext);
  if (p.kind === "waveA") return encryptSecretV2(decryptSecretV2(ciphertext, keyId, ctx), ctx);
  const aad = aadV2(ctx);
  const dek = openDek(ring, p, keyId, aad);
  try {
    gcmDecrypt(dek, p.iv, p.tag, p.ct, aad); // authenticate the payload before re-wrapping it
    const { current } = keys(ring);
    const out = ["v2", ENVELOPE_ALG, ...wrapDek(ring, current, dek, aad), p.iv.toString("base64"), p.tag.toString("base64"), p.ct.toString("base64")].join(".");
    return { ciphertext: out, keyId: current.id };
  } finally {
    dek.fill(0);
  }
}

/**
 * Opens a secret column honouring the row's legacy marker: v1 is accepted ONLY when `legacy` is true (a row written
 * before crypto v2 and not yet rewrapped). Migrated rows (legacy=false) require v2, so a planted v1 blob fails.
 */
export function openSecret<T>(row: { ciphertext: string; keyId: string; legacy: boolean }, ctx: SecretContext): T {
  if (row.ciphertext.startsWith("v1.")) {
    if (!row.legacy) throw new SecretFormatError("Legacy ciphertext refused for a migrated row");
    return decryptLegacyV1<T>(row.ciphertext, row.keyId);
  }
  return decryptSecretV2<T>(row.ciphertext, row.keyId, ctx);
}

export function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

/** Short, AAD-safe id derived from an arbitrary string (node ids, OAuth states). */
export function contextId(value: string) {
  return sha256Hex(value).slice(0, 32);
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

/** Constant-time string comparison (hashes first so lengths don't leak). */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
