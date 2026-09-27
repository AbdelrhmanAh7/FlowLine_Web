import { isUuid, requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { listRunsPage } from "@/server/runs";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const flowId = url.searchParams.get("flowId");
  const beforeAt = url.searchParams.get("beforeAt");
  const beforeId = url.searchParams.get("beforeId");
  const page = await listRunsPage(workspace.id, {
    status: status === "succeeded" || status === "failed" || status === "running" || status === "waiting" || status === "cancelled" ? status : undefined,
    q: url.searchParams.get("q") ?? undefined,
    flowId: flowId && isUuid(flowId) ? flowId : undefined,
    limit: Number(url.searchParams.get("limit") ?? 50) || 50,
    before: beforeAt && beforeId && isUuid(beforeId) ? { createdAt: beforeAt, id: beforeId } : undefined,
  });
  return json(page);
});
