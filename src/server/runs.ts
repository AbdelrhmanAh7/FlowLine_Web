import { and, asc, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import type { RunStatus } from "@/db/schema";
import { sampleInputFor } from "@/engine/execute";
import { VALUE_MAX_BYTES } from "@/engine/expression";
import { getNodeDefinition } from "@/engine/nodes";
import type { FlowGraph } from "@/engine/types";
import { descendants, topoOrder, validateGraph } from "@/engine/validate";
import type { CurrentUser } from "./access";
import { consumeFault } from "./faults";
import { insertVersion } from "./flows";
import { HttpError, notFound } from "./http";
import { planEntitlements } from "./entitlements";
import { redact } from "./redact";

export const RUN_CHANNEL = "flowline_runs";
/** Hard ceiling on a single run's wall-clock time (excluding time waiting for a human). */
export const RUN_TIMEOUT_MS = 15 * 60_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = Db | Tx;

export interface EnqueueOptions {
  input?: unknown;
  rerunOf?: typeof schema.run.$inferSelect;
  fromNodeId?: string;
  /** For reruns: "original" = the source run's exact version; "latest" = current saved flow. */
  rerunRevision?: "original" | "latest";
  triggerKind?: "manual" | "webhook" | "schedule" | "rerun" | "api" | "agent";
  /** api/agent triggers: run the PUBLISHED version (live keys, agents) or a snapshot of the draft (test keys). */
  usePublished?: boolean;
  /** With usePublished: refuse (409 WORKFLOW_REPUBLISHED) unless this is still the published version — e.g. the one an approval covered. */
  expectPublishedVersionId?: string;
  apiKeyId?: string;
  agentRunId?: string;
  /** Dedupe key: manual click id, webhook event id, schedule fire time. */
  triggerRef?: string;
  /** Acting user for triggered runs (the publisher). */
  actingUserId?: string;
}

function connectionsOf(graph: FlowGraph): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of graph.nodes) {
    const c = (n.data.config as { connectionId?: string }).connectionId;
    if (c) out[n.id] = c;
  }
  return out;
}

/**
 * Validates, pins an immutable version, and queues a run.
 * - manual: snapshot of the current (draft) graph.
 * - webhook/schedule: the PUBLISHED version; refused while the flow is paused.
 * - rerun: the source run's version ("original") or a fresh snapshot ("latest").
 */
export async function enqueueRun(user: CurrentUser | null, flowId: string, opts: EnqueueOptions = {}, outer?: DbOrTx) {
  return (await enqueueRunEx(user, flowId, opts, outer)).run;
}

