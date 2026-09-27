import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { RunStatus } from "@/db/schema";
import { sampleInputFor } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";
import { topoOrder, validateGraph } from "@/engine/validate";
import type { CurrentUser } from "./access";
import { consumeFault } from "./faults";
import { insertVersion } from "./flows";
import { HttpError, notFound } from "./http";

export const RUN_CHANNEL = "flowline_runs";

interface EnqueueOptions {
  input?: unknown;
  rerunOf?: typeof schema.run.$inferSelect;
  fromNodeId?: string;
}

/** Validates the saved flow, pins a version snapshot, and queues a run for the worker. */
export async function enqueueRun(user: CurrentUser, flowId: string, opts: EnqueueOptions = {}) {
  const fault = consumeFault("run");
  if (fault) throw new HttpError(fault.status, "INJECTED_FAULT", "Injected run failure (test environment)");

  return db.transaction(async (tx) => {
    const [flow] = await tx.select().from(schema.flow).where(eq(schema.flow.id, flowId)).for("update");
    if (!flow || flow.deletedAt) throw notFound("Flow not found");
    const graph = flow.graph as FlowGraph;
    const issues = validateGraph(graph);
    if (issues.length > 0) throw new HttpError(422, "INVALID_FLOW", "Fix the flow before running it", issues);

    if (opts.fromNodeId && !graph.nodes.some((n) => n.id === opts.fromNodeId)) {
      throw new HttpError(422, "NODE_REMOVED", "That step no longer exists in the saved flow");
    }

    let input: unknown = opts.input;
    if (input === undefined) {
      try {
        input = opts.rerunOf ? opts.rerunOf.input : sampleInputFor(graph);
      } catch {
        throw new HttpError(422, "INVALID_FLOW", "The trigger's sample payload is not valid JSON");
      }
    }

    const version = await insertVersion(tx, user, flow, "run");
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
        createdBy: user.id,
      })
      .returning();

    const order = topoOrder(graph);
    await tx.insert(schema.runStep).values(
      order.map((n, position) => ({ runId: run.id, nodeId: n.id, nodeType: n.type, nodeLabel: n.data.label, position, status: "pending" as const })),
    );
    await tx.execute(sql`select pg_notify(${RUN_CHANNEL}, ${run.id})`);
    return run;
  });
}

export async function rerunFromStep(user: CurrentUser, original: typeof schema.run.$inferSelect, fromNodeId: string) {
  if (original.status === "queued" || original.status === "running") {
    throw new HttpError(409, "RUN_ACTIVE", "Wait for this run to finish before re-running it");
  }
  return enqueueRun(user, original.flowId, { rerunOf: original, fromNodeId });
}

export interface RunFilter {
  status?: "succeeded" | "failed" | "running";
  q?: string;
  flowId?: string;
  limit?: number;
}

export async function listRuns(workspaceId: string, f: RunFilter = {}) {
  const where: SQL[] = [eq(schema.run.workspaceId, workspaceId)];
  if (f.status === "running") where.push(inArray(schema.run.status, ["queued", "running"]));
  else if (f.status) where.push(eq(schema.run.status, f.status as RunStatus));
  if (f.flowId) where.push(eq(schema.run.flowId, f.flowId));
  const q = f.q?.trim();
  if (q) {
    const num = Number(q.replace(/^#/, ""));
    const byName = ilike(schema.flow.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(Number.isInteger(num) && num > 0 ? or(byName, eq(schema.run.number, num))! : byName);
  }
  const runs = await db
    .select({
      id: schema.run.id,
      number: schema.run.number,
      status: schema.run.status,
      flowId: schema.run.flowId,
      flowName: schema.flow.name,
      createdAt: schema.run.createdAt,
      startedAt: schema.run.startedAt,
      finishedAt: schema.run.finishedAt,
      durationMs: schema.run.durationMs,
      error: schema.run.error,
      rerunOfRunId: schema.run.rerunOfRunId,
    })
    .from(schema.run)
    .innerJoin(schema.flow, eq(schema.flow.id, schema.run.flowId))
    .where(and(...where))
    .orderBy(desc(schema.run.createdAt))
    .limit(Math.min(f.limit ?? 50, 100));
  if (runs.length === 0) return [];
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
    .where(inArray(schema.runStep.runId, runs.map((r) => r.id)))
    .orderBy(asc(schema.runStep.position));
  return runs.map((r) => ({ ...r, steps: steps.filter((s) => s.runId === r.id) }));
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
    .select({ version: schema.flowVersion.version, graph: schema.flowVersion.graph })
    .from(schema.flowVersion)
    .where(eq(schema.flowVersion.id, run.run.flowVersionId));
  return { ...run.run, flowName: run.flowName, steps, version: version?.version ?? null, graph: version?.graph ?? null };
}

export async function workerStatus() {
  const [row] = await db
    .select({ lastSeenAt: sql<Date | null>`max(${schema.workerHeartbeat.lastSeenAt})` })
    .from(schema.workerHeartbeat);
  const last = row?.lastSeenAt ? new Date(row.lastSeenAt) : null;
  const online = last != null && Date.now() - last.getTime() < 15000;
  return { online, lastSeenAt: last };
}
