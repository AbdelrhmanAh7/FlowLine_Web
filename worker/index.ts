/**
 * Flowline execution worker — a separate process from the web app.
 * Picks queued runs from Postgres (LISTEN/NOTIFY + 2s poll fallback),
 * executes them with the shared engine, and persists every step.
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "@/db";
import * as schema from "@/db/schema";
import { RUN_CHANNEL } from "@/server/runs";
import { stopSandbox } from "@/engine/sandbox";
import { claimNextRun, processRun, recoverStaleRuns } from "./runner";

const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 6)}`;
let stopping = false;
let wake: (() => void) | null = null;

// Never die because nobody is reading our logs (closed/ignored stdout).
process.stdout.on("error", () => {});

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), "[worker]", ...args);
}

async function beat() {
  await db
    .insert(schema.workerHeartbeat)
    .values({ workerId })
    .onConflictDoUpdate({ target: schema.workerHeartbeat.workerId, set: { lastSeenAt: new Date() } });
}

async function drain() {
  for (;;) {
    if (stopping) return;
    const id = await claimNextRun(db, workerId);
    if (!id) return;
    log("run", id, "claimed");
    await processRun(db, id, workerId, log);
    log("run", id, "done");
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
  console.error(err);
  process.exit(1);
});
