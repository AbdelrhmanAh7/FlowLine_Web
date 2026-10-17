import { authenticateApiKey, requireScope } from "@/server/apikeys";
import { listFlows } from "@/server/flows";
import { json, route } from "@/server/http";

/**
 * GET /api/v1/flows — flows of the key's workspace with their published version, pause state and run summary (API key
 * auth only). Every flow carries runCount, lastRunStatus and lastRunAt; a flow that never ran has 0, null and null.
 */
export const GET = route(async (req) => {
  const p = await authenticateApiKey(req);
  await requireScope(p, "flows:read");
  const flows = await listFlows(p.workspaceId);
  return json({
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      publishedVersion: f.publishedVersion,
      trigger: f.trigger,
      paused: Boolean(f.pausedReason),
      updatedAt: f.updatedAt,
      runCount: f.runCount,
      lastRunStatus: f.lastRunStatus,
      lastRunAt: f.lastRunAt,
    })),
  });
});