/** Same as enqueueRun, and reports whether the trigger ref matched an existing run (deduplicated). */
export async function enqueueRunEx(user: CurrentUser | null, flowId: string, opts: EnqueueOptions = {}, outer?: DbOrTx) {
  if (user) {
    const fault = consumeFault(user.id, "run");
    if (fault) throw new HttpError(fault.status, "INJECTED_FAULT", "Injected run failure (test environment)");
  }
  const kind = opts.triggerKind ?? (opts.rerunOf ? "rerun" : "manual");
  const work = async (tx: DbOrTx) => {
    const [flow] = await tx.select().from(schema.flow).where(eq(schema.flow.id, flowId)).for("update");
    if (!flow || flow.deletedAt) throw notFound("Flow not found");

    // Idempotent enqueue: the same trigger event (or double-clicked Run) returns the existing run.
    if (opts.triggerRef) {
      const [dupe] = await tx
        .select()
        .from(schema.run)
        .where(and(eq(schema.run.flowId, flowId), eq(schema.run.triggerKind, kind), eq(schema.run.triggerRef, opts.triggerRef)));
      if (dupe) return { run: dupe, duplicate: true };
    }

    const [ws] = await tx.select().from(schema.workspace).where(eq(schema.workspace.id, flow.workspaceId)).for("update");
    const [{ queued }] = await tx
      .select({ queued: sql<number>`count(*)::int` })
      .from(schema.run)
      .where(and(eq(schema.run.workspaceId, flow.workspaceId), eq(schema.run.status, "queued")));
    if (queued >= ws!.maxQueuedRuns) throw new HttpError(429, "QUEUE_FULL", `This workspace already has ${queued} queued runs (limit ${ws!.maxQueuedRuns}). Try again when some finish.`);
    await assertExecutionAllowed(tx, ws!);

    let version: typeof schema.flowVersion.$inferSelect;
    if (kind === "webhook" || kind === "schedule" || ((kind === "api" || kind === "agent") && opts.usePublished !== false)) {
      if (flow.pausedReason) throw new HttpError(409, "FLOW_PAUSED", "This flow is paused until its connection is repaired");
      if (!flow.publishedVersionId) throw new HttpError(409, "NOT_PUBLISHED", "Publish the flow before triggers can run it");
      if (opts.expectPublishedVersionId && opts.expectPublishedVersionId !== flow.publishedVersionId) {
        throw new HttpError(409, "WORKFLOW_REPUBLISHED", "The workflow was republished after it was checked/approved — it needs a new approval before it can run");
      }
      const [v] = await tx.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, flow.publishedVersionId));
      version = v!;
    } else if (kind === "rerun" && opts.rerunOf && (opts.rerunRevision ?? "original") === "original") {
      const [v] = await tx.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, opts.rerunOf.flowVersionId));
      version = v!;
    } else {
      const issues = validateGraph(flow.graph as FlowGraph);
      if (issues.length > 0) throw new HttpError(422, "INVALID_FLOW", "Fix the flow before running it", issues);
      version = await insertVersion(tx as Tx, user!, flow, "run");
    }
    const graph = version.graph as FlowGraph;
    if (validateGraph(graph).length > 0) throw new HttpError(422, "INVALID_FLOW", "This version of the flow is not runnable");
    if (opts.fromNodeId && !graph.nodes.some((n) => n.id === opts.fromNodeId)) {
      throw new HttpError(422, "NODE_REMOVED", "That step doesn't exist in the selected revision");
    }

    let input: unknown = opts.input;
    if (input === undefined) {
      try {
        input = opts.rerunOf ? opts.rerunOf.input : sampleInputFor(graph);
      } catch {
        throw new HttpError(422, "INVALID_FLOW", "The trigger's sample payload is not valid JSON");
      }
    }
    if (JSON.stringify(input ?? null).length > VALUE_MAX_BYTES) {
      throw new HttpError(413, "INPUT_TOO_LARGE", `Run input must be under ${Math.round(VALUE_MAX_BYTES / 1024)}KB`);
    }

    const actingUserId = opts.actingUserId ?? user?.id ?? flow.publishedBy ?? flow.createdBy ?? "";
    const [{ runCounter }] = await tx
      .update(schema.workspace)
      .set({ runCounter: sql`${schema.workspace.runCounter} + 1` })
      .where(eq(schema.workspace.id, flow.workspaceId))
      .returning({ runCounter: schema.workspace.runCounter });

    const [run] = await tx
      .insert(schema.run)
      .values({
        workspaceId: flow.workspaceId,
        flowId: flow.id,
        flowVersionId: version.id,
        number: runCounter,
        status: "queued",
        input: input as object,
        rerunOfRunId: opts.rerunOf?.id ?? null,
        rerunFromNodeId: opts.fromNodeId ?? null,
        triggerKind: kind,
        triggerRef: opts.triggerRef ?? null,
        apiKeyId: opts.apiKeyId ?? null,
        agentRunId: opts.agentRunId ?? null,
        policy: { actingUserId, connections: connectionsOf(graph) },
        deadlineAt: new Date(Date.now() + RUN_TIMEOUT_MS),
        createdBy: user?.id ?? null,
      })
      .returning();

    const order = topoOrder(graph);
    await tx.insert(schema.runStep).values(
      order.map((n, position) => ({ runId: run!.id, nodeId: n.id, nodeType: n.type, nodeLabel: n.data.label, position, status: "pending" as const })),
    );
    await tx.insert(schema.runEvent).values({ runId: run!.id, workspaceId: flow.workspaceId, type: "queued", data: { trigger: kind, version: version.version } });
    await recordExecution(tx, run!, ws!);
    await tx.execute(sql`select pg_notify(${RUN_CHANNEL}, ${run!.id})`);
    return { run: run!, duplicate: false };
  };
  return outer ? work(outer) : db.transaction(work);
}

/**
 * Monthly execution limit (workflow runs + agent runs, calendar month UTC). The workspace setting and the
 * billing plan's entitlement both apply; the stricter one wins. Checked under the workspace row lock.
 */
