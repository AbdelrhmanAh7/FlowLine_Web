import { requireAgentRun, requireUser } from "@/server/access";
import { getAgentRunDetail } from "@/server/agents";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ rid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { agentRun } = await requireAgentRun(user, (await params).rid);
  return json({ run: await getAgentRunDetail(agentRun.id) });
});
