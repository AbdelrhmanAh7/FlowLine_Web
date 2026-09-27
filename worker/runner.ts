import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { executeGraph, type ReusedStep } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";

export const STALE_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 3;

/** Atomically claims the oldest queued run (SKIP LOCKED makes multiple workers safe). */
export async function claimNextRun(db: Db, workerId: string) {
  const res = await db.execute<{ id: string }>(sql`
    update run set status = 'running', started_at = coalesce(started_at, now()), locked_by = ${workerId},
      heartbeat_at = now(), attempts = attempts + 1
    where id = (
      select id from run where status = 'queued' order by created_at for update skip locked limit 1
    )
    returning id`);
  return res.rows[0]?.id ?? null;
}

/** Runs claimed by a worker that stopped heart-beating go back to the queue (or fail after MAX_ATTEMPTS). */
export async function recoverStaleRuns(db: Db) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db
    .select({ id: schema.run.id, attempts: schema.run.attempts })
    .from(schema.run)
    .where(and(eq(schema.run.status, "running"), lt(schema.run.heartbeatAt, cutoff)));
  for (const r of stale) {
    if (r.attempts >= MAX_ATTEMPTS) {
      await db
        .update(schema.run)
        .set({ status: "failed", finishedAt: new Date(), error: { code: "WORKER_LOST", message: `Worker stopped responding ${MAX_ATTEMPTS} times` } })
        .where(eq(schema.run.id, r.id));
    } else {
      await db.update(schema.run).set({ status: "queued", lockedBy: null }).where(and(eq(schema.run.id, r.id), eq(schema.run.status, "running")));
      await db.update(schema.runStep).set({ status: "pending", startedAt: null }).where(and(eq(schema.runStep.runId, r.id), eq(schema.runStep.status, "running")));
    }
  }
  return stale.length;
}

export async function processRun(db: Db, runId: string, workerId: string) {
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run) return;
  const [version] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, run.flowVersionId));
  const graph = version.graph as FlowGraph;

  let reused: Map<string, ReusedStep> | undefined;
  if (run.rerunOfRunId && run.rerunFromNodeId) {
    const prev = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.rerunOfRunId));
    reused = new Map(
      prev.filter((s) => s.status === "succeeded" || s.status === "reused").map((s) => [s.nodeId, { input: s.input, output: s.output }]),
    );
  }

  const heartbeat = setInterval(() => {
    void db.update(schema.run).set({ heartbeatAt: new Date() }).where(and(eq(schema.run.id, runId), eq(schema.run.lockedBy, workerId)));
  }, 5000);

  const t0 = Date.now();
  try {
    const result = await executeGraph(graph, run.input, {
      fromNodeId: run.rerunFromNodeId ?? undefined,
      reused,
      onStepStart: async (node) => {
        await db
          .update(schema.runStep)
          .set({ status: "running", startedAt: new Date() })
          .where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, node.id)));
      },
      onStepDone: async (s) => {
        await db
          .update(schema.runStep)
          .set({
            status: s.status,
            input: (s.input ?? null) as object,
            output: (s.output ?? null) as object,
            error: s.error ?? null,
            skipReason: s.skipReason ?? null,
            startedAt: s.startedAt ?? null,
            finishedAt: s.finishedAt ?? null,
            durationMs: s.durationMs ?? null,
          })
          .where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, s.nodeId)));
      },
    });
    await db
      .update(schema.run)
      .set({
        status: result.status,
        output: result.output,
        error: result.error,
        finishedAt: new Date(),
        durationMs: Date.now() - t0,
        lockedBy: null,
      })
      .where(eq(schema.run.id, runId));
  } catch (err) {
    await db
      .update(schema.run)
      .set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - t0, error: { code: "WORKER_ERROR", message: err instanceof Error ? err.message : String(err) }, lockedBy: null })
      .where(eq(schema.run.id, runId));
  } finally {
    clearInterval(heartbeat);
  }
}
