import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiRouteRef, Role } from "@/db/schema";
import { HttpError, notFound } from "@/server/http";
import { checkRate } from "@/server/rate-limit";
import { encryptAiKey, keyHint, loadCredentials, validateApiKey } from "./credentials";
import { refreshCatalogue, stillCurrent, storeCatalogue } from "./discovery";
import { executeAi } from "./execute";
import { canCheckKey, checkKeyEndpoint, keyCheckOf, listModels } from "./protocols";
import { getProviderDef, isConnectable, type ProviderDefinition } from "./registry";
import { DEFAULT_POLICY, isRouteRef, resolveRoute } from "./routing";
import { validateSettings } from "./transport";
import { HubError } from "./types";

type Conn = typeof schema.aiConnection.$inferSelect;

/**
 * Workspace BYOK connections: configure (auth/metadata test = a model listing, never a billable inference),
 * test, explicit disclosed inference test, replace key (rotation; next call uses the new key — no cache),
 * disconnect (secret wiped, status REVOKED), use roles. Keys come ONLY from the owner through the UI/API.
 */
export const USE_ROLE_CHOICES: Role[] = ["owner", "editor"];

/** How a key was proven to work: an authenticated metadata check (by the provider's key-check kind) or an inference. */
export type KeyProof = "listing" | "key-endpoint" | "inference";

/**
 * Whether the stored proof verifies the CURRENT key (CXH-11): the method must be a real key check for this provider
 * today (a key-required listing / authenticated key endpoint) or a disclosed inference test, and it must have been
 * made with the current credential version. A public listing or a static catalogue never proves a key.
 */
export function keyProof(c: Pick<Conn, "provider" | "keyCheckMethod" | "keyCheckedCredVersion" | "credVersion">): KeyProof | null {
  const def = getProviderDef(c.provider);
  const m = c.keyCheckMethod;
  if (c.keyCheckedCredVersion == null || c.keyCheckedCredVersion !== c.credVersion) return null;
  if (m === "inference") return m;
  if ((m === "listing" || m === "key-endpoint") && def && canCheckKey(def) && keyCheckOf(def) === m) return m;
  return null;
}

export function publicAiConnection(c: Conn, counts?: { discovered: number; accessConfirmed: number; removed: number }) {
  const def = getProviderDef(c.provider);
  return {
    id: c.id,
    provider: c.provider,
    providerName: def?.name ?? c.provider,
    label: c.label,
    // "••••WXYZ" only for long keys; short keys show only the date the key was set (security review).
    keyHint: c.status === "REVOKED" || !c.keyHint || c.keyHint.startsWith("set:") ? null : c.keyHint,
    keySetAt: c.status === "REVOKED" ? null : c.keyHint?.startsWith("set:") ? c.keyHint.slice(4) : null,
    /**
     * How the key can be checked for free: "listing" / "key-endpoint" (authenticated metadata call), "public-listing"
     * (the model list is public: it proves nothing) or "none" (no list). See `keyCheckOf`.
     */
    keyCheck: def ? keyCheckOf(def) : ("none" as const),
    /**
     * The key itself has been proven to work — an authenticated metadata check or a successful disclosed inference
     * test, made with the CURRENT credential version — and the connection is healthy. A public listing never sets
     * this, nor does a pre-fix timestamp without its method (CXH-11).
     */
    keyVerified: c.status === "CONNECTED" && c.lastTestedAt != null && keyProof(c) != null,
    keyCheckMethod: keyProof(c),
    settings: c.settings,
    useRoles: c.useRoles,
    status: c.status,
    verification: c.verification,
    lastTestedAt: c.lastTestedAt,
    lastError: c.lastError,
    credVersion: c.credVersion,
    catalogRefreshedAt: c.catalogRefreshedAt,
    catalogStale: c.catalogStale,
    catalogError: c.catalogError,
    createdAt: c.createdAt,
    createdBy: c.createdBy,
    lastUsedAt: c.lastUsedAt,
    revokedAt: c.revokedAt,
    models: counts ?? { discovered: 0, accessConfirmed: 0, removed: 0 },
  };
}

async function counts(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { discovered: number; accessConfirmed: number; removed: number }>();
  const rows = await db
    .select({
      id: schema.aiConnectionModel.connectionId,
      discovered: sql<number>`count(*) filter (where ${schema.aiConnectionModel.removedAt} is null)::int`,
      accessConfirmed: sql<number>`count(*) filter (where ${schema.aiConnectionModel.accessConfirmedAt} is not null and ${schema.aiConnectionModel.removedAt} is null)::int`,
      removed: sql<number>`count(*) filter (where ${schema.aiConnectionModel.removedAt} is not null)::int`,
    })
    .from(schema.aiConnectionModel)
    .where(inArray(schema.aiConnectionModel.connectionId, ids))
    .groupBy(schema.aiConnectionModel.connectionId);
  return new Map(rows.map((r) => [r.id, { discovered: r.discovered, accessConfirmed: r.accessConfirmed, removed: r.removed }]));
}

