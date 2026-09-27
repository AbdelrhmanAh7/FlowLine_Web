import { isUuid } from "@/server/access";
import { authenticateApiKey, requireScope } from "@/server/apikeys";
import { json, notFound, route } from "@/server/http";
import { getRunDetail } from "@/server/runs";

type Ctx = { params: Promise<{ rid: string }> };

/** GET /api/v1/runs/{id} — status and (redacted) result of a run in the key's workspace (scope runs:read). */
export const GET = route(async (req, { params }: Ctx) => {
  const p = await authenticateApiKey(req);
  await requireScope(p, "runs:read");
  const rid = (await params).rid;
  if (!isUuid(rid)) throw notFound("Run not found");
  const run = await getRunDetail(rid);
  if (!run || run.workspaceId !== p.workspaceId) throw notFound("Run not found");
  return json({
    id: run.id,
    number: run.number,
    status: run.status,
    flowId: run.flowId,
    version: run.version,
    output: run.output ?? null,
    error: run.error ?? null,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    steps: run.steps.map((s: { nodeId: string; nodeLabel: string; status: string }) => ({ nodeId: s.nodeId, label: s.nodeLabel, status: s.status })),
  });
});