export async function assertExecutionAllowed(tx: DbOrTx, ws: typeof schema.workspace.$inferSelect) {
  const limit = await effectiveExecutionLimit(tx, ws);
  if (limit == null) return;
  const used = await executionsThisMonth(tx, ws.id);
  if (used >= limit) throw new HttpError(429, "EXECUTION_LIMIT", `This workspace reached its monthly limit of ${limit} executions. Raise the limit or wait for the next month.`);
}

export async function executionsThisMonth(tx: DbOrTx, workspaceId: string) {
  const start = monthStartUtc();
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.usageEvent)
    .where(and(eq(schema.usageEvent.workspaceId, workspaceId), eq(schema.usageEvent.kind, "execution"), sql`${schema.usageEvent.createdAt} >= ${start}`));
  return r?.n ?? 0;
}

export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Workspace limit ∧ plan entitlement (billing), whichever is stricter; null = unlimited. */
export async function effectiveExecutionLimit(tx: DbOrTx, ws: typeof schema.workspace.$inferSelect): Promise<number | null> {
  const limits = [ws.maxMonthlyExecutions];
  const ent = await planEntitlements(tx, ws.id);
  if (ent) limits.push(ent.maxMonthlyExecutions);
  const set = limits.filter((l): l is number => l != null);
  return set.length ? Math.min(...set) : null;
}

/** One execution event per run, unique by run id — a retry of the same run is never counted twice. */
async function recordExecution(tx: DbOrTx, run: typeof schema.run.$inferSelect, ws: typeof schema.workspace.$inferSelect) {
  const price = ws.prices?.execution?.perCallMicros;
  await tx
    .insert(schema.usageEvent)
    .values({
      workspaceId: run.workspaceId,
      runId: run.id,
      kind: "execution",
      status: "settled",
      idempotencyKey: `execution:${run.id}`,
      quantity: 1,
      costMicros: price ?? 0,
      unpriced: price == null,
      estimatedMicros: price ?? 0,
      settledAt: new Date(),
    })
    .onConflictDoNothing();
}

/** What a re-run from `fromNodeId` will do — shown to the user before confirming. */
export async function rerunPreview(original: typeof schema.run.$inferSelect, fromNodeId: string, revision: "original" | "latest") {
  let graph: FlowGraph;
  let versionLabel: string;
  if (revision === "original") {
    const [v] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, original.flowVersionId));
    graph = v!.graph as FlowGraph;
    versionLabel = `v${v!.version} (the run's original revision)`;
  } else {
    const [f] = await db.select().from(schema.flow).where(eq(schema.flow.id, original.flowId));
    graph = f!.graph as FlowGraph;
    versionLabel = `current saved flow (rev ${f!.revision})`;
  }
  if (!graph.nodes.some((n) => n.id === fromNodeId)) throw new HttpError(422, "NODE_REMOVED", "That step doesn't exist in the selected revision");
  const rerun = descendants(graph, fromNodeId);
  const steps = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, original.id));
  const byNode = new Map(steps.map((s) => [s.nodeId, s]));
  const actionMeta = await import("@/integrations/registry").then((m) => m.getAction);
  const willRerun = topoOrder(graph)
    .filter((n) => rerun.has(n.id))
    .map((n) => {
      const cfg = n.data.config as { actionId?: string; method?: string; sideEffect?: string };
      let sideEffect: string = getNodeDefinition(n.type)?.sideEffect ?? "none";
      let sensitive = false;
      if (n.type === "integration.action" && cfg.actionId) {
        const a = actionMeta(cfg.actionId);
        sideEffect = a?.action.sideEffect ?? "unknown";
        sensitive = Boolean(a?.action.sensitive);
      }
      if (n.type === "http.request") sideEffect = (cfg.method ?? "GET") === "GET" ? "none" : (cfg.sideEffect ?? "non_idempotent");
      const previously = byNode.get(n.id)?.status ?? "not run";
      return { nodeId: n.id, label: n.data.label, type: n.type, sideEffect, sensitive, previousStatus: previously };
    });
  const reused = topoOrder(graph)
    .filter((n) => !rerun.has(n.id) && ["succeeded", "reused"].includes(byNode.get(n.id)?.status ?? ""))
    .map((n) => ({ nodeId: n.id, label: n.data.label }));
  const missingUpstream = topoOrder(graph).filter((n) => !rerun.has(n.id) && !["succeeded", "reused"].includes(byNode.get(n.id)?.status ?? "")).map((n) => n.data.label);
  const warnings = willRerun
    .filter((s) => s.sideEffect === "non_idempotent" && (s.previousStatus === "succeeded" || s.previousStatus === "uncertain"))
    .map((s) => `"${s.label}" already ran in run #${original.number} and is not idempotent — running it again may repeat its external effect.`);
  return { revision: versionLabel, willRerun, reused, warnings, missingUpstream };
}

