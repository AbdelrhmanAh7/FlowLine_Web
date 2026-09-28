import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { chat, resolveAgentRoute, untrusted, type ChatMessage, type ChatTool, type ToolCall } from "@/ai/chat";
import { estimateTokens } from "@/ai/provider";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AgentToolSpec } from "@/db/schema";
import { NodeError } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";
import { can } from "@/lib/permissions";
import { conversationHistory } from "@/server/agents";
import { checkGate, type GateRequest } from "@/server/approvals";
import { HttpError } from "@/server/http";
import type { Citation } from "@/server/knowledge";
import { searchKnowledge } from "@/server/knowledge";
import { redact } from "@/server/redact";
import { enqueueRunEx } from "@/server/runs";
import { aiCostMicros, BudgetExceededError, priceFor, releaseUsage, reserveUsage, settleUsage } from "@/server/usage";
import { backoffMs, sleep } from "./retry";

/**
 * Agent runtime. The model proposes tool calls; this code decides and executes them:
 * - ALLOW / ASK / DENY is enforced here, before anything runs — never by prompt.
 * - ASK uses the same approval gate as workflows (bound to agent run + version + tool + args + connections,
 *   24h expiry, approver re-checked when the call executes).
 * - run_workflow goes through the existing workflow engine as a normal pinned run of the PUBLISHED
 *   version, so connections, workflow approvals, usage, events and rate limits all still apply.
 * - Limits: steps, tool calls, cost and wall time; budget/plan caps via the usage ledger.
 */
export const AGENT_STALE_MS = 60_000;
const MODEL_MAX_TOKENS = 800;

interface AgentState {
  messages: ChatMessage[];
  citations: Citation[];
  nextIndex: number;
  pending?: { index: number; call: ToolCall; childRunId?: string; approvalId?: string };
  /** Time the agent has actually been working (ms). Waiting for a person doesn't count toward its time limit. */
  activeMs?: number;
}

export class AgentLeaseLost extends Error {}

/**
 * The approval binding for an agent tool call. An approval covers exactly this call: tool, workflow, input,
 * the connections it will use AND the published workflow version — republishing the workflow (even with the
 * same connections) needs a new approval.
 */
export function agentGateRequest(o: {
  workspaceId: string;
  agentRunId: string;
  agentVersionId: string;
  index: number;
  call: ToolCall;
  flow?: { id: string; name: string };
  connections: string[];
  publishedVersionId: string | null;
}): GateRequest {
  return {
    workspaceId: o.workspaceId,
    runId: "",
    agentRunId: o.agentRunId,
    flowVersionId: o.agentVersionId,
    nodeId: `tool:${o.index}`,
    kind: "approval",
    actionId: `agent.${o.call.name}`,
    args: {
      tool: o.call.name,
      workflowId: o.flow?.id ?? null,
      workflow: o.flow?.name ?? null,
      publishedVersionId: o.publishedVersionId,
      input: o.call.arguments.input ?? null,
      query: o.call.arguments.query ?? null,
      connections: o.connections,
    },
    connectionId: null,
  };
}

export async function claimNextAgentRun(db: Db, workerId: string): Promise<string | null> {
  const res = await db.execute<{ id: string }>(sql`
    update agent_run set status = 'running', locked_by = ${workerId}, heartbeat_at = now(), started_at = coalesce(started_at, now())
    where id = (select id from agent_run where status = 'queued' order by created_at for update skip locked limit 1)
    returning id`);
  return res.rows[0]?.id ?? null;
}

/** Agent runs whose worker stopped heart-beating go back to the queue (3 losses → failed). */
export async function recoverStaleAgentRuns(db: Db) {
  const cutoff = new Date(Date.now() - AGENT_STALE_MS);
  const stale = await db.select().from(schema.agentRun).where(and(eq(schema.agentRun.status, "running"), lt(schema.agentRun.heartbeatAt, cutoff)));
  for (const r of stale) {
    const still = and(eq(schema.agentRun.id, r.id), eq(schema.agentRun.status, "running"), lt(schema.agentRun.heartbeatAt, cutoff));
    if (r.attempts + 1 >= 3) {
      await db.update(schema.agentRun).set({ status: "failed", lockedBy: null, finishedAt: new Date(), error: { code: "WORKER_LOST", message: "The worker stopped responding 3 times" } }).where(still);
    } else {
      await db.update(schema.agentRun).set({ status: "queued", lockedBy: null, attempts: sql`${schema.agentRun.attempts} + 1` }).where(still);
    }
  }
  return stale.length;
}

