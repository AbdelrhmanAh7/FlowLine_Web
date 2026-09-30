import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { limitKeyOps, disconnectAiConnection, getAiConnection, publicById, replaceAiKey, setUseRoles } from "@/ai/hub/connections";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

/** Loads the connection only inside the caller's workspace (another workspace's id → 404). */
async function load(ctx: Ctx, need: "viewer" | "ai.manage") {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, need);
  const conn = await getAiConnection(db, workspace.id, cid);
  return { user, workspace, conn };
}

export const GET = route(async (_req, ctx: Ctx) => {
  const { conn } = await load(ctx, "viewer");
  return jsonNoStore({ connection: await publicById(db, conn.id) });
});

const patch = z.union([
  z.object({ apiKey: z.string().max(600) }).strict(),
  z.object({ useRoles: z.array(z.string().max(20)).max(5) }).strict(),
  z.object({ label: z.string().trim().min(1).max(80) }).strict(),
]);

/** Replace the key (checked first; effective on the next call), change who may use it, or rename it. Owner only. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const { user, workspace, conn } = await load(ctx, "ai.manage");
  const b = await parseBody(req, patch);
  if ("apiKey" in b) {
    await limitKeyOps(user.id, conn.id);
    const connection = await replaceAiKey(db, conn, b.apiKey);
    await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "ai.key_replaced", targetType: "ai_connection", targetId: conn.id, data: { provider: conn.provider } });
    return jsonNoStore({ connection });
  }
  if ("useRoles" in b) {
    const connection = await setUseRoles(db, conn, b.useRoles);
    await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "ai.use_roles_changed", targetType: "ai_connection", targetId: conn.id, data: { useRoles: connection.useRoles } });
    return jsonNoStore({ connection });
  }
  await db.update(schema.aiConnection).set({ label: b.label, updatedAt: new Date() }).where(eq(schema.aiConnection.id, conn.id));
  return jsonNoStore({ connection: await publicById(db, conn.id) });
});

/** Disconnect: the key is wiped; anything using this connection fails clearly afterwards (no fallback). */
export const DELETE = route(async (_req, ctx: Ctx) => {
  const { user, workspace, conn } = await load(ctx, "ai.manage");
  const connection = await disconnectAiConnection(db, conn);
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "ai.disconnected", targetType: "ai_connection", targetId: conn.id, data: { provider: conn.provider, label: conn.label } });
  return jsonNoStore({ connection });
});