export async function listAiConnections(db: Db, workspaceId: string) {
  const rows = await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.workspaceId, workspaceId)).orderBy(schema.aiConnection.createdAt);
  const c = await counts(db, rows.map((r) => r.id));
  return rows.map((r) => publicAiConnection(r, c.get(r.id)));
}

export async function getAiConnection(db: Db, workspaceId: string, connectionId: string): Promise<Conn> {
  const [c] = await db.select().from(schema.aiConnection).where(and(eq(schema.aiConnection.id, connectionId), eq(schema.aiConnection.workspaceId, workspaceId)));
  if (!c) throw notFound("Connection not found");
  return c;
}

export async function publicById(db: Db, id: string) {
  const [row] = await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.id, id));
  return publicAiConnection(row!, (await counts(db, [id])).get(id));
}

function connectableDef(providerId: string): ProviderDefinition {
  const def = getProviderDef(providerId);
  if (!def) throw notFound("Unknown AI provider");
  if (!isConnectable(def)) throw new HttpError(422, "AI_PROVIDER_NOT_AVAILABLE", `${def.name} can't be connected yet`);
  return def;
}

function cleanSettings(def: ProviderDefinition, settings: Record<string, string> | undefined) {
  try {
    return validateSettings(def, settings ?? {});
  } catch (e) {
    if (e instanceof HubError) throw new HttpError(400, e.code, e.message);
    throw e;
  }
}

/**
 * Metadata-only credential check + discovery. Where the provider documents an authenticated, non-billable key
 * endpoint it is called first (OpenRouter); then the models are listed. Only an AUTHENTICATED listing checks the key:
 * a public one (DeepInfra, Vercel) or a static catalogue (Z.ai, Alibaba) doesn't (keyCheck "public-listing" / "none").
 * Maps failures to HTTP errors for the settings UI.
 */
async function verifyKey(def: ProviderDefinition, apiKey: string, settings: Record<string, string>) {
  try {
    if (def.keyCheckPath) await checkKeyEndpoint(def, { apiKey, settings });
    return await listModels(def, { apiKey, settings });
  } catch (e) {
    if (!(e instanceof HubError)) throw e;
    if (e.code === "AI_AUTH_FAILED" || e.code === "AI_FORBIDDEN") throw new HttpError(400, "AI_KEY_REJECTED", `${def.name} rejected this API key`);
    if (e.code === "AI_PLAN_NOT_ALLOWED" || e.code === "AI_TRIAL_KEY" || e.code === "AI_SETTINGS_INVALID") throw new HttpError(400, e.code, e.message);
    if (e.code === "AI_EGRESS_BLOCKED" || e.code === "AI_REDIRECT_REFUSED" || e.code === "AI_CUSTOM_ENDPOINT_NOT_APPROVED") throw new HttpError(400, e.code, e.message);
    if (e.code === "AI_CATALOGUE_MALFORMED") throw new HttpError(502, e.code, `${def.name} answered, but its model list is malformed: ${e.message}`);
    throw new HttpError(502, "AI_PROVIDER_UNREACHABLE", `Couldn't reach ${def.name} to check the key: ${e.message}`);
  }
}

/** Key submissions and tests call the provider: limited per acting user and per connection. */
export const KEY_OPS_PER_MINUTE_PER_USER = 20;
export const KEY_OPS_PER_MINUTE_PER_CONNECTION = 10;
export async function limitKeyOps(userId: string, connectionId?: string) {
  if (!(await checkRate(`ai-key:user:${userId}`, KEY_OPS_PER_MINUTE_PER_USER))) throw new HttpError(429, "RATE_LIMITED", "Too many AI key checks — wait a minute and try again.");
  if (connectionId && !(await checkRate(`ai-key:conn:${connectionId}`, KEY_OPS_PER_MINUTE_PER_CONNECTION))) {
    throw new HttpError(429, "RATE_LIMITED", "Too many checks on this connection — wait a minute and try again.");
  }
}

function hubToHttp(e: unknown): never {
  if (e instanceof HubError) throw new HttpError(400, e.code, e.message);
  throw e;
}

