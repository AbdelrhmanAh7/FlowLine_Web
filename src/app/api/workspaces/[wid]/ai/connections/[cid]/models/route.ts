import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAiConnection, limitKeyOps, publicById } from "@/ai/hub/connections";
import { refreshCatalogue } from "@/ai/hub/discovery";
import { requireUser, requireWorkspace } from "@/server/access";
import { HttpError, jsonNoStore, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

/** The models this connection's credential can see (last valid snapshot; `stale` when the last refresh failed). */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid);
  const conn = await getAiConnection(db, workspace.id, cid);
  const models = await db
    .select({ modelId: schema.aiConnectionModel.modelId, ownedBy: schema.aiConnectionModel.ownedBy, removedAt: schema.aiConnectionModel.removedAt, accessConfirmedAt: schema.aiConnectionModel.accessConfirmedAt, lastSeenAt: schema.aiConnectionModel.lastSeenAt })
    .from(schema.aiConnectionModel)
    .where(eq(schema.aiConnectionModel.connectionId, conn.id))
    .orderBy(asc(schema.aiConnectionModel.modelId));
  return jsonNoStore({ models, stale: conn.catalogStale, catalogError: conn.catalogError, refreshedAt: conn.catalogRefreshedAt });
});

/** Manual refresh (owner). A failed or malformed listing keeps the last valid snapshot and marks it stale. */
export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, "ai.manage");
  const conn = await getAiConnection(db, workspace.id, cid);
  if (conn.status === "REVOKED") throw new HttpError(409, "AI_CONNECTION_REVOKED", "This connection was disconnected");
  await limitKeyOps(user.id, conn.id);
  const r = await refreshCatalogue(db, conn);
  return jsonNoStore({ ...r, connection: await publicById(db, conn.id) });
});
