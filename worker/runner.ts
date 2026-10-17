import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { track } from "@/server/telemetry";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { executeGraph, type PriorStep, type ReusedStep } from "@/engine/execute";
import { evaluateIsolated } from "@/engine/sandbox";
import type { FlowGraph, StepResult } from "@/engine/types";
import { contextId, encryptSecretV2, openSecret, type SecretContext } from "@/server/crypto";
import { logEvent } from "@/server/events";
import { redact } from "@/server/redact";
import { createHandler, type HandlerContext } from "./handlers";

export const STALE_AFTER_MS = 60_000;
export const MAX_ATTEMPTS = 3;
/** Wall-clock budget for one execution segment (a run resumed after approval gets a fresh segment). */
export const SEGMENT_TIMEOUT_MS = Number(process.env.FLOWLINE_RUN_SEGMENT_TIMEOUT_MS ?? 15 * 60_000);

/** Thrown when another worker took over this run (stale recovery) — stop without writing. */
export class LeaseLostError extends Error {
  constructor(runId: string) {
    super(`Lost the lease on run ${runId}`);
  }
}

/**
 * Atomically claims the oldest queued run whose workspace is under its concurrency
 * limit. Claims are serialized with a transaction-scoped advisory lock so two
 * workers can't both push a workspace over its limit; SKIP LOCKED keeps it cheap.
 */
