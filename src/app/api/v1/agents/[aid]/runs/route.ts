import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid } from "@/server/access";
import { startAgentRun } from "@/server/agents";
import { authenticateApiKey, requireScope } from "@/server/apikeys";
import { json, notFound, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ aid: string }> };

const body = z.object({ message: z.string().min(1).max(8000), conversationId: z.string().uuid().optional() }).strict();

/** POST /api/v1/agents/{id}/runs — start an agent run with an API key (scope agents:run). Poll GET /api/v1/agent-runs/{id}. */
export const POST = route(async (req, { params }: Ctx) => {
  const p = await authenticateApiKey(req);
  await requireScope(p, "agents:run");
  const aid = (await params).aid;
  if (!isUuid(aid)) throw notFound("Agent not found");
  const [a] = await db.select().from(schema.agent).where(and(eq(schema.agent.id, aid), eq(schema.agent.workspaceId, p.workspaceId), isNull(schema.agent.deletedAt)));
  if (!a) throw notFound("Agent not found");
  const b = await parseBody(req, body);
  const [creator] = await db.select().from(schema.user).where(eq(schema.user.id, p.actingUserId));
  if (!creator) throw notFound("Agent not found");
  const run = await startAgentRun({
    agentId: a.id,
    message: b.message,
    conversationId: b.conversationId,
    actingUser: { id: creator.id, email: creator.email, name: creator.name },
    actor: p.actor,
    apiKeyId: p.keyId,
  });
  return json({ id: run.id, status: run.status, conversationId: run.conversationId, statusUrl: `/api/v1/agent-runs/${run.id}` }, { status: 202 });
});
