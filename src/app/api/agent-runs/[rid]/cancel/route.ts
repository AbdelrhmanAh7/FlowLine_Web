import { requireAgentRun, requireUser } from "@/server/access";
import { cancelAgentRun } from "@/server/agents";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ rid: string }> };

export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { agentRun } = await requireAgentRun(user, (await params).rid, "agent.run");
  const r = await cancelAgentRun(agentRun.id);
  return json({ status: r.status, cancelRequested: Boolean(r.cancelRequestedAt) });
});