type Decision = { kind: "deny"; reason: string } | { kind: "allow" | "ask"; spec: AgentToolSpec; flow?: typeof schema.flow.$inferSelect; connections?: string[] };

export async function processAgentRun(db: Db, runId: string, workerId: string, log: (...a: unknown[]) => void = () => {}) {
  const leased = and(eq(schema.agentRun.id, runId), eq(schema.agentRun.lockedBy, workerId), eq(schema.agentRun.status, "running"));
  const [run] = await db.select().from(schema.agentRun).where(leased);
  if (!run) return;
  const [version] = await db.select().from(schema.agentVersion).where(eq(schema.agentVersion.id, run.agentVersionId));
  const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, run.workspaceId));
  const limits = version!.limits;

  const update = async (set: Partial<typeof schema.agentRun.$inferInsert>) => {
    const r = await db.update(schema.agentRun).set({ ...set, heartbeatAt: new Date() }).where(leased).returning({ id: schema.agentRun.id });
    if (r.length === 0) throw new AgentLeaseLost();
  };
  const finish = async (status: "succeeded" | "failed" | "cancelled", extra: Partial<typeof schema.agentRun.$inferInsert> = {}) => {
    await update({ status, finishedAt: new Date(), lockedBy: null, ...extra });
    log("agent run", runId, status);
  };
  const fail = (code: string, message: string) => finish("failed", { error: { code, message } });

  // Permission re-check at execution time: the acting user must still be allowed to run agents here.
  const [m] = await db
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, run.workspaceId), eq(schema.workspaceMember.userId, run.actingUserId)));
  if (!can(m?.role, "agent.run")) return fail("PERMISSION_REVOKED", "The user this agent run acts for no longer has access to run agents in this workspace");

  // AI route: the workspace's authorised AI connection (never an environment key; legacy pins are refused).
  let route: Awaited<ReturnType<typeof resolveAgentRoute>>;
  try {
    route = await resolveAgentRoute(db, ws!, { provider: version!.provider, model: version!.model });
  } catch (e) {
    return fail((e as NodeError).code ?? "AI_UNAVAILABLE", (e as Error).message);
  }
  const model = { provider: route.provider, model: route.modelId };

  // Tools this version exposes (DENY tools are not offered — and still refused if the model calls them).
  const specs = version!.tools;
  const flowIds = [...new Set(specs.map((s) => s.flowId).filter((x): x is string => Boolean(x)))];
  const flows = flowIds.length ? await db.select().from(schema.flow).where(and(inArray(schema.flow.id, flowIds), eq(schema.flow.workspaceId, run.workspaceId), isNull(schema.flow.deletedAt))) : [];
  const flowByName = new Map(flows.map((f) => [f.name, f]));
  const offered = (tool: string) => specs.filter((s) => s.tool === tool && s.permission !== "deny");
  const tools: ChatTool[] = [];
  if (offered("knowledge_search").length) {
    tools.push({ name: "knowledge_search", description: "Search the knowledge sources available to you. Returns numbered passages to cite as [n].", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } });
  }
  const names = (tool: string) => offered(tool).map((s) => flows.find((f) => f.id === s.flowId)?.name).filter((n): n is string => Boolean(n));
  if (names("workflow_inspect").length) {
    tools.push({ name: "workflow_inspect", description: "Describe a published workflow's steps.", parameters: { type: "object", properties: { workflow: { type: "string", enum: names("workflow_inspect") } }, required: ["workflow"] } });
  }
  if (names("run_workflow").length) {
    tools.push({
      name: "run_workflow",
      description: "Run a published workflow with an input object. Some workflows need human approval first.",
      parameters: { type: "object", properties: { workflow: { type: "string", enum: names("run_workflow") }, input: { type: "object" } }, required: ["workflow"] },
    });
  }

  let state = (run.state as AgentState | null) ?? null;
  if (!state) {
    const history = run.conversationId ? await conversationHistory(run.conversationId, run.createdAt) : [];
    const messages: ChatMessage[] = [];
    for (const h of history) {
      messages.push({ role: "user", content: h.input });
      if (h.output) messages.push({ role: "assistant", content: h.output });
    }
    messages.push({ role: "user", content: run.input });
    state = { messages, citations: [], nextIndex: 0 };
  }
  // The time limit covers the agent's own work, not the hours a request may wait for a human decision (Codex CX3R-01):
  // the remaining budget is carried in state.activeMs across pauses.
  const sliceStart = Date.now();
  const spentBefore = state.activeMs ?? 0;
  const deadline = sliceStart + Math.max(0, limits.timeoutMs - spentBefore);
  const markPaused = () => {
    state!.activeMs = spentBefore + (Date.now() - sliceStart);
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("AGENT_TIMEOUT")), Math.max(1, deadline - Date.now()));
  let costMicros = run.costMicros;
  let stepCount = run.stepCount;
  let toolCallCount = run.toolCallCount;

  const recordStep = async (s: Omit<typeof schema.agentStep.$inferInsert, "agentRunId">) => {
    await db.insert(schema.agentStep).values({ ...s, agentRunId: runId, args: s.args === undefined ? null : (redact(s.args) as object), result: s.result === undefined ? null : (redact(s.result) as object) }).onConflictDoNothing();
  };
  const save = () => update({ state: state as unknown as object, costMicros, stepCount, toolCallCount });

  const decide = (call: ToolCall): Decision => {
    const spec = specs.find((s) => s.tool === call.name && (call.name === "knowledge_search" || flows.find((f) => f.id === s.flowId)?.name === call.arguments.workflow));
    if (!spec) return { kind: "deny", reason: call.name in { knowledge_search: 1, workflow_inspect: 1, run_workflow: 1 } ? "That tool/workflow isn't enabled for this agent" : `Unknown tool "${call.name}"` };
    if (spec.permission === "deny") return { kind: "deny", reason: "This tool is denied for this agent" };
    if (call.name === "knowledge_search") return { kind: spec.permission, spec };
    const flow = flowByName.get(String(call.arguments.workflow));
    if (!flow) return { kind: "deny", reason: "That workflow no longer exists" };
    return { kind: spec.permission, spec, flow };
  };

  /** Workflow-specific checks at execution time: published, not paused, credentials still valid. */
  const workflowReady = async (flow: typeof schema.flow.$inferSelect): Promise<{ ok: true; connections: string[]; versionId: string } | { ok: false; reason: string }> => {
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, flow.id));
    if (!f || f.deletedAt) return { ok: false, reason: "The workflow was deleted" };
    if (!f.publishedVersionId) return { ok: false, reason: "The workflow isn't published — agents can only run published versions" };
    if (f.pausedReason) return { ok: false, reason: "The workflow is paused because a connection it uses needs attention (revoked or expired credential)" };
    const [v] = await db.select({ graph: schema.flowVersion.graph }).from(schema.flowVersion).where(eq(schema.flowVersion.id, f.publishedVersionId));
    const conns = [...new Set((v!.graph as FlowGraph).nodes.map((n) => (n.data.config as { connectionId?: string }).connectionId).filter((x): x is string => Boolean(x)))].sort();
    if (conns.length) {
      const rows = await db.select({ id: schema.connection.id, status: schema.connection.status }).from(schema.connection).where(inArray(schema.connection.id, conns));
      const bad = rows.find((r) => r.status !== "active") ?? (rows.length !== conns.length ? { status: "missing" } : null);
      if (bad) return { ok: false, reason: `A credential this workflow uses is ${bad.status} — reconnect it first` };
    }
    return { ok: true, connections: conns, versionId: f.publishedVersionId };
  };

  const gateFor = (index: number, call: ToolCall, flow: typeof schema.flow.$inferSelect | undefined, connections: string[], publishedVersionId: string | null) =>
    checkGate(db, agentGateRequest({ workspaceId: run.workspaceId, agentRunId: runId, agentVersionId: run.agentVersionId, index, call, flow, connections, publishedVersionId }));

  /** Executes an allowed/approved call. Returns the tool message content (untrusted-wrapped) or "pending". */
  const execute = async (index: number, call: ToolCall, d: Decision & { kind: "allow" | "ask" }, decisionLabel: string, versionId?: string): Promise<string | { pending: string }> => {
    const started = Date.now();
    const usageKey = `${runId}:step:${index}`;
    const stepPrice = priceFor(ws!.prices ?? {}, "agent_step");
    const stepCost = stepPrice?.perCallMicros ?? 0;
    // Tool steps count toward the agent's own hard cost limit, not only the workspace budget.
    if (limits.maxCostMicros != null && costMicros + stepCost > limits.maxCostMicros) {
      throw new NodeError("AGENT_COST_LIMIT", `The next tool call would exceed the agent's cost limit (spent ${costMicros} of ${limits.maxCostMicros} micro-units)`);
    }
    try {
      await reserveUsage(db, { workspaceId: run.workspaceId, runId: null, nodeId: null, agentRunId: runId, kind: "agent_step", idempotencyKey: usageKey, estimatedMicros: stepPrice?.perCallMicros ?? 0, unpriced: !stepPrice });
    } catch (e) {
      if (e instanceof BudgetExceededError) throw new NodeError("BUDGET_EXCEEDED", e.message);
      throw e;
    }
    let result: unknown;
    let content: string;
    if (call.name === "knowledge_search") {
      const hits = await searchKnowledge(db, run.workspaceId, String(call.arguments.query ?? ""), { allowedSourceIds: version!.knowledgeSourceIds, limit: 5 });
      const base = state!.citations.length;
      hits.forEach((h) => state!.citations.push({ sourceId: h.sourceId, sourceName: h.sourceName, ordinal: h.ordinal, label: h.label }));
      result = { hits: hits.map((h, i) => ({ n: base + i + 1, label: h.label, score: h.score })) };
      const u = untrusted(hits.length ? hits.map((h, i) => `[${base + i + 1}] ${h.label}: ${h.text}`).join("\n\n") : "No matching passages.");
      content = u.text;
      if (u.quarantined) result = { ...(result as object), quarantinedLines: u.quarantined };
    } else if (call.name === "workflow_inspect") {
      const [v] = await db.select({ graph: schema.flowVersion.graph, version: schema.flowVersion.version }).from(schema.flowVersion).where(eq(schema.flowVersion.id, d.flow!.publishedVersionId!));
      const g = v!.graph as FlowGraph;
      result = { workflow: d.flow!.name, version: v!.version, steps: g.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label })) };
      content = untrusted(JSON.stringify(result)).text;
    } else {
      // run_workflow → a normal engine run of the published version, idempotent per tool call.
      const [actor] = await db.select().from(schema.user).where(eq(schema.user.id, run.actingUserId));
      const pending = state!.pending?.childRunId;
      let childId = pending;
      if (!childId) {
        const input = call.arguments.input && typeof call.arguments.input === "object" ? call.arguments.input : {};
        try {
          const { run: child } = await enqueueRunEx(actor ? { id: actor.id, email: actor.email, name: actor.name } : null, d.flow!.id, {
            triggerKind: "agent",
            usePublished: true,
            // Exactly the version that was checked (and, for ASK, approved) — a republish in between is refused.
            expectPublishedVersionId: versionId,
            input,
            triggerRef: `${runId}:${index}`,
            agentRunId: runId,
            actingUserId: run.actingUserId,
          });
          childId = child.id;
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
          await settleUsage(db, usageKey, { costMicros: 0, unpriced: !stepPrice });
          await recordStep({ index, kind: "tool", tool: call.name, args: call.arguments, decision: decisionLabel, error: { code: e.code, message: e.message }, latencyMs: Date.now() - started });
          return JSON.stringify({ error: e.message });
        }
      }
      // Wait for the workflow (bounded by the agent's deadline). A workflow that needs its own
      // approval pauses the agent too; the runner wakes it when the workflow finishes.
      for (;;) {
        const [c] = await db.select().from(schema.run).where(eq(schema.run.id, childId));
        if (!c) throw new NodeError("WORKFLOW_MISSING", "The workflow run disappeared");
        if (["succeeded", "failed", "cancelled"].includes(c.status)) {
          result = { runId: c.id, runNumber: c.number, status: c.status, output: c.output, error: c.error };
          break;
        }
        if (c.status === "waiting_approval") {
          state!.pending = { index, call, childRunId: childId };
          return { pending: `Workflow run #${c.number} is waiting for a human decision` };
        }
        await update({});
        if (ac.signal.aborted) throw new NodeError("AGENT_TIMEOUT", "The agent ran out of time while the workflow was running");
        await sleep(500, ac.signal).catch(() => {});
      }
      content = untrusted(JSON.stringify(redact(result))).text;
    }
    await settleUsage(db, usageKey, { costMicros: stepCost, unpriced: !stepPrice });
    costMicros += stepCost;
    await recordStep({ index, kind: "tool", tool: call.name, args: call.arguments, decision: decisionLabel, result, latencyMs: Date.now() - started, costMicros: stepCost });
    return content;
  };

  const beat = setInterval(() => void update({}).catch(() => {}), 10_000);
  try {
    for (;;) {
      const [cur] = await db.select({ cancel: schema.agentRun.cancelRequestedAt }).from(schema.agentRun).where(eq(schema.agentRun.id, runId));
      if (cur?.cancel) return await finish("cancelled", { error: { code: "CANCELLED", message: "Cancelled" } });
      if (Date.now() >= deadline) return await fail("AGENT_TIMEOUT", `The agent exceeded its time limit (${Math.round(limits.timeoutMs / 1000)}s)`);

      // Resume a tool call that was waiting for approval or for a workflow run.
      if (state.pending) {
        const { index, call } = state.pending;
        const d = decide(call);
        let content: string;
        if (d.kind === "deny") {
          await recordStep({ index, kind: "tool", tool: call.name, args: call.arguments, decision: "deny", error: { code: "TOOL_DENIED", message: d.reason } });
          content = JSON.stringify({ error: d.reason });
        } else {
          let label = "allow";
          let versionId: string | undefined;
          if (d.kind === "ask" && !state.pending.childRunId) {
            const ready = d.flow ? await workflowReady(d.flow) : ({ ok: true as const, connections: [] as string[], versionId: null });
            if (!ready.ok) {
              await recordStep({ index, kind: "tool", tool: call.name, args: call.arguments, decision: "deny", error: { code: "TOOL_DENIED", message: ready.reason } });
              content = JSON.stringify({ error: ready.reason });
              state.messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
              state.pending = undefined;
              await save();
              continue;
            }
            const g = await gateFor(index, call, d.flow, ready.connections, ready.versionId);
            versionId = ready.versionId ?? undefined;
            if (g.status === "pending") {
              markPaused();
              await update({ status: "waiting_approval", lockedBy: null, state: state as unknown as object });
              return;
            }
            if (g.status === "rejected") {
              await recordStep({ index, kind: "tool", tool: call.name, args: call.arguments, decision: "rejected", approvalId: g.approvalId, error: { code: "APPROVAL_REJECTED", message: g.note ?? "Rejected by an approver" } });
              content = JSON.stringify({ error: `A person rejected this action${g.note ? `: ${g.note}` : ""}` });
              state.messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
              state.pending = undefined;
              await save();
              continue;
            }
            label = "approved";
          } else if (state.pending.childRunId) label = d.kind === "ask" ? "approved" : "allow";
          const r = await execute(index, call, d, label, versionId);
          if (typeof r !== "string") {
            markPaused();
            await update({ status: "waiting_approval", lockedBy: null, state: state as unknown as object });
            return;
          }
          content = r;
        }
        state.messages.push({ role: "tool", toolCallId: call.id, name: call.name, content });
        state.pending = undefined;
        await save();
        continue;
      }

      // Pending tool calls from the last model turn that haven't been handled yet.
      const last = state.messages.at(-1);
      if (last?.role === "assistant" && last.toolCalls?.length) {
        const answered = new Set(state.messages.filter((m) => m.role === "tool").map((m) => (m as { toolCallId: string }).toolCallId));
        const nextCall = last.toolCalls.find((c) => !answered.has(c.id));
        if (nextCall) {
          if (toolCallCount >= limits.maxToolCalls) return await fail("AGENT_TOOL_LIMIT", `The agent reached its limit of ${limits.maxToolCalls} tool calls`);
          toolCallCount++;
          const index = state.nextIndex++;
          const d = decide(nextCall);
          if (d.kind === "deny") {
            await recordStep({ index, kind: "tool", tool: nextCall.name, args: nextCall.arguments, decision: "deny", error: { code: "TOOL_DENIED", message: d.reason } });
            state.messages.push({ role: "tool", toolCallId: nextCall.id, name: nextCall.name, content: JSON.stringify({ error: d.reason }) });
            await save();
            continue;
          }
          let checkedVersion: string | undefined;
          if (d.flow && nextCall.name === "run_workflow") {
            const ready = await workflowReady(d.flow);
            if (!ready.ok) {
              await recordStep({ index, kind: "tool", tool: nextCall.name, args: nextCall.arguments, decision: "deny", error: { code: "TOOL_DENIED", message: ready.reason } });
              state.messages.push({ role: "tool", toolCallId: nextCall.id, name: nextCall.name, content: JSON.stringify({ error: ready.reason }) });
              await save();
              continue;
            }
            checkedVersion = ready.versionId;
            if (d.kind === "ask") {
              const g = await gateFor(index, nextCall, d.flow, ready.connections, ready.versionId);
              await recordStep({ index: 10_000 + index, kind: "tool", tool: nextCall.name, args: nextCall.arguments, decision: "ask", approvalId: g.approvalId });
              state.pending = { index, call: nextCall, approvalId: g.approvalId };
              markPaused();
              await update({ status: "waiting_approval", lockedBy: null, state: state as unknown as object, toolCallCount });
              log("agent run", runId, "waiting for approval");
              return;
            }
          } else if (d.kind === "ask") {
            // ASK on a read tool: same gate.
            const g = await gateFor(index, nextCall, d.flow, [], null);
            await recordStep({ index: 10_000 + index, kind: "tool", tool: nextCall.name, args: nextCall.arguments, decision: "ask", approvalId: g.approvalId });
            state.pending = { index, call: nextCall, approvalId: g.approvalId };
            markPaused();
            await update({ status: "waiting_approval", lockedBy: null, state: state as unknown as object, toolCallCount });
            return;
          }
          const r = await execute(index, nextCall, d as Decision & { kind: "allow" }, "allow", checkedVersion);
          if (typeof r !== "string") {
            markPaused();
            await update({ status: "waiting_approval", lockedBy: null, state: state as unknown as object, toolCallCount });
            return;
          }
          state.messages.push({ role: "tool", toolCallId: nextCall.id, name: nextCall.name, content: r });
          await save();
          continue;
        }
      }

      // Model turn.
      if (stepCount >= limits.maxSteps) return await fail("AGENT_STEP_LIMIT", `The agent reached its limit of ${limits.maxSteps} steps without finishing`);
      const index = state.nextIndex++;
      const price = priceFor(ws!.prices ?? {}, `ai:${model.provider}/${model.model}`);
      const promptChars = version!.instructions.length + state.messages.reduce((n, m) => n + m.content.length, 0);
      const est = aiCostMicros(price, estimateTokens(" ".repeat(promptChars)), MODEL_MAX_TOKENS);
      if (limits.maxCostMicros != null && costMicros + est.cost > limits.maxCostMicros) {
        return await fail("AGENT_COST_LIMIT", `The next step could cost more than the agent's cost limit allows (spent ${costMicros} of ${limits.maxCostMicros} micro-units)`);
      }
      let result: Awaited<ReturnType<typeof chat>> | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const key = `${runId}:model:${index}:${attempt}`;
        try {
          await reserveUsage(db, { workspaceId: run.workspaceId, runId: null, nodeId: null, agentRunId: runId, kind: "ai", idempotencyKey: key, estimatedMicros: est.cost, provider: model.provider, model: model.model, unpriced: est.unpriced, retry: attempt > 1 });
        } catch (e) {
          if (e instanceof BudgetExceededError) return await fail("BUDGET_EXCEEDED", e.message);
          throw e;
        }
        const started = Date.now();
        try {
          result = await chat(db, { workspace: ws!, actorUserId: run.actingUserId, route, requestId: key, agentRunId: runId, system: version!.instructions, messages: state.messages, tools, maxTokens: MODEL_MAX_TOKENS, signal: ac.signal });
          // Provider call ids are only unique within one turn (Ollama numbers them call_0, call_1…);
          // make them unique for the whole run so every proposed call is decided exactly once.
          result.toolCalls = result.toolCalls.map((c, i) => ({ ...c, id: `t${index}_${i}` }));
          const cost = aiCostMicros(price, result.usage.inputTokens, result.usage.outputTokens);
          await settleUsage(db, key, { costMicros: cost.cost, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, unpriced: cost.unpriced });
          costMicros += cost.cost;
          stepCount++;
          await recordStep({
            index,
            kind: "model",
            result: { content: result.content.slice(0, 4000), toolCalls: result.toolCalls.map((c) => ({ name: c.name, arguments: c.arguments })) },
            latencyMs: Date.now() - started,
            costMicros: cost.cost,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            args: { provider: result.provider, model: result.model, attempt },
          });
          break;
        } catch (e) {
          await releaseUsage(db, key);
          if (ac.signal.aborted) return await fail("AGENT_TIMEOUT", `The agent exceeded its time limit (${Math.round(limits.timeoutMs / 1000)}s)`);
          const retryable = (e as { retryable?: boolean }).retryable === true;
          if (!retryable || attempt === 3) {
            await recordStep({ index, kind: "model", error: { code: (e as NodeError).code ?? "AI_ERROR", message: (e as Error).message }, latencyMs: Date.now() - started, args: { attempt } });
            return await fail((e as NodeError).code ?? "AI_ERROR", (e as Error).message);
          }
          log("agent run", runId, "model attempt", attempt, "failed; retrying");
          await sleep(backoffMs(attempt), ac.signal).catch(() => {});
        }
      }
      if (limits.maxCostMicros != null && costMicros > limits.maxCostMicros) {
        return await fail("AGENT_COST_LIMIT", `The agent exceeded its cost limit (${costMicros} of ${limits.maxCostMicros} micro-units)`);
      }
      state.messages.push({ role: "assistant", content: result!.content, toolCalls: result!.toolCalls });
      if (result!.toolCalls.length === 0) {
        const cited = new Set([...result!.content.matchAll(/\[(\d+)\]/g)].map((mm) => Number(mm[1])));
        const citations = state.citations.filter((_, i) => cited.has(i + 1));
        return await finish("succeeded", { output: result!.content, citations, state: state as unknown as object, costMicros, stepCount, toolCallCount });
      }
      await save();
    }
  } catch (e) {
    if (e instanceof AgentLeaseLost) return;
    const code = (e as NodeError).code ?? "AGENT_ERROR";
    await fail(code, (e as Error).message).catch(() => {});
  } finally {
    clearInterval(beat);
    clearTimeout(timer);
  }
}

/** Re-queues agent runs that were waiting on a workflow run which has now finished. Idempotent. */
export async function wakeAgentsForFinishedRuns(db: Db) {
  const res = await db.execute<{ id: string }>(sql`
    update agent_run a set status = 'queued', locked_by = null
    where a.status = 'waiting_approval'
      and (a.state -> 'pending' ->> 'childRunId') is not null
      and exists (select 1 from run r where r.id = (a.state -> 'pending' ->> 'childRunId')::uuid and r.status in ('succeeded', 'failed', 'cancelled'))
    returning a.id`);
  return res.rows.length;
}
