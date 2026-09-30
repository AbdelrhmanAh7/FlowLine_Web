import { requireUser, requireWorkspace } from "@/server/access";
import { track } from "@/server/telemetry";
import { createAgent, listAgents } from "@/server/agents";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "agent.view");
  return json({ agents: await listAgents(workspace.id) });
});

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "agent.edit");
  const agent = await createAgent(user, workspace.id, await req.json().catch(() => null));
  track("agent_created", { workspaceId: workspace.id, userId: user.id });
  return json({ agent }, { status: 201 });
});
