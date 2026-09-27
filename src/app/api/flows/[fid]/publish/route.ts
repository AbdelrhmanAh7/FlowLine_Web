import { requireFlow, requireUser } from "@/server/access";
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
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  return json(await publishFlow(user, flow.id), { status: 201 });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  await unpublishFlow(flow.id);
  return json({ ok: true });
});
