import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { executeGraph, type ReusedStep } from "@/engine/execute";
import { evaluateIsolated } from "@/engine/sandbox";
import type { FlowGraph } from "@/engine/types";

export const STALE_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 3;

/** Thrown when another worker took over this run (stale recovery) — stop without writing. */
export class LeaseLostError extends Error {
  constructor(runId: string) {
    super(`Lost the lease on run ${runId}`);
  }
}

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
    const stillStale = and(eq(schema.run.id, r.id), eq(schema.run.status, "running"), lt(schema.run.heartbeatAt, cutoff));
    if (r.attempts >= MAX_ATTEMPTS) {
      await db
        .update(schema.run)
        .set({ status: "failed", lockedBy: null, finishedAt: new Date(), error: { code: "WORKER_LOST", message: `The worker stopped responding ${MAX_ATTEMPTS} times` } })
        .where(stillStale);
    } else {
      // Clearing locked_by revokes the old worker's lease: its guarded writes now match 0 rows.
      const requeued = await db.update(schema.run).set({ status: "queued", lockedBy: null }).where(stillStale).returning({ id: schema.run.id });
      if (requeued.length) {
        await db.update(schema.runStep).set({ status: "pending", startedAt: null }).where(and(eq(schema.runStep.runId, r.id), eq(schema.runStep.status, "running")));
      }
    }
  }
  return stale.length;
}

export async function processRun(db: Db, runId: string, workerId: string, log: (...a: unknown[]) => void = () => {}) {
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run || run.lockedBy !== workerId) return;
  const [version] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, run.flowVersionId));
  const graph = version.graph as FlowGraph;

  let reused: Map<string, ReusedStep> | undefined;
  if (run.rerunOfRunId && run.rerunFromNodeId) {
    const prev = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.rerunOfRunId));
    reused = new Map(
      prev.filter((s) => s.status === "succeeded" || s.status === "reused").map((s) => [s.nodeId, { input: s.input, output: s.output }]),
    );
  }

  const leased = and(eq(schema.run.id, runId), eq(schema.run.lockedBy, workerId), eq(schema.run.status, "running"));
  // Step writes only apply while this worker still holds the run's lease.
  const ownsRun = sql`exists (select 1 from ${schema.run} r where r.id = ${runId} and r.locked_by = ${workerId} and r.status = 'running')`;
  const guardedStepUpdate = async (nodeId: string, set: Partial<typeof schema.runStep.$inferInsert>) => {
    const res = await db
      .update(schema.runStep)
      .set(set)
      .where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId), ownsRun))
      .returning({ id: schema.runStep.id });
    if (res.length === 0) throw new LeaseLostError(runId);
  };

  const heartbeat = setInterval(() => {
    db.update(schema.run)
      .set({ heartbeatAt: new Date() })
      .where(leased)
      .catch((e: unknown) => log("heartbeat failed", runId, e instanceof Error ? e.message : e));
  }, 5000);

  const t0 = Date.now();
  try {
    const result = await executeGraph(graph, run.input, {
      fromNodeId: run.rerunFromNodeId ?? undefined,
      reused,
      evaluate: (source, input) => evaluateIsolated(source, input),
      onStepStart: (node) => guardedStepUpdate(node.id, { status: "running", startedAt: new Date() }),
      onStepDone: (s) =>
        guardedStepUpdate(s.nodeId, {
          status: s.status,
          input: (s.input ?? null) as object,
          output: (s.output ?? null) as object,
          error: s.error ?? null,
          skipReason: s.skipReason ?? null,
          startedAt: s.startedAt ?? null,
          finishedAt: s.finishedAt ?? null,
          durationMs: s.durationMs ?? null,
        }),
    });
    const done = await db
      .update(schema.run)
      .set({ status: result.status, output: result.output, error: result.error, finishedAt: new Date(), durationMs: Date.now() - t0, lockedBy: null })
      .where(leased)
      .returning({ id: schema.run.id });
    if (done.length === 0) throw new LeaseLostError(runId);
  } catch (err) {
    if (err instanceof LeaseLostError) {
      log("lease lost; another worker owns", runId);
      return;
    }
    // Keep internals (driver/SQL messages) out of what workspace members see.
    log("run failed in worker", runId, err instanceof Error ? err.stack : err);
    await db
      .update(schema.run)
      .set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - t0, error: { code: "WORKER_ERROR", message: "The execution worker hit an internal error. Re-run this flow; if it keeps failing, check the worker logs." }, lockedBy: null })
      .where(leased);
  } finally {
    clearInterval(heartbeat);
  }
}
