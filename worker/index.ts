/**
 * Flowline execution worker — a separate process from the web app.
 * Picks queued runs from Postgres (LISTEN/NOTIFY + 2s poll fallback),
 * executes them with the shared engine, and persists every step.
 */
import { randomUUID } from "node:crypto";
import { redactString, safeErrorText } from "@/server/redact";
import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "@/db";
import * as schema from "@/db/schema";
import { isBillingConfigured, reconcileUsage } from "@/billing/service";
import { sendEmail } from "@/server/email";
import { deliverPlatformNotifications } from "@/server/platform-audit";
import { RUN_CHANNEL } from "@/server/runs";
import { monthStart } from "@/server/usage";
import { stopSandbox } from "@/engine/sandbox";
import { indexNextSource } from "@/server/knowledge";
import { claimNextAgentRun, processAgentRun, recoverStaleAgentRuns, wakeAgentsForFinishedRuns } from "./agent-runner";
import { claimNextRun, processRun, recoverStaleRuns } from "./runner";
import { schedulerTick } from "./scheduler";
import { pruneOnce } from "@/server/retention";
import { backgroundRefresh } from "@/ai/hub/discovery";

/** Runs executed concurrently by this worker process (runs mostly wait on I/O). */
const CONCURRENCY = Math.max(1, Number(process.env.FLOWLINE_WORKER_CONCURRENCY ?? 4));
const active = new Set<Promise<void>>();

const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 6)}`;
let stopping = false;
let wake: (() => void) | null = null;

// Never die because nobody is reading our logs (closed/ignored stdout).
process.stdout.on("error", () => {});

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), "[worker]", ...args.map((a) => (a instanceof Error ? safeErrorText(a) : typeof a === "string" ? redactString(a) : a)));
}

async function beat() {
  await db
    .insert(schema.workerHeartbeat)
    .values({ workerId })
    .onConflictDoUpdate({ target: schema.workerHeartbeat.workerId, set: { lastSeenAt: new Date() } });
}

/** Daily billing reconciliation: report this period's ledger totals for every workspace with a billing account. */
let lastReconcileDay = "";
async function billingReconcileTick() {
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastReconcileDay) return;
  lastReconcileDay = today;
  if (!(await isBillingConfigured())) return;
  const accounts = await db.select({ workspaceId: schema.billingAccount.workspaceId }).from(schema.billingAccount);
  for (const a of accounts) {
    try {
      const r = await reconcileUsage(a.workspaceId, monthStart());
      if (r.reported.length) log("billing reconcile", a.workspaceId, r.reported.map((m) => `${m.metric}=${m.quantity}`).join(", "));
    } catch (e) {
      log("billing reconcile failed for", a.workspaceId, e instanceof Error ? e.message : e);
    }
  }
}

async function drain() {
  await wakeAgentsForFinishedRuns(db);
  // Agent runs share the same concurrency budget as workflow runs.
  while (!stopping && active.size < CONCURRENCY) {
    const aid = await claimNextAgentRun(db, workerId);
    if (!aid) break;
    log("agent run", aid, "claimed");
    const p = processAgentRun(db, aid, workerId, log)
      .catch((e) => log("agent run", aid, "crashed", e instanceof Error ? e.message : e))
      .finally(() => {
        active.delete(p);
        wake?.();
      });
    active.add(p);
  }
  while (!stopping && active.size < CONCURRENCY) {
    const id = await claimNextRun(db, workerId);
    if (!id) return;
    log("run", id, "claimed");
    const p = processRun(db, id, workerId, log)
      .catch((e) => log("run", id, "crashed", e instanceof Error ? e.message : e))
      .finally(() => {
        active.delete(p);
        log("run", id, "done");
        wake?.();
      });
    active.add(p);
  }
}

/** Knowledge indexing: one source at a time so large PDFs never starve workflow runs. */
let indexing = false;
function drainKnowledge() {
  if (indexing || stopping) return;
  indexing = true;
  void (async () => {
    try {
      while (!stopping && (await indexNextSource(db, workerId))) log("knowledge source indexed");
    } catch (e) {
      log("indexing error", e instanceof Error ? e.message : e);
    } finally {
      indexing = false;
    }
  })();
}

async function main() {
  log("starting", workerId);
  await beat();
  const recovered = await recoverStaleRuns(db);
  if (recovered) log("recovered", recovered, "stale runs");

  const listener = new Client({ connectionString: process.env.DATABASE_URL });
  listener.on("error", (err) => log("listener error", err.message));
  await listener.connect();
  await listener.query(`LISTEN ${RUN_CHANNEL}`);
  listener.on("notification", () => wake?.());

  const beatTimer = setInterval(() => void beat().catch((e) => log("heartbeat failed", e.message)), 5000);
  const staleTimer = setInterval(() => void Promise.all([recoverStaleRuns(db), recoverStaleAgentRuns(db)]).catch(() => {}), 30000);
  const scheduleTimer = setInterval(() => void schedulerTick(db).then((n) => n && log("scheduler fired", n)).catch((e) => log("scheduler error", e.message)), 10000);
  const reconcileTimer = setInterval(() => void billingReconcileTick().catch((e) => log("billing reconcile error", e instanceof Error ? e.message : e)), 3600_000);
  const retentionTick = () =>
    void pruneOnce(db)
      .then((r) => r && Object.values(r).some((n) => n > 0) && log("retention pruned", JSON.stringify(r)))
      .catch((e) => log("retention error", e instanceof Error ? e.message : e));
  const retentionTimer = setInterval(retentionTick, 3600_000);
  // AI model catalogues: bounded background refresh (at most 5 connections per hour, each at most once a day).
  // Platform security notifications (metadata only) to the other admins, with retries/backoff.
  const notifyTimer = setInterval(
    () =>
      void deliverPlatformNotifications(db, async (to, subject, text, id) => {
        const html = `<pre style="font-family:monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`;
        await sendEmail({ to, subject, text, html, tags: { purpose: "platform_security" }, idempotencyKey: `platform-notice:${id}` });
      })
        .then((n) => n && log("platform notifications sent", n))
        .catch((e) => log("platform notification error", e instanceof Error ? e.message : e)),
    60_000,
  );
  const catalogueTimer = setInterval(
    () => void backgroundRefresh(db, { max: 5 }).then((r) => r.checked && log("ai catalogues refreshed", r.refreshed, "of", r.checked)).catch((e) => log("ai catalogue refresh error", e instanceof Error ? e.message : e)),
    3600_000,
  );

  while (!stopping) {
    try {
      drainKnowledge();
      await drain();
    } catch (err) {
      log("drain error", err instanceof Error ? err.message : err);
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 2000);
      wake = () => {
        clearTimeout(t);
        resolve();
      };
    });
    wake = null;
  }

  clearInterval(beatTimer);
  clearInterval(staleTimer);
  clearInterval(scheduleTimer);
  clearInterval(reconcileTimer);
  clearInterval(retentionTimer);
  clearInterval(catalogueTimer);
  clearInterval(notifyTimer);
  await Promise.allSettled([...active]);
  await db.execute(sql`delete from worker_heartbeat where worker_id = ${workerId}`);
  stopSandbox();
  await listener.end();
  await pool.end();
  log("stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    wake?.();
  });
}

main().catch((err) => {
  console.error(safeErrorText(err));
  process.exit(1);
});