export async function rerunFromStep(user: CurrentUser, original: typeof schema.run.$inferSelect, fromNodeId: string, revision: "original" | "latest" = "original", clientRequestId?: string) {
  if (["queued", "running", "waiting_approval"].includes(original.status)) {
    throw new HttpError(409, "RUN_ACTIVE", "Wait for this run to finish (or cancel it) before re-running it");
  }
  return enqueueRun(user, original.flowId, {
    rerunOf: original, fromNodeId, rerunRevision: revision, triggerKind: "rerun",
    // Bind retries to the complete request. A different source, step or revision is a deliberate new execution.
    triggerRef: clientRequestId ? `rerun:${JSON.stringify([original.id, fromNodeId, revision, clientRequestId])}` : undefined,
  });
}

/** Cancel: queued / waiting runs stop immediately; running runs are signalled and stop between (or during) steps. */
export async function cancelRun(user: CurrentUser, runId: string) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(schema.run).where(eq(schema.run.id, runId)).for("update");
    if (!r) throw notFound("Run not found");
    if (["succeeded", "failed", "cancelled"].includes(r.status)) throw new HttpError(409, "RUN_FINISHED", `Run #${r.number} already ${r.status}`);
    await tx.insert(schema.runEvent).values({ runId, workspaceId: r.workspaceId, type: "cancel_requested", data: { by: user.id } });
    if (r.status === "queued" || r.status === "waiting_approval") {
      await tx.update(schema.run).set({ status: "cancelled", cancelRequestedAt: new Date(), cancelRequestedBy: user.id, finishedAt: new Date(), lockedBy: null }).where(eq(schema.run.id, runId));
      await tx
        .update(schema.runStep)
        .set({ status: "cancelled", skipReason: "Run was cancelled" })
        .where(and(eq(schema.runStep.runId, runId), inArray(schema.runStep.status, ["pending", "waiting_approval"])));
      await tx.update(schema.approval).set({ status: "superseded", note: "Run cancelled" }).where(and(eq(schema.approval.runId, runId), eq(schema.approval.status, "pending")));
      await tx.insert(schema.runEvent).values({ runId, workspaceId: r.workspaceId, type: "cancelled" });
      return { status: "cancelled" as const };
    }
    await tx.update(schema.run).set({ cancelRequestedAt: new Date(), cancelRequestedBy: user.id }).where(eq(schema.run.id, runId));
    return { status: "cancelling" as const };
  });
}

export interface RunFilter {
  status?: "succeeded" | "failed" | "running" | "waiting" | "cancelled";
  q?: string;
  flowId?: string;
  limit?: number;
  /** Cursor: ISO createdAt + id of the last item from the previous page. */
  before?: { createdAt: string; id: string };
}

export async function listRuns(workspaceId: string, f: RunFilter = {}) {
  return (await listRunsPage(workspaceId, f)).runs;
}