export async function claimNextRun(db: Db, workerId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(733101)`);
    const res = await tx.execute<{ id: string }>(sql`
      update run set status = 'running', started_at = coalesce(started_at, now()), locked_by = ${workerId},
        heartbeat_at = now()
      where id = (
        select r.id from run r join workspace w on w.id = r.workspace_id
        where r.status = 'queued'
          and (select count(*) from run x where x.workspace_id = r.workspace_id and x.status = 'running') < w.max_concurrent_runs
        order by r.created_at
        for update of r skip locked
        limit 1
      )
      returning id`);
    return res.rows[0]?.id ?? null;
  });
}

/**
 * Runs claimed by a worker that stopped heart-beating go back to the queue, or fail once workers
 * have been lost MAX_ATTEMPTS times. `attempts` counts worker losses only — normal resumes after
 * approvals or reviews don't use it up.
 */
export async function recoverStaleRuns(db: Db) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db
    .select({ id: schema.run.id, attempts: schema.run.attempts, workspaceId: schema.run.workspaceId })
    .from(schema.run)
    .where(and(eq(schema.run.status, "running"), lt(schema.run.heartbeatAt, cutoff)));
  for (const r of stale) {
    const stillStale = and(eq(schema.run.id, r.id), eq(schema.run.status, "running"), lt(schema.run.heartbeatAt, cutoff));
    if (r.attempts + 1 >= MAX_ATTEMPTS) {
      await db
        .update(schema.run)
        .set({ status: "failed", lockedBy: null, finishedAt: new Date(), error: { code: "WORKER_LOST", message: `The worker stopped responding ${MAX_ATTEMPTS} times` } })
        .where(stillStale);
    } else {
      // Clearing locked_by revokes the old worker's lease: its guarded writes now match 0 rows.
      // Steps left "running" stay as they are: the next worker treats them as interrupted (verify/review, never blind re-send).
      const requeued = await db.update(schema.run).set({ status: "queued", lockedBy: null, attempts: sql`${schema.run.attempts} + 1` }).where(stillStale).returning({ id: schema.run.id });
      if (requeued.length) await logEvent(db, { runId: r.id, workspaceId: r.workspaceId, type: "requeued", data: { reason: "worker heartbeat lost" } });
    }
  }
  return stale.length;
}

const TERMINAL = new Set(["succeeded", "reused", "failed", "skipped", "cancelled"]);

/** AAD context of a step's encrypted data: bound to the run, the node and the workspace. */
function stepDataContext(runId: string, nodeId: string, workspaceId: string): SecretContext {
  return { table: "run_step", rowId: `${runId}.${contextId(nodeId)}`, workspaceId, provider: "engine", purpose: "step_data" };
}

/** Restore raw execution data only with its encrypted redaction context; old data uses the public copy. */
function stepData(s: typeof schema.runStep.$inferSelect, workspaceId: string, secrets: string[]): { input: unknown; output: unknown } {
  if (s.dataEnc) {
    try {
      const data = openSecret<{ input: unknown; output: unknown; secrets?: unknown }>({ ciphertext: s.dataEnc.ciphertext, keyId: s.dataEnc.keyId, legacy: s.dataLegacy }, stepDataContext(s.runId, s.nodeId, workspaceId));
      if (Array.isArray(data.secrets) && data.secrets.every((v): v is string => typeof v === "string")) {
        for (const secret of data.secrets) if (!secrets.includes(secret)) secrets.push(secret);
        return { input: data.input, output: data.output };
      }
    } catch {
      /* key rotated away — fall back to what is visible */
    }
  }
  // Legacy encrypted steps lack the secret list: never resurrect raw credentials from them.
  return { input: redact(s.input), output: redact(s.output) };
}

export async function processRun(db: Db, runId: string, workerId: string, log: (...a: unknown[]) => void = () => {}) {
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run || run.lockedBy !== workerId) return;
  const leased = and(eq(schema.run.id, runId), eq(schema.run.lockedBy, workerId), eq(schema.run.status, "running"));
  const [version] = await db.select().from(schema.flowVersion).where(eq(schema.flowVersion.id, run.flowVersionId));
  const [workspace] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, run.workspaceId));
  const graph = version!.graph as FlowGraph;

  const fail = async (code: string, message: string) => {
    await db.update(schema.run).set({ status: "failed", finishedAt: new Date(), error: { code, message }, lockedBy: null }).where(leased);
    await logEvent(db, { runId, workspaceId: run.workspaceId, type: "finished", data: { status: "failed", code } });
    track("run_finished", { workspaceId: run.workspaceId }, { status: "failed", code, trigger: run.triggerKind });
  };

  // Permission policy re-check at execution time: the acting user must still be able to run this flow.
  const acting = run.policy?.actingUserId;
  if (acting) {
    const [m] = await db
      .select({ role: schema.workspaceMember.role })
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, run.workspaceId), eq(schema.workspaceMember.userId, acting)));
    if (!m || m.role === "viewer") return fail("PERMISSION_REVOKED", "The user this run acts for no longer has editor access to the workspace");
  }
  if (run.cancelRequestedAt) {
    await db.update(schema.run).set({ status: "cancelled", finishedAt: new Date(), lockedBy: null }).where(leased);
    return;
  }

  // Resume state: finished steps are kept; steps that were running when a worker died are "interrupted".
  const existing = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId));
  const secrets: string[] = [];
  const prior = new Map<string, PriorStep>();
  const interrupted = new Set<string>();
  for (const s of existing) {
    if (TERMINAL.has(s.status)) prior.set(s.nodeId, { status: s.status as PriorStep["status"], ...stepData(s, run.workspaceId, secrets), error: s.error, skipReason: s.skipReason });
    else if (s.status === "running") interrupted.add(s.nodeId);
  }
  await logEvent(db, { runId, workspaceId: run.workspaceId, type: prior.size || interrupted.size ? "resumed" : "claimed", data: { worker: workerId.split("-").slice(-1)[0], interrupted: [...interrupted] } });

  let reused: Map<string, ReusedStep> | undefined;
  if (run.rerunOfRunId && run.rerunFromNodeId) {
    const prev = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, run.rerunOfRunId));
    reused = new Map(prev.filter((s) => s.status === "succeeded" || s.status === "reused").map((s) => [s.nodeId, stepData(s, run.workspaceId, secrets)]));
  }

  const hctx: HandlerContext = { db, run, workspace: workspace!, interrupted, secrets, path: "", flowStack: [run.flowId], depth: 0 };
  const ac = new AbortController();
  let cancelRequested = false;
  let timedOut = false;
  let leaseLost = false;
  const segmentTimer = setTimeout(() => {
    timedOut = true;
    ac.abort(new Error("RUN_TIMEOUT"));
  }, SEGMENT_TIMEOUT_MS);
  let ticks = 0;
  const poll = setInterval(() => {
    ticks++;
    db.select({ c: schema.run.cancelRequestedAt, l: schema.run.lockedBy })
      .from(schema.run)
      .where(eq(schema.run.id, runId))
      .then(([r]) => {
        if (r?.l !== workerId) {
          leaseLost = true;
          ac.abort(new Error("LEASE_LOST"));
        } else if (r?.c && !cancelRequested) {
          cancelRequested = true;
          ac.abort(new Error("CANCELLED"));
        }
      })
      .catch(() => {});
    if (ticks % 5 === 0) {
      db.update(schema.run)
        .set({ heartbeatAt: new Date() })
        .where(leased)
        .catch((e: unknown) => log("heartbeat failed", runId, e instanceof Error ? e.message : e));
    }
  }, 1000);

  const ownsRun = sql`exists (select 1 from ${schema.run} r where r.id = ${runId} and r.locked_by = ${workerId} and r.status = 'running')`;
  const guardedStepUpdate = async (nodeId: string, set: Partial<typeof schema.runStep.$inferInsert>) => {
    const res = await db
      .update(schema.runStep)
      .set(set)
      .where(and(eq(schema.runStep.runId, runId), eq(schema.runStep.nodeId, nodeId), ownsRun))
      .returning({ id: schema.runStep.id });
    if (res.length === 0) throw new LeaseLostError(runId);
  };

  const t0 = Date.now();
  try {
    const result = await executeGraph(graph, run.input, {
      prior,
      fromNodeId: run.rerunFromNodeId ?? undefined,
      reused,
      evaluate: evaluateIsolated,
      handler: createHandler(hctx),
      isCancelled: () => cancelRequested || timedOut || leaseLost,
      signal: ac.signal,
      onStepStart: async (node) => {
        await guardedStepUpdate(node.id, { status: "running", startedAt: new Date(), attempts: sql`${schema.runStep.attempts} + 1` as unknown as number });
        await logEvent(db, { runId, workspaceId: run.workspaceId, type: "step_started", nodeId: node.id });
      },
      onStepDone: async (s: StepResult) => {
        let status = s.status;
        // Cancelled while a non-idempotent request was in flight → its outcome is unknown.
        if (status === "cancelled" && s.error?.code === "CANCELLED_IN_FLIGHT") status = "uncertain";
        if (timedOut && (status === "cancelled" || status === "failed") && !s.error) s.error = { code: "RUN_TIMEOUT", message: "The run exceeded its time budget" };
        const secrets = hctx.secrets;
        await guardedStepUpdate(s.nodeId, {
          status,
          input: redact(s.input ?? null, secrets) as object,
          output: redact(s.output ?? null, secrets) as object,
          // Real values for resume/re-run, encrypted; the redacted columns above are what users see.
          dataEnc: s.output !== undefined || s.input !== undefined ? encryptSecretV2({ input: s.input ?? null, output: s.output ?? null, secrets: [...new Set(secrets)] }, stepDataContext(runId, s.nodeId, run.workspaceId)) : null,
          dataLegacy: false,
          error: s.error ? redact(s.error, secrets) : null,
          skipReason: s.skipReason ?? null,
          meta: s.meta ? (redact(s.meta, secrets) as Record<string, unknown>) : null,
          log: s.log ? redact(s.log, secrets) : null,
          startedAt: s.startedAt ?? null,
          finishedAt: s.finishedAt ?? null,
          durationMs: s.durationMs ?? null,
        });
        const type = status === "succeeded" || status === "reused" ? "step_succeeded" : status === "failed" ? "step_failed" : status === "skipped" ? "step_skipped" : status === "uncertain" ? "step_uncertain" : null;
        if (type) await logEvent(db, { runId, workspaceId: run.workspaceId, type, nodeId: s.nodeId, data: s.error ? { error: redact(s.error, secrets) } : undefined });
      },
    });
    if (leaseLost) throw new LeaseLostError(runId);

    let status: typeof schema.run.$inferSelect.status = result.status;
    let error = result.error ? redact(result.error, hctx.secrets) : null;
    if (timedOut) {
      status = "failed";
      error = { code: "RUN_TIMEOUT", message: `The run exceeded its ${Math.round(SEGMENT_TIMEOUT_MS / 60000)} minute time budget` };
    }
    if (status === "waiting_approval") {
      // Release the lease: a human decision re-queues the run.
      const done = await db.update(schema.run).set({ status: "waiting_approval", lockedBy: null, durationMs: (run.durationMs ?? 0) + (Date.now() - t0) }).where(leased).returning({ id: schema.run.id });
      if (done.length === 0) throw new LeaseLostError(runId);
      return;
    }
    const done = await db
      .update(schema.run)
      .set({ status, output: redact(result.output, hctx.secrets), error, finishedAt: new Date(), durationMs: (run.durationMs ?? 0) + (Date.now() - t0), lockedBy: null })
      .where(leased)
      .returning({ id: schema.run.id });
    if (done.length === 0) throw new LeaseLostError(runId);
    if (status !== "succeeded") {
      await db.update(schema.approval).set({ status: "superseded", note: `Run ${status}` }).where(and(eq(schema.approval.runId, runId), eq(schema.approval.status, "pending")));
      await db
        .update(schema.runStep)
        .set({ status: "cancelled", skipReason: status === "cancelled" ? "Run was cancelled" : "Run ended" })
        .where(and(eq(schema.runStep.runId, runId), inArray(schema.runStep.status, ["pending", "waiting_approval"])));
    }
    await logEvent(db, { runId, workspaceId: run.workspaceId, type: status === "cancelled" ? "cancelled" : "finished", data: { status, code: error?.code } });
    track("run_finished", { workspaceId: run.workspaceId }, { status, code: error?.code ?? null, trigger: run.triggerKind });
  } catch (err) {
    if (err instanceof LeaseLostError) {
      log("lease lost; another worker owns", runId);
      await logEvent(db, { runId, workspaceId: run.workspaceId, type: "lease_lost" }).catch(() => {});
      return;
    }
    log("run failed in worker", runId, err instanceof Error ? err.stack : err);
    await db
      .update(schema.run)
      .set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - t0, error: { code: "WORKER_ERROR", message: "The execution worker hit an internal error. Re-run this flow; if it keeps failing, check the worker logs." }, lockedBy: null })
      .where(leased);
  } finally {
    clearInterval(poll);
    clearTimeout(segmentTimer);
  }
}
