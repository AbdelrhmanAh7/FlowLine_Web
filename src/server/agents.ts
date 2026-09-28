import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { configuredProviders } from "@/ai/chat";
import { db, schema, type Db } from "@/db";
import type { AgentLimits, AgentToolSpec } from "@/db/schema";
import type { CurrentUser } from "./access";
import { audit, userActor, type Actor } from "./audit";
import { HttpError, notFound } from "./http";
import { checkRunRate } from "./rate-limit";
import { redact } from "./redact";
import { assertExecutionAllowed } from "./runs";

export const AGENT_TOOLS = {
  knowledge_search: "Search the agent's allowed knowledge sources; results carry citations",
  workflow_inspect: "Read the structure of a published workflow (no credentials)",
  run_workflow: "Run a published workflow through the workflow engine (its own approvals and limits apply)",
} as const;
export type AgentToolName = keyof typeof AGENT_TOOLS;

/** Default permission per tool: reading is ALLOW, running a workflow (consequential) is ASK. */
export const DEFAULT_PERMISSION: Record<AgentToolName, "allow" | "ask" | "deny"> = { knowledge_search: "allow", workflow_inspect: "allow", run_workflow: "ask" };

export const LIMIT_BOUNDS = { maxSteps: [1, 50], maxToolCalls: [0, 50], timeoutMs: [5_000, 600_000] } as const;
export const DEFAULT_LIMITS: AgentLimits = { maxSteps: 8, maxToolCalls: 6, maxCostMicros: null, timeoutMs: 120_000 };

export const agentInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  instructions: z.string().trim().min(1).max(8000),
  provider: z.enum(["ollama", "anthropic"]).nullable().default(null),
  model: z.string().trim().max(120).nullable().default(null),
  tools: z
    .array(z.object({ tool: z.enum(Object.keys(AGENT_TOOLS) as [AgentToolName, ...AgentToolName[]]), flowId: z.string().uuid().optional(), permission: z.enum(["allow", "ask", "deny"]) }))
    .max(30)
    .default([]),
  knowledgeSourceIds: z.array(z.string().uuid()).max(100).default([]),
  limits: z
    .object({
      maxSteps: z.number().int().min(LIMIT_BOUNDS.maxSteps[0]).max(LIMIT_BOUNDS.maxSteps[1]),
      maxToolCalls: z.number().int().min(LIMIT_BOUNDS.maxToolCalls[0]).max(LIMIT_BOUNDS.maxToolCalls[1]),
      maxCostMicros: z.number().int().min(0).nullable(),
      timeoutMs: z.number().int().min(LIMIT_BOUNDS.timeoutMs[0]).max(LIMIT_BOUNDS.timeoutMs[1]),
    })
    .default(DEFAULT_LIMITS),
});
export type AgentInput = z.infer<typeof agentInput>;

/** Everything an agent version references must exist in the SAME workspace (no cross-tenant tools). */
async function validateRefs(dbx: Db, workspaceId: string, input: AgentInput) {
  if (input.provider) {
    const p = configuredProviders().find((x) => x.id === input.provider);
    if (!p?.available) throw new HttpError(422, "AI_PROVIDER_UNAVAILABLE", p?.reason ?? `AI provider "${input.provider}" isn't configured`);
  }
  for (const t of input.tools) {
    if ((t.tool === "run_workflow" || t.tool === "workflow_inspect") && !t.flowId) throw new HttpError(422, "VALIDATION", `${t.tool} needs a workflow`);
    if (t.tool === "knowledge_search" && t.flowId) throw new HttpError(422, "VALIDATION", "knowledge_search doesn't take a workflow");
  }
  const flowIds = [...new Set(input.tools.map((t) => t.flowId).filter((x): x is string => Boolean(x)))];
  if (flowIds.length) {
    const found = await dbx
      .select({ id: schema.flow.id })
      .from(schema.flow)
      .where(and(inArray(schema.flow.id, flowIds), eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt)));
    if (found.length !== flowIds.length) throw new HttpError(422, "UNKNOWN_WORKFLOW", "A selected workflow doesn't exist in this workspace");
  }
  const kIds = [...new Set(input.knowledgeSourceIds)];
  if (kIds.length) {
    const found = await dbx
      .select({ id: schema.knowledgeSource.id })
      .from(schema.knowledgeSource)
      .where(and(inArray(schema.knowledgeSource.id, kIds), eq(schema.knowledgeSource.workspaceId, workspaceId), isNull(schema.knowledgeSource.deletedAt)));
    if (found.length !== kIds.length) throw new HttpError(422, "UNKNOWN_KNOWLEDGE", "A selected knowledge source doesn't exist in this workspace");
  }
  if (input.knowledgeSourceIds.length > 0 && !input.tools.some((t) => t.tool === "knowledge_search")) {
    throw new HttpError(422, "VALIDATION", "Enable the knowledge_search tool to give the agent knowledge sources");
  }
}

