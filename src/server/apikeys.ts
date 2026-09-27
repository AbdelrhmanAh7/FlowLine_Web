import { timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./access";
import { audit, userActor, type Actor } from "./audit";
import { randomToken, sha256Hex } from "./crypto";
import { HttpError, notFound } from "./http";
import { can, type Capability } from "./permissions";

/** What a key may do. A key never exceeds its scopes, and never exceeds its creator's current role. */
export const API_SCOPES = {
  "flows:read": "List flows and their published versions",
  "runs:read": "Read run status and results",
  "runs:write": "Start runs of flows",
  "agents:run": "Start agent runs and read their results",
} as const;
export type ApiScope = keyof typeof API_SCOPES;

/** Capability the key's creator must still hold for each scope (checked on every request). */
const SCOPE_NEEDS: Record<ApiScope, Capability> = {
  "flows:read": "flow.view",
  "runs:read": "flow.view",
  "runs:write": "flow.run",
  "agents:run": "agent.run",
};

const KEY_RE = /^fl_(test|live)_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export interface ApiPrincipal {
  keyId: string;
  workspaceId: string;
  mode: "test" | "live";
  scopes: ApiScope[];
  /** Runs started with the key act with this user's permissions (re-checked when they execute). */
  actingUserId: string;
  label: string;
  actor: Actor;
}

export async function createApiKey(user: CurrentUser, workspaceId: string, input: { name: string; mode: "test" | "live"; scopes: ApiScope[]; expiresInDays?: number | null }) {
  if (input.scopes.length === 0) throw new HttpError(400, "VALIDATION", "Choose at least one scope");
  const prefix = randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(8, "0").slice(0, 8);
  const secret = randomToken(32).slice(0, 43).padEnd(43, "A");
  const key = `fl_${input.mode}_${prefix}_${secret}`;
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const [row] = await db
    .insert(schema.apiKey)
    .values({ workspaceId, name: input.name, mode: input.mode, prefix: `fl_${input.mode}_${prefix}`, keyHash: sha256Hex(key), scopes: input.scopes, createdBy: user.id, expiresAt })
    .returning();
  await audit(db, { workspaceId, actor: userActor(user), action: "apikey.created", targetType: "api_key", targetId: row!.id, data: { name: input.name, mode: input.mode, scopes: input.scopes, expiresAt } });
  return { key, apiKey: publicKey(row!) };
}

export function publicKey(k: typeof schema.apiKey.$inferSelect) {
  const now = new Date();
  const status = k.revokedAt ? "revoked" : k.expiresAt && k.expiresAt < now ? "expired" : "active";
  return { id: k.id, name: k.name, mode: k.mode, prefix: k.prefix, scopes: k.scopes, status, createdAt: k.createdAt, expiresAt: k.expiresAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt };
}

export async function listApiKeys(workspaceId: string) {
  const rows = await db.select().from(schema.apiKey).where(eq(schema.apiKey.workspaceId, workspaceId)).orderBy(desc(schema.apiKey.createdAt));
  return rows.map(publicKey);
}

export async function revokeApiKey(user: CurrentUser, workspaceId: string, keyId: string) {
  const [row] = await db
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKey.id, keyId), eq(schema.apiKey.workspaceId, workspaceId)))
    .returning();
  if (!row) throw notFound("API key not found");
  await audit(db, { workspaceId, actor: userActor(user), action: "apikey.revoked", targetType: "api_key", targetId: keyId, data: { name: row.name } });
  return publicKey(row);
}

/**
 * Authenticates `Authorization: Bearer fl_…`. Every failure is a 401 with a reason that
 * doesn't reveal whether other keys exist. Updates last_used_at (at most once a minute).
 */
export async function authenticateApiKey(req: Request): Promise<ApiPrincipal> {
  const h = req.headers.get("authorization") ?? "";
  const raw = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!raw) throw new HttpError(401, "API_KEY_REQUIRED", "Send an API key: Authorization: Bearer fl_…");
  const m = KEY_RE.exec(raw);
  if (!m) throw new HttpError(401, "API_KEY_INVALID", "Invalid API key");
  const hash = sha256Hex(raw);
  const [k] = await db.select().from(schema.apiKey).where(eq(schema.apiKey.keyHash, hash));
  if (!k || !timingSafeEqual(Buffer.from(k.keyHash), Buffer.from(hash))) throw new HttpError(401, "API_KEY_INVALID", "Invalid API key");
  if (k.revokedAt) throw new HttpError(401, "API_KEY_REVOKED", "This API key was revoked");
  if (k.expiresAt && k.expiresAt < new Date()) throw new HttpError(401, "API_KEY_EXPIRED", "This API key expired");
  if (!k.createdBy) throw new HttpError(401, "API_KEY_ORPHANED", "This API key's creator no longer exists — create a new key");
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) {
    await db.update(schema.apiKey).set({ lastUsedAt: new Date() }).where(eq(schema.apiKey.id, k.id));
  }
  return {
    keyId: k.id,
    workspaceId: k.workspaceId,
    mode: k.mode as "test" | "live",
    scopes: k.scopes as ApiScope[],
    actingUserId: k.createdBy,
    label: k.prefix,
    actor: { kind: "apikey", apiKeyId: k.id, label: `API key ${k.prefix}` },
  };
}

/** The key must carry the scope AND its creator must still hold the matching capability. */
export async function requireScope(p: ApiPrincipal, scope: ApiScope) {
  if (!p.scopes.includes(scope)) throw new HttpError(403, "INSUFFICIENT_SCOPE", `This API key lacks the "${scope}" scope`);
  const [m] = await db
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, p.workspaceId), eq(schema.workspaceMember.userId, p.actingUserId)));
  if (!can(m?.role, SCOPE_NEEDS[scope])) throw new HttpError(403, "KEY_OWNER_NOT_ALLOWED", "The user who created this API key no longer has access for this — create a new key");
}