export async function createAiConnection(
  db: Db,
  userId: string,
  workspaceId: string,
  input: { provider: string; label: string; apiKey: string; settings?: Record<string, string>; attestPayAsYouGo?: boolean },
) {
  const def = connectableDef(input.provider);
  let apiKey: string;
  try {
    apiKey = validateApiKey(input.apiKey);
  } catch (e) {
    hubToHttp(e);
  }
  const settings = cleanSettings(def, input.settings);
  // Coding-plan / subscription keys can't be told apart by shape: the owner confirms it's a pay-as-you-go key.
  if (def.requiresPlanAttestation && input.attestPayAsYouGo !== true) {
    throw new HttpError(422, "AI_PLAN_ATTESTATION_REQUIRED", `${def.name}: confirm this is a pay-as-you-go API key. ${def.planWarning ?? ""}`.trim());
  }
  const models = await verifyKey(def, apiKey, settings);
  const observedAt = new Date();
  const checked = canCheckKey(def);
  // The id is generated here so the ciphertext is bound to this exact row (v2 AAD) before the insert.
  const id = randomUUID();
  const enc = encryptAiKey(apiKey, { id, workspaceId, provider: def.id });
  const now = new Date();
  const [row] = await db
    .insert(schema.aiConnection)
    .values({
      id,
      workspaceId,
      provider: def.id,
      label: input.label.trim().slice(0, 80) || def.name,
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      keyHint: keyHint(apiKey, now),
      settings,
      useRoles: ["owner"],
      status: "CONNECTED",
      verification: def.contractVerified ? "CONTRACT_VERIFIED" : "IMPLEMENTED",
      credVersion: 1,
      lastTestedAt: checked ? now : null,
      keyCheckMethod: checked ? keyCheckOf(def) : null,
      keyCheckedCredVersion: checked ? 1 : null,
      createdBy: userId,
    })
    .returning();
  await storeCatalogue(db, row!, models, observedAt);
  return publicById(db, row!.id);
}

/**
 * "Test connection": the same metadata-only check (and it refreshes the model list). Records health — but only for
 * the key it tested: every write is fenced on the credential version read before the network call and on the
 * connection not being disconnected meanwhile (CXH-12). A stale result is discarded, never written.
 */
export async function testAiConnection(db: Db, conn: Conn) {
  if (conn.status === "REVOKED") throw new HttpError(409, "AI_CONNECTION_REVOKED", "This connection was disconnected");
  const def = getProviderDef(conn.provider);
  if (def && !canCheckKey(def)) {
    // Refreshing a static catalogue or a PUBLIC model list proves nothing about the key. Say so (no fake success).
    const r = await refreshCatalogue(db, conn);
    const why = keyCheckOf(def) === "public-listing" ? `${def.name}'s model list is public, so listing models doesn't check the key.` : `${def.name} has no model-list endpoint, so the key can't be checked without an inference.`;
    return {
      ok: false,
      code: "AI_KEY_NOT_CHECKABLE",
      message: `${why} Run the inference test to confirm it.${r.ok ? "" : ` (${r.message})`}`,
      connection: await publicById(db, conn.id),
    };
  }
  let r: Awaited<ReturnType<typeof refreshCatalogue>> | null = null;
  if (def?.keyCheckPath) {
    try {
      await checkKeyEndpoint(def, loadCredentials(conn));
    } catch (e) {
      if (!(e instanceof HubError)) throw e;
      r = { ok: false, code: e.code, message: e.message };
    }
  }
  r ??= await refreshCatalogue(db, conn);
  const now = new Date();
  // The fence (same key, not disconnected) guards every health write: never CONNECTED over REVOKED.
  // The proof records HOW and for WHICH credential version the key was checked (CXH-11).
  if (r.ok) {
    await db
      .update(schema.aiConnection)
      .set({ status: "CONNECTED", lastTestedAt: now, keyCheckMethod: def ? keyCheckOf(def) : null, keyCheckedCredVersion: conn.credVersion, lastError: null, updatedAt: now })
      .where(stillCurrent(conn));
  } else if (r.code !== "AI_CONNECTION_CHANGED") {
    await db
      .update(schema.aiConnection)
      .set({ status: "DEGRADED", lastTestedAt: now, keyCheckMethod: null, keyCheckedCredVersion: null, lastError: { code: r.code, message: r.message, at: now.toISOString() }, updatedAt: now })
      .where(stillCurrent(conn));
  }
  return { ok: r.ok, ...(r.ok ? { models: r.count } : { code: r.code, message: r.message }), connection: await publicById(db, conn.id) };
}

/**
 * Explicit, disclosed inference test: only when the owner asks for it (confirm = true), one tiny request
 * (max 8 output tokens), metered and recorded like any other call.
 */
