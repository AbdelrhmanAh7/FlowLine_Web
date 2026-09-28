import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { PriceTable, Role } from "@/db/schema";
import { can } from "@/lib/permissions";
import { resolvePrice } from "./pricing";
import { listModels } from "./protocols";
import { getProviderDef, isConnectable } from "./registry";
import { HubError, UNKNOWN_CAPABILITIES, type DiscoveredModel } from "./types";
import { loadCredentials } from "./credentials";

type Conn = typeof schema.aiConnection.$inferSelect;

/**
 * Model discovery. The provider's listing API is the source of what a CREDENTIAL can see; it is stored per
 * connection (ai_connection_model). A failed or malformed refresh never wipes the last valid snapshot: the
 * connection's catalogue is marked stale with the reason. A model that disappears from the listing is marked
 * removed (not deleted), so a step pinned to it fails with an actionable error instead of an opaque 404.
 */
export async function storeCatalogue(db: Db, conn: Conn, models: DiscoveredModel[]) {
  const now = new Date();
  await db.transaction(async (tx) => {
    if (models.length) {
      await tx
        .insert(schema.aiConnectionModel)
        .values(models.map((m) => ({ connectionId: conn.id, workspaceId: conn.workspaceId, modelId: m.id, ownedBy: m.ownedBy, listed: true, lastSeenAt: now })))
        .onConflictDoUpdate({
          target: [schema.aiConnectionModel.connectionId, schema.aiConnectionModel.modelId],
          set: { listed: true, lastSeenAt: now, removedAt: null, ownedBy: sql`excluded.owned_by` },
        });
    }
    const ids = models.map((m) => m.id);
    await tx
      .update(schema.aiConnectionModel)
      .set({ listed: false, removedAt: now })
      .where(
        and(
          eq(schema.aiConnectionModel.connectionId, conn.id),
          isNull(schema.aiConnectionModel.removedAt),
          ids.length ? sql`${schema.aiConnectionModel.modelId} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql`true`,
        ),
      );
    await tx.update(schema.aiConnection).set({ catalogRefreshedAt: now, catalogStale: false, catalogError: null, updatedAt: now }).where(eq(schema.aiConnection.id, conn.id));
  });
}

export async function markCatalogueFailure(db: Db, conn: Conn, e: HubError) {
  await db.update(schema.aiConnection).set({ catalogStale: true, catalogError: `${e.code}: ${e.message}`.slice(0, 300), updatedAt: new Date() }).where(eq(schema.aiConnection.id, conn.id));
}

/** Refreshes one connection's catalogue. Returns ok=false (and keeps the last snapshot, stale) on any failure. */
export async function refreshCatalogue(db: Db, conn: Conn): Promise<{ ok: true; count: number } | { ok: false; code: string; message: string }> {
  const def = getProviderDef(conn.provider);
  if (!def || !isConnectable(def)) return { ok: false, code: "AI_PROVIDER_NOT_AVAILABLE", message: "This provider isn't available" };
  try {
    const models = await listModels(def, loadCredentials(conn));
    await storeCatalogue(db, conn, models);
    return { ok: true, count: models.length };
  } catch (e) {
    const he = e instanceof HubError ? e : new HubError("AI_CATALOGUE_UNAVAILABLE", "The model list couldn't be loaded");
    await markCatalogueFailure(db, conn, he);
    if (he.code === "AI_AUTH_FAILED") {
      await db.update(schema.aiConnection).set({ status: "DEGRADED", lastError: { code: he.code, message: he.message, at: new Date().toISOString() } }).where(eq(schema.aiConnection.id, conn.id));
    }
    return { ok: false, code: he.code, message: he.message };
  }
}

/** Bounded background refresh (worker): at most `max` connections whose catalogue is older than `olderThanMs`. */
export async function backgroundRefresh(db: Db, opts: { max?: number; olderThanMs?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? 24 * 3600_000));
  const due = await db
    .select()
    .from(schema.aiConnection)
    .where(and(inArray(schema.aiConnection.status, ["CONNECTED", "DEGRADED"]), or(isNull(schema.aiConnection.catalogRefreshedAt), lt(schema.aiConnection.catalogRefreshedAt, cutoff))))
    .orderBy(asc(schema.aiConnection.catalogRefreshedAt))
    .limit(opts.max ?? 5);
  let refreshed = 0;
  for (const c of due) if ((await refreshCatalogue(db, c)).ok) refreshed++;
  return { checked: due.length, refreshed };
}

export interface PickerModel {
  connectionId: string;
  connectionLabel: string;
  provider: string;
  providerName: string;
  routeKind: "direct" | "gateway";
  modelId: string;
  ownedBy: string | null;
  lifecycle: "active" | "removed";
  accessConfirmed: boolean;
  capabilities: typeof UNKNOWN_CAPABILITIES;
  contextWindow: number | null;
  price: { known: boolean; source: string | null; inputPerMTokMicros: number | null; outputPerMTokMicros: number | null };
}

/** Whether `role` may USE this connection (capability ai.use AND listed in the connection's use_roles). */
export function roleMayUse(role: Role | null | undefined, conn: Pick<Conn, "useRoles" | "status">) {
  return Boolean(role && can(role, "ai.use") && conn.useRoles.includes(role) && conn.status !== "REVOKED");
}

/** Models the given member may pick: only from connections they are allowed to use. Nothing secret is returned. */
export async function listPickerModels(db: Db, workspace: { id: string; prices: PriceTable }, role: Role): Promise<PickerModel[]> {
  const conns = (await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.workspaceId, workspace.id))).filter((c) => roleMayUse(role, c));
  if (!conns.length) return [];
  const rows = await db
    .select()
    .from(schema.aiConnectionModel)
    .where(inArray(schema.aiConnectionModel.connectionId, conns.map((c) => c.id)));
  const providers = [...new Set(conns.map((c) => c.provider))];
  const catalogue = await db.select().from(schema.aiModel).where(inArray(schema.aiModel.provider, providers));
  const cat = new Map(catalogue.map((m) => [`${m.provider}/${m.modelId}`, m]));
  const byId = new Map(conns.map((c) => [c.id, c]));
  return rows
    .map((r) => {
      const c = byId.get(r.connectionId)!;
      const def = getProviderDef(c.provider);
      const m = cat.get(`${c.provider}/${r.modelId}`);
      const price = resolvePrice(workspace.prices, c.provider, r.modelId, m?.pricing);
      return {
        connectionId: c.id,
        connectionLabel: c.label,
        provider: c.provider,
        providerName: def?.name ?? c.provider,
        routeKind: def?.routeKind ?? "direct",
        modelId: r.modelId,
        ownedBy: r.ownedBy,
        lifecycle: r.removedAt ? ("removed" as const) : ("active" as const),
        accessConfirmed: Boolean(r.accessConfirmedAt),
        capabilities: m?.capabilities ?? UNKNOWN_CAPABILITIES,
        contextWindow: m?.contextWindow ?? null,
        price: { known: Boolean(price), source: price?.source ?? null, inputPerMTokMicros: price?.inputPerMTokMicros ?? null, outputPerMTokMicros: price?.outputPerMTokMicros ?? null },
      };
    })
    .sort((a, b) => a.connectionLabel.localeCompare(b.connectionLabel) || a.modelId.localeCompare(b.modelId));
}