export async function createAgent(user: CurrentUser, workspaceId: string, raw: unknown) {
  const input = agentInput.parse(raw);
  await validateRefs(db, workspaceId, input);
  return db.transaction(async (tx) => {
    const [a] = await tx.insert(schema.agent).values({ workspaceId, name: input.name, description: input.description, createdBy: user.id }).returning();
    const v = await insertAgentVersion(tx, user, a!.id, 1, input);
    await tx.update(schema.agent).set({ currentVersionId: v.id }).where(eq(schema.agent.id, a!.id));
    await audit(tx, { workspaceId, actor: userActor(user), action: "agent.version_created", targetType: "agent", targetId: a!.id, data: { version: 1, tools: input.tools } });
    return { ...a!, currentVersionId: v.id };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertAgentVersion(tx: Tx, user: CurrentUser, agentId: string, version: number, input: AgentInput) {
  const [v] = await tx
    .insert(schema.agentVersion)
    .values({
      agentId,
      version,
      instructions: input.instructions,
      provider: input.provider,
      model: input.model,
      tools: input.tools as AgentToolSpec[],
      knowledgeSourceIds: input.knowledgeSourceIds,
      limits: input.limits,
      createdBy: user.id,
    })
    .returning();
  return v!;
}

/** Saving an agent always creates a new immutable version; runs keep the version they started with. */
export async function updateAgent(user: CurrentUser, agentId: string, raw: unknown) {
  const input = agentInput.parse(raw);
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(schema.agent).where(and(eq(schema.agent.id, agentId), isNull(schema.agent.deletedAt))).for("update");
    if (!a) throw notFound("Agent not found");
    await validateRefs(db, a.workspaceId, input);
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${schema.agentVersion.version}), 0)::int` }).from(schema.agentVersion).where(eq(schema.agentVersion.agentId, a.id));
    const v = await insertAgentVersion(tx, user, a.id, max + 1, input);
    const [updated] = await tx
      .update(schema.agent)
      .set({ name: input.name, description: input.description, currentVersionId: v.id, updatedAt: new Date() })
      .where(eq(schema.agent.id, a.id))
      .returning();
    await audit(tx, { workspaceId: a.workspaceId, actor: userActor(user), action: "agent.version_created", targetType: "agent", targetId: a.id, data: { version: max + 1, tools: input.tools } });
    return updated!;
  });
}

export async function listAgents(workspaceId: string) {
  return db
    .select({ id: schema.agent.id, name: schema.agent.name, description: schema.agent.description, updatedAt: schema.agent.updatedAt, version: schema.agentVersion.version, tools: schema.agentVersion.tools, provider: schema.agentVersion.provider, model: schema.agentVersion.model })
    .from(schema.agent)
    .leftJoin(schema.agentVersion, eq(schema.agentVersion.id, schema.agent.currentVersionId))
    .where(and(eq(schema.agent.workspaceId, workspaceId), isNull(schema.agent.deletedAt)))
    .orderBy(desc(schema.agent.updatedAt));
}

export async function getAgent(agentId: string) {
  const [a] = await db.select().from(schema.agent).where(and(eq(schema.agent.id, agentId), isNull(schema.agent.deletedAt)));
  if (!a) return null;
  const versions = await db.select().from(schema.agentVersion).where(eq(schema.agentVersion.agentId, a.id)).orderBy(desc(schema.agentVersion.version));
  return { agent: a, current: versions.find((v) => v.id === a.currentVersionId) ?? versions[0]!, versions: versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt })) };
}

export async function deleteAgent(agentId: string) {
  await db.update(schema.agent).set({ deletedAt: new Date() }).where(eq(schema.agent.id, agentId));
}

/**
 * Queues an agent run (current version). Same gates as workflow runs: rate limit, the workspace's
 * monthly execution limit (an agent run counts as one execution), and the actor's capability.
 */
export async function startAgentRun(opts: { agentId: string; message: string; conversationId?: string; actingUser: CurrentUser; actor: Actor; apiKeyId?: string }) {
  const message = opts.message.trim();
  if (!message) throw new HttpError(400, "VALIDATION", "Send a message for the agent");
  if (message.length > 8000) throw new HttpError(413, "INPUT_TOO_LARGE", "Messages are limited to 8,000 characters");
  await checkRunRate(opts.apiKeyId ? `apikey:${opts.apiKeyId}` : opts.actingUser.id);
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(schema.agent).where(and(eq(schema.agent.id, opts.agentId), isNull(schema.agent.deletedAt)));
    if (!a || !a.currentVersionId) throw notFound("Agent not found");
    const [ws] = await tx.select().from(schema.workspace).where(eq(schema.workspace.id, a.workspaceId)).for("update");
    await assertExecutionAllowed(tx, ws!);
    let conversationId = opts.conversationId ?? null;
    if (conversationId) {
      const [c] = await tx.select().from(schema.agentConversation).where(and(eq(schema.agentConversation.id, conversationId), eq(schema.agentConversation.agentId, a.id)));
      if (!c) throw notFound("Conversation not found");
    } else {
      const [c] = await tx.insert(schema.agentConversation).values({ workspaceId: a.workspaceId, agentId: a.id, title: message.slice(0, 80), createdBy: opts.actingUser.id }).returning();
      conversationId = c!.id;
    }
    const [run] = await tx
      .insert(schema.agentRun)
      .values({ workspaceId: a.workspaceId, agentId: a.id, agentVersionId: a.currentVersionId, conversationId, input: message, actingUserId: opts.actingUser.id, apiKeyId: opts.apiKeyId ?? null })
      .returning();
    await tx
      .insert(schema.usageEvent)
      .values({ workspaceId: a.workspaceId, agentRunId: run!.id, kind: "execution", status: "settled", idempotencyKey: `execution:agent:${run!.id}`, costMicros: ws!.prices?.execution?.perCallMicros ?? 0, unpriced: ws!.prices?.execution?.perCallMicros == null, settledAt: new Date() })
      .onConflictDoNothing();
    await tx.execute(sql`select pg_notify('flowline_runs', ${run!.id})`);
    return run!;
  });
}

export async function cancelAgentRun(runId: string) {
  const [r] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, runId));
  if (!r) throw notFound("Agent run not found");
  if (["succeeded", "failed", "cancelled"].includes(r.status)) return r;
  if (r.status === "queued" || r.status === "waiting_approval") {
    const [c] = await db
      .update(schema.agentRun)
      .set({ status: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date(), lockedBy: null })
      .where(and(eq(schema.agentRun.id, runId), inArray(schema.agentRun.status, ["queued", "waiting_approval"])))
      .returning();
    if (c) return c;
  }
  const [c] = await db.update(schema.agentRun).set({ cancelRequestedAt: new Date() }).where(eq(schema.agentRun.id, runId)).returning();
  return c!;
}

export async function listAgentRuns(agentId: string, limit = 30) {
  return db
    .select({ id: schema.agentRun.id, status: schema.agentRun.status, input: schema.agentRun.input, createdAt: schema.agentRun.createdAt, finishedAt: schema.agentRun.finishedAt, costMicros: schema.agentRun.costMicros, stepCount: schema.agentRun.stepCount, conversationId: schema.agentRun.conversationId })
    .from(schema.agentRun)
    .where(eq(schema.agentRun.agentId, agentId))
    .orderBy(desc(schema.agentRun.createdAt))
    .limit(limit);
}

/** Run detail for the UI/API: redacted steps; never the internal model state. */
export async function getAgentRunDetail(runId: string) {
  const [r] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, runId));
  if (!r) return null;
  const steps = await db.select().from(schema.agentStep).where(eq(schema.agentStep.agentRunId, r.id)).orderBy(asc(schema.agentStep.index));
  const approvals = await db
    .select({ id: schema.approval.id, nodeId: schema.approval.nodeId, status: schema.approval.status, actionId: schema.approval.actionId, argsPreview: schema.approval.argsPreview, expiresAt: schema.approval.expiresAt, kind: schema.approval.kind, decidedBy: schema.approval.decidedBy })
    .from(schema.approval)
    .where(eq(schema.approval.agentRunId, r.id));
  const [v] = await db.select({ version: schema.agentVersion.version }).from(schema.agentVersion).where(eq(schema.agentVersion.id, r.agentVersionId));
  const { state: _state, lockedBy: _l, heartbeatAt: _h, attempts: _a, ...pub } = r;
  return redact({ ...pub, version: v?.version ?? null, steps, approvals });
}

export async function conversationHistory(conversationId: string, beforeRunCreatedAt: Date) {
  return db
    .select({ input: schema.agentRun.input, output: schema.agentRun.output, status: schema.agentRun.status })
    .from(schema.agentRun)
    .where(and(eq(schema.agentRun.conversationId, conversationId), sql`${schema.agentRun.createdAt} < ${beforeRunCreatedAt}`))
    .orderBy(asc(schema.agentRun.createdAt))
    .limit(20);
}
