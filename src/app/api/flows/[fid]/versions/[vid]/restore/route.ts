import { z } from "zod";
import { db } from "@/db";
import { isUuid, requireFlow, requireUser } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { restoreVersion } from "@/server/flows";
import { json, notFound, parseBody, route } from "@/server/http";
import { publishFlow } from "@/server/publish";

type Ctx = { params: Promise<{ fid: string; vid: string }> };

/**
 * Roll back: the old definition becomes a new draft revision (history is kept). With publish=true it is
 * also published (needs publish permission) — i.e. a rollback of the live version.
 */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.vid)) throw notFound("Version not found");
  const b = await parseBody(req, z.object({ baseRevision: z.number().int().positive(), publish: z.boolean().default(false) }));
  const { flow } = await requireFlow(user, p.fid, b.publish ? "flow.publish" : "flow.edit");
  const saved = await restoreVersion(user, flow.id, p.vid, b.baseRevision);
  const published = b.publish ? await publishFlow(user, flow.id) : null;
  await audit(db, { workspaceId: flow.workspaceId, actor: userActor(user), action: "flow.rolled_back", targetType: "flow", targetId: flow.id, data: { toVersionId: p.vid, published: Boolean(published) } });
  return json({ flow: { id: saved.flow.id, revision: saved.flow.revision }, published: Boolean(published) });
});
