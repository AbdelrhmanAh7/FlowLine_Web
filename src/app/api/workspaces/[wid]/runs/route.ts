import { isUuid, requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { listRuns } from "@/server/runs";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const flowId = url.searchParams.get("flowId");
  const runs = await listRuns(workspace.id, {
    status: status === "succeeded" || status === "failed" || status === "running" ? status : undefined,
    q: url.searchParams.get("q") ?? undefined,
    flowId: flowId && isUuid(flowId) ? flowId : undefined,
    limit: Number(url.searchParams.get("limit") ?? 50) || 50,
  });
  return json({ runs });
});
