import { db } from "@/db";
import { affectedBy, getAiConnection } from "@/ai/hub/connections";
import { requireUser, requireWorkspace } from "@/server/access";
import { jsonNoStore, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

/** Affected-items preview shown before replacing a key or disconnecting (owner). */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  const { workspace } = await requireWorkspace(user, wid, "ai.manage");
  const conn = await getAiConnection(db, workspace.id, cid);
  return jsonNoStore(await affectedBy(db, workspace.id, conn.id));
});