export async function inferenceTest(db: Db, userId: string, workspace: typeof schema.workspace.$inferSelect, conn: Conn, modelId: string) {
  let route;
  try {
    route = await resolveRoute(db, workspace, { explicit: { connectionId: conn.id, modelId } });
  } catch (e) {
    hubToHttp(e);
  }
  try {
    const r = await executeAi(db, {
      workspace,
      actorUserId: userId,
      route,
      request: { system: "Connection test.", messages: [{ role: "user", content: "Reply with the single word OK." }], maxTokens: 8 },
      purpose: "connection_test",
      metering: "hub",
      // A connection test only ever calls THIS connection (never a fallback route).
      policy: { ...DEFAULT_POLICY, allowUnknownCost: workspace.aiPolicy?.allowUnknownCost ?? false },
      requestId: `aitest:${conn.id}:${Date.now()}`,
      signal: AbortSignal.timeout(60_000),
      maxAttempts: 1,
    });
    // A successful inference proves the key works (the only check for providers without a list endpoint).
    const now = new Date();
    // Fenced: only the key that answered is marked working (not a key replaced or disconnected meanwhile).
    await db
      .update(schema.aiConnection)
      .set({ lastTestedAt: now, keyCheckMethod: "inference", keyCheckedCredVersion: conn.credVersion, status: "CONNECTED", lastError: null, updatedAt: now })
      .where(stillCurrent(conn));
    return { ok: true, model: r.result.model, usage: r.result.usage, costMicros: r.costMicros, costSource: r.costSource };
  } catch (e) {
    if (e instanceof HubError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

/** Replace the key. The new key is checked first (metadata only); on success it takes effect for the next call. */
export async function replaceAiKey(db: Db, conn: Conn, rawKey: string) {
  if (conn.status === "REVOKED") throw new HttpError(409, "AI_CONNECTION_REVOKED", "This connection was disconnected; create a new one");
  const def = connectableDef(conn.provider);
  let apiKey: string;
  try {
    apiKey = validateApiKey(rawKey);
  } catch (e) {
    hubToHttp(e);
  }
  const models = await verifyKey(def, apiKey, cleanSettings(def, conn.settings));
  const observedAt = new Date();
  const enc = encryptAiKey(apiKey, conn);
  const now = new Date();
  // Fenced on the version read BEFORE the (slow) key check: a concurrent replace or disconnect wins; this one conflicts.
  const [row] = await db
    .update(schema.aiConnection)
    .set({
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      keyHint: keyHint(apiKey, now),
      credVersion: sql`${schema.aiConnection.credVersion} + 1`,
      status: "CONNECTED",
      lastError: null,
      lastTestedAt: canCheckKey(def) ? now : null,
      // The new key's proof (if its check was a real key check) is for the NEW credential version.
      keyCheckMethod: canCheckKey(def) ? keyCheckOf(def) : null,
      keyCheckedCredVersion: canCheckKey(def) ? sql`${schema.aiConnection.credVersion} + 1` : null,
      updatedAt: now,
    })
    .where(and(eq(schema.aiConnection.id, conn.id), eq(schema.aiConnection.credVersion, conn.credVersion), ne(schema.aiConnection.status, "REVOKED")))
    .returning();
  if (!row) throw new HttpError(409, "AI_CONNECTION_CHANGED", "This connection changed while the new key was being checked (another key replacement or a disconnect). Reload and try again.");
  // Access confirmations were for the old key: they no longer prove anything.
  await db.update(schema.aiConnectionModel).set({ accessConfirmedAt: null }).where(eq(schema.aiConnectionModel.connectionId, conn.id));
  await storeCatalogue(db, row!, models, observedAt);
  return publicById(db, conn.id);
}

/** Disconnect: the secret is wiped and the connection is REVOKED. Anything using it fails clearly (no fallback). */
export async function disconnectAiConnection(db: Db, conn: Conn) {
  const now = new Date();
  // One statement: key wiped, REVOKED, cred_version bumped — an in-flight call notices before it records success.
  await db
    .update(schema.aiConnection)
    .set({ secretEnc: null, keyId: null, keyHint: null, status: "REVOKED", revokedAt: now, updatedAt: now, credVersion: sql`${schema.aiConnection.credVersion} + 1` })
    .where(eq(schema.aiConnection.id, conn.id));
  return publicById(db, conn.id);
}

export async function setUseRoles(db: Db, conn: Conn, roles: string[]) {
  const set = [...new Set(roles)];
  if (!set.length) throw new HttpError(400, "VALIDATION", "At least one role must be allowed to use a connection");
  for (const r of set) if (!USE_ROLE_CHOICES.includes(r as Role)) throw new HttpError(400, "VALIDATION", `Role "${r}" can't use AI connections`);
  await db.update(schema.aiConnection).set({ useRoles: set, updatedAt: new Date() }).where(eq(schema.aiConnection.id, conn.id));
  return publicById(db, conn.id);
}

export async function setDefaultRoute(db: Db, workspaceId: string, ref: AiRouteRef | null) {
  if (ref) {
    if (!isRouteRef(ref)) throw new HttpError(400, "VALIDATION", "Invalid route");
    const conn = await getAiConnection(db, workspaceId, ref.connectionId).catch(() => {
      throw new HttpError(400, "AI_CONNECTION_MISSING", "That connection isn't in this workspace");
    });
    if (conn.status === "REVOKED") throw new HttpError(400, "AI_CONNECTION_REVOKED", "That connection was disconnected");
    const [m] = await db.select().from(schema.aiConnectionModel).where(and(eq(schema.aiConnectionModel.connectionId, conn.id), eq(schema.aiConnectionModel.modelId, ref.modelId)));
    if (!m || m.removedAt) throw new HttpError(400, "AI_MODEL_NOT_LISTED", `${ref.modelId} isn't offered by that connection`);
  }
  await db.update(schema.workspace).set({ aiDefaultRoute: ref ? { connectionId: ref.connectionId, modelId: ref.modelId } : null, updatedAt: new Date() }).where(eq(schema.workspace.id, workspaceId));
}

/**
 * Affected-items preview before replacing a key or disconnecting: flows whose draft or published version pins this
 * connection, whether it is the workspace default, and what relies on the default (AI steps without their own
 * route, agents in Wave A).
 */
export async function affectedBy(db: Db, workspaceId: string, connectionId: string) {
  const [ws] = await db.select({ route: schema.workspace.aiDefaultRoute, policy: schema.workspace.aiPolicy }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  const isDefault = ws?.route?.connectionId === connectionId;
  const flows = await db
    .select({ id: schema.flow.id, name: schema.flow.name, graph: schema.flow.graph, published: schema.flow.publishedVersionId })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt)));
  const pubIds = flows.map((f) => f.published).filter((x): x is string => Boolean(x));
  const pubGraphs = pubIds.length ? await db.select({ id: schema.flowVersion.id, graph: schema.flowVersion.graph }).from(schema.flowVersion).where(inArray(schema.flowVersion.id, pubIds)) : [];
  const pubById = new Map(pubGraphs.map((v) => [v.id, v.graph]));
  const aiNodes = (g: unknown) => ((g as { nodes?: { type: string; data?: { config?: { route?: AiRouteRef | null } } }[] })?.nodes ?? []).filter((n) => n.type.startsWith("ai."));
  const out: { id: string; name: string; published: boolean; via: "pinned" | "default" }[] = [];
  for (const f of flows) {
    const graphs = [f.graph, f.published ? pubById.get(f.published) : null];
    const nodes = graphs.flatMap(aiNodes);
    if (nodes.some((n) => n.data?.config?.route?.connectionId === connectionId)) out.push({ id: f.id, name: f.name, published: Boolean(f.published), via: "pinned" });
    else if (isDefault && nodes.some((n) => !n.data?.config?.route)) out.push({ id: f.id, name: f.name, published: Boolean(f.published), via: "default" });
  }
  const current = await db
    .select({ id: schema.agent.id, name: schema.agent.name, route: schema.agentVersion.route })
    .from(schema.agent)
    .innerJoin(schema.agentVersion, eq(schema.agentVersion.id, schema.agent.currentVersionId))
    .where(and(eq(schema.agent.workspaceId, workspaceId), isNull(schema.agent.deletedAt), isNotNull(schema.agent.currentVersionId)));
  const agents = current
    .filter((a) => (isRouteRef(a.route) ? a.route.connectionId === connectionId : isDefault))
    .map((a) => ({ id: a.id, name: a.name, via: isRouteRef(a.route) ? ("pinned" as const) : ("default" as const) }));
  const policy = ws?.policy;
  const cp = policy?.copilot;
  const copilot = [cp?.planRoute, cp?.repairRoute].some((r) => (isRouteRef(r) ? r.connectionId === connectionId : isDefault));
  const inPolicy = [...(policy?.fallbackRoutes ?? []), ...(policy?.lowCostPool ?? [])].some((r) => isRouteRef(r) && r.connectionId === connectionId);
  return { isDefault, flows: out, agents, copilot, inPolicy };
}

/** For run-time use elsewhere (worker facades): throws HubError when revoked. */
export { loadCredentials };
