import { randomUUID } from "node:crypto";
import { decryptSecretV2, encryptSecretV2, envelopeKeyId, type SecretContext } from "./crypto";

/**
 * Social-login tokens stored by better-auth (`account.access_token / refresh_token / id_token`) are encrypted at rest
 * through this adapter transformation (docs/security/CREDENTIALS_DESIGN.md MUST 22). Each value is a v2 envelope bound
 * to the account row, its user and provider and the field, so a token copied to another account/field doesn't decrypt.
 *
 * Writes: `create` allocates the row id first (AAD), `update`/`updateMany` look the rows up to bind the context.
 * Reads: values that are envelopes are decrypted; anything else (legacy plaintext rows written before this change —
 * rewrapped by scripts/admin/rewrap.mts) is returned as-is. An envelope that fails authentication reads as null.
 */
const FIELDS = { accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token" } as const;
type TokenField = keyof typeof FIELDS;
type Rec = Record<string, unknown>;
type Where = { field: string; value: unknown; operator?: string; connector?: string }[];

interface AdapterLike {
  create(args: { model: string; data: Rec; select?: string[]; forceAllowId?: boolean }): Promise<unknown>;
  update(args: { model: string; where: Where; update: Rec }): Promise<unknown>;
  updateMany(args: { model: string; where: Where; update: Rec }): Promise<number>;
  findOne(args: { model: string; where: Where; select?: string[]; join?: unknown }): Promise<unknown>;
  findMany(args: { model: string; where?: Where; limit?: number; select?: string[]; sortBy?: unknown; offset?: number; join?: unknown }): Promise<unknown[]>;
  transaction?: <R>(cb: (trx: AdapterLike) => Promise<R>) => Promise<R>;
  [k: string]: unknown;
}

function ctxFor(row: { id: string; userId: string; providerId: string }, field: TokenField): SecretContext {
  return { table: "account", rowId: row.id, workspaceId: row.userId, scope: "user", provider: row.providerId, purpose: FIELDS[field] };
}

function isEnvelope(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("v2.a256gcm-kw.");
}

export function encryptAccountTokens(data: Rec, row: { id: string; userId: string; providerId: string }): Rec {
  const out = { ...data };
  for (const f of Object.keys(FIELDS) as TokenField[]) {
    const v = out[f];
    if (typeof v === "string" && v && !isEnvelope(v)) out[f] = encryptSecretV2(v, ctxFor(row, f)).ciphertext;
  }
  return out;
}

export function decryptAccountTokens<T>(rec: T): T {
  if (!rec || typeof rec !== "object") return rec;
  const r = rec as Rec;
  if (typeof r.id !== "string" || typeof r.userId !== "string" || typeof r.providerId !== "string") return rec;
  const out: Rec = { ...r };
  for (const f of Object.keys(FIELDS) as TokenField[]) {
    const v = out[f];
    if (!isEnvelope(v)) continue;
    try {
      out[f] = decryptSecretV2<string>(v, envelopeKeyId(v), ctxFor(r as { id: string; userId: string; providerId: string }, f));
    } catch {
      out[f] = null;
    }
  }
  return out as T;
}

function hasTokenFields(data: Rec) {
  return Object.keys(FIELDS).some((f) => typeof data[f] === "string" && data[f]);
}

/** Decrypts account rows nested in joined results (e.g. user + accounts). */
function decryptNested<T>(rec: T): T {
  if (!rec || typeof rec !== "object") return rec;
  const r = rec as Rec;
  if (Array.isArray(r.account)) return { ...r, account: r.account.map((a) => decryptAccountTokens(a)) } as T;
  return rec;
}

export function wrapAccountTokenEncryption<A extends AdapterLike>(inner: A): A {
  const wrapped: AdapterLike = {
    ...inner,
    async create(args) {
      if (args.model !== "account" || !hasTokenFields(args.data)) return inner.create(args);
      const id = typeof args.data.id === "string" && args.data.id ? args.data.id : randomUUID();
      const data = encryptAccountTokens({ ...args.data, id }, { id, userId: String(args.data.userId), providerId: String(args.data.providerId) });
      return decryptAccountTokens(await inner.create({ ...args, data, forceAllowId: true }));
    },
    async update(args) {
      if (args.model !== "account" || !hasTokenFields(args.update)) {
        const res = await inner.update(args);
        return args.model === "account" ? decryptAccountTokens(res) : res;
      }
      const row = (await inner.findOne({ model: "account", where: args.where })) as Rec | null;
      if (!row) return null;
      const update = encryptAccountTokens(args.update, { id: String(row.id), userId: String(row.userId), providerId: String(row.providerId) });
      return decryptAccountTokens(await inner.update({ ...args, update }));
    },
    async updateMany(args) {
      if (args.model !== "account" || !hasTokenFields(args.update)) return inner.updateMany(args);
      const rows = (await inner.findMany({ model: "account", where: args.where })) as Rec[];
      for (const row of rows) {
        const update = encryptAccountTokens(args.update, { id: String(row.id), userId: String(row.userId), providerId: String(row.providerId) });
        await inner.update({ model: "account", where: [{ field: "id", value: row.id }], update });
      }
      return rows.length;
    },
    async findOne(args) {
      const res = await inner.findOne(args);
      return args.model === "account" ? decryptAccountTokens(res) : decryptNested(res);
    },
    async findMany(args) {
      const res = await inner.findMany(args);
      return args.model === "account" ? res.map((r) => decryptAccountTokens(r)) : res.map((r) => decryptNested(r));
    },
  };
  if (inner.transaction) wrapped.transaction = (cb) => inner.transaction!((trx) => cb(wrapAccountTokenEncryption(trx)));
  return wrapped as A;
}
