import { requireAgent, requireUser } from "@/server/access";
import { deleteAgent, getAgent, updateAgent } from "@/server/agents";
import { json, notFound, route } from "@/server/http";

type Ctx = { params: Promise<{ aid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { agent } = await requireAgent(user, (await params).aid);
  const full = await getAgent(agent.id);
  if (!full) throw notFound("Agent not found");
  return json(full);
});

/** Saving creates a new immutable version. */
export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { agent } = await requireAgent(user, (await params).aid, "agent.edit");
  return json({ agent: await updateAgent(user, agent.id, await req.json().catch(() => null)) });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { agent } = await requireAgent(user, (await params).aid, "agent.edit");
  await deleteAgent(agent.id);
  return json({ ok: true });
});
