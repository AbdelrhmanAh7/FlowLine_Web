import { z } from "zod";
import { db } from "@/db";
import { requireFlow, requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { shareFlowCopy } from "@/server/flows";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string }> };

/**
 * Share a flow as a copy in another workspace you can edit. Connections (credentials) are never shared:
 * the copy has every connection cleared, and the recipient chooses their own.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "flow.share");
  const b = await parseBody(req, z.object({ targetWorkspaceId: z.string().uuid() }));
  const { workspace: target } = await requireWorkspace(user, b.targetWorkspaceId, "flow.edit");
  const { flow: copy, clearedConnections } = await shareFlowCopy(user, flow.id, target.id);
  await audit(db, { workspaceId: flow.workspaceId, actor: userActor(user), action: "flow.shared", targetType: "flow", targetId: flow.id, data: { toWorkspace: target.id, copyId: copy.id, clearedConnections } });
  return json({ flow: { id: copy.id, workspaceSlug: target.slug }, clearedConnections }, { status: 201 });
});
