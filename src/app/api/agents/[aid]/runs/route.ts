import { z } from "zod";
import { requireAgent, requireUser } from "@/server/access";
import { listAgentRuns, startAgentRun } from "@/server/agents";
import { userActor } from "@/server/audit";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ aid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { agent } = await requireAgent(user, (await params).aid);
  return json({ runs: await listAgentRuns(agent.id) });
});

const body = z.object({ message: z.string().min(1).max(8000), conversationId: z.string().uuid().optional() });

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { agent } = await requireAgent(user, (await params).aid, "agent.run");
  const b = await parseBody(req, body);
  const run = await startAgentRun({ agentId: agent.id, message: b.message, conversationId: b.conversationId, actingUser: user, actor: userActor(user) });
  return json({ run: { id: run.id, status: run.status, conversationId: run.conversationId } }, { status: 202 });
});
