import { requireFlow, requireUser } from "@/server/access";
import { db } from "@/db";
import { audit, userActor } from "@/server/audit";
import { json, route } from "@/server/http";
import { publishFlow, triggerInfo, unpublishFlow } from "@/server/publish";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid);
  return json({ publishedVersionId: flow.publishedVersionId, pausedReason: flow.pausedReason, ...(await triggerInfo(flow.id)) });
});

/** Publish: validates against live state (connections, actions, subflows), pins an immutable version, activates triggers. */
export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "flow.publish");
  const published = await publishFlow(user, flow.id);
  await audit(db, { workspaceId: flow.workspaceId, actor: userActor(user), action: "flow.published", targetType: "flow", targetId: flow.id, data: { name: flow.name } });
  return json(published, { status: 201 });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "flow.publish");
  await unpublishFlow(flow.id);
  return json({ ok: true });
});
