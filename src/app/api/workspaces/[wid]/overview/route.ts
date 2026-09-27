import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { workerStatus } from "@/server/runs";
import { workspaceOverview } from "@/server/workspaces";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  const [overview, worker] = await Promise.all([workspaceOverview(workspace.id), workerStatus()]);
  return json({ ...overview, worker });
});
