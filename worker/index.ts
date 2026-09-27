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
import { RUN_CHANNEL } from "@/server/runs";
import { stopSandbox } from "@/engine/sandbox";
import { claimNextRun, processRun, recoverStaleRuns } from "./runner";
import { schedulerTick } from "./scheduler";

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

async function drain() {
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
  const staleTimer = setInterval(() => void recoverStaleRuns(db).catch(() => {}), 30000);
  const scheduleTimer = setInterval(() => void schedulerTick(db).then((n) => n && log("scheduler fired", n)).catch((e) => log("scheduler error", e.message)), 10000);

  while (!stopping) {
    try {
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