/** Cursor-paginated run list (newest first). */
export async function listRunsPage(workspaceId: string, f: RunFilter = {}) {
  const where: SQL[] = [eq(schema.run.workspaceId, workspaceId)];
  if (f.status === "running") where.push(inArray(schema.run.status, ["queued", "running"]));
  else if (f.status === "waiting") where.push(eq(schema.run.status, "waiting_approval"));
  else if (f.status) where.push(eq(schema.run.status, f.status as RunStatus));
  if (f.flowId) where.push(eq(schema.run.flowId, f.flowId));
  if (f.before) {
    const t = new Date(f.before.createdAt);
    if (!Number.isNaN(t.getTime())) where.push(or(lt(schema.run.createdAt, t), and(eq(schema.run.createdAt, t), lt(schema.run.id, f.before.id)))!);
  }
  const q = f.q?.trim();
  if (q) {
    const num = Number(q.replace(/^#/, ""));
    const byName = ilike(schema.flow.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(Number.isInteger(num) && num > 0 ? or(byName, eq(schema.run.number, num))! : byName);
  }
  const limit = Math.min(Math.max(1, Math.trunc(f.limit ?? 50) || 50), 100);
  const runs = await db
    .select({
      id: schema.run.id,
      number: schema.run.number,
      status: schema.run.status,
      flowId: schema.run.flowId,
      flowName: schema.flow.name,
      triggerKind: schema.run.triggerKind,
      createdAt: schema.run.createdAt,
      startedAt: schema.run.startedAt,
      finishedAt: schema.run.finishedAt,
      durationMs: schema.run.durationMs,
      error: schema.run.error,
      rerunOfRunId: schema.run.rerunOfRunId,
      cancelRequestedAt: schema.run.cancelRequestedAt,
    })
    .from(schema.run)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(and(...where))
    .orderBy(desc(schema.run.createdAt), desc(schema.run.id))
    .limit(limit + 1);
  const page = runs.slice(0, limit);
  const nextCursor = runs.length > limit ? { createdAt: page.at(-1)!.createdAt.toISOString(), id: page.at(-1)!.id } : null;
  if (page.length === 0) return { runs: [], nextCursor };
  const steps = await db
    .select({
      runId: schema.runStep.runId,
      nodeId: schema.runStep.nodeId,
      nodeType: schema.runStep.nodeType,
      nodeLabel: schema.runStep.nodeLabel,
      position: schema.runStep.position,
      status: schema.runStep.status,
      durationMs: schema.runStep.durationMs,
      error: schema.runStep.error,
    })
    .from(schema.runStep)
    .where(inArray(schema.runStep.runId, page.map((r) => r.id)))
    .orderBy(asc(schema.runStep.position));
  return { runs: page.map((r) => ({ ...r, steps: steps.filter((s) => s.runId === r.id) })), nextCursor };
}

export async function getRunDetail(runId: string) {
  const [run] = await db
    .select({ run: schema.run, flowName: schema.flow.name })
    .from(schema.run)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(eq(schema.run.id, runId));
  if (!run) throw notFound("Run not found");
  const steps = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId)).orderBy(asc(schema.runStep.position));
  const [version] = await db
    .select({ version: schema.flowVersion.version, reason: schema.flowVersion.reason, graph: schema.flowVersion.graph })
    .from(schema.flowVersion)
    .where(eq(schema.flowVersion.id, run.run.flowVersionId));
  const approvals = await db
    .select({
      id: schema.approval.id,
      nodeId: schema.approval.nodeId,
      kind: schema.approval.kind,
      actionId: schema.approval.actionId,
      status: schema.approval.status,
      resolution: schema.approval.resolution,
      argsPreview: schema.approval.argsPreview,
      requestedAt: schema.approval.requestedAt,
      expiresAt: schema.approval.expiresAt,
      decidedAt: schema.approval.decidedAt,
      note: schema.approval.note,
    })
    .from(schema.approval)
    .where(eq(schema.approval.runId, runId))
    .orderBy(desc(schema.approval.requestedAt));
  const events = await db.select().from(schema.runEvent).where(eq(schema.runEvent.runId, runId)).orderBy(asc(schema.runEvent.id)).limit(500);
  // Worker bookkeeping (host/pid lease, attempts, heartbeat) and the policy snapshot are internal.
  const { lockedBy: _l, attempts: _a, heartbeatAt: _h, policy: _p, ...publicRun } = run.run;
  return {
    ...redact(publicRun),
    flowName: run.flowName,
    steps: steps.map(({ dataEnc: _enc, ...s }) => redact(s)), // the encrypted resume copy never leaves the server
    version: version?.version ?? null,
    versionReason: version?.reason ?? null,
    graph: version?.graph ?? null,
    approvals,
    events: events.map((e) => ({ id: e.id, at: e.at, type: e.type, nodeId: e.nodeId, data: e.data })),
  };
}

export async function workerStatus() {
  const [row] = await db
    .select({ lastSeenAt: sql<Date | null>`max(${schema.workerHeartbeat.lastSeenAt})` })
    .from(schema.workerHeartbeat);
  const last = row?.lastSeenAt ? new Date(row.lastSeenAt) : null;
  const online = last != null && Date.now() - last.getTime() < 15000;
  return { online, lastSeenAt: last };
}
