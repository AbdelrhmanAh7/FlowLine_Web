import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/server/access";
import { authenticateApiKey, requireScope } from "@/server/apikeys";
import { json, notFound, route } from "@/server/http";

type Ctx = { params: Promise<{ rid: string }> };

/** GET /api/v1/agent-runs/{id} — status, answer and citations (scope agents:run, same workspace only). */
export const GET = route(async (req, { params }: Ctx) => {
  const p = await authenticateApiKey(req);
  await requireScope(p, "agents:run");
  const rid = (await params).rid;
  if (!isUuid(rid)) throw notFound("Agent run not found");
  const [r] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, rid));
  if (!r || r.workspaceId !== p.workspaceId) throw notFound("Agent run not found");
  return json({ id: r.id, status: r.status, output: r.output, citations: r.citations ?? [], error: r.error, costMicros: r.costMicros, steps: r.stepCount, createdAt: r.createdAt, finishedAt: r.finishedAt });
});
