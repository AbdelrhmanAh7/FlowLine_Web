import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { db, pool, schema } from "@/db";
import type { Role } from "@/db/schema";
import type { CurrentUser } from "@/server/access";
import { HttpError } from "@/server/http";
import { claimNextRun, processRun } from "../../worker/runner";

/** Short unique suffix so tests never depend on an empty DB. */
export function unique(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Inserts a user row directly (no better-auth HTTP) and returns a CurrentUser. */
export async function makeUser(prefix = "user"): Promise<CurrentUser> {
  const id = randomUUID();
  const email = `${prefix}-${randomUUID()}@flowline-test.local`;
  const name = unique(`Test ${prefix}`);
  await db.insert(schema.user).values({ id, email, name });
  return { id, email, name };
}

export async function addMember(workspaceId: string, userId: string, role: Role) {
  await db.insert(schema.workspaceMember).values({ workspaceId, userId, role });
}

/** Asserts the promise rejects with an HttpError of the given status/code and returns it. */
export async function expectHttpError(promise: Promise<unknown>, status: number, code?: string): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    const e = err as HttpError;
    expect(e.status).toBe(status);
    if (code !== undefined) expect(e.code).toBe(code);
    return e;
  }
  throw new Error(`Expected HttpError ${status}${code ? ` ${code}` : ""}, but the promise resolved`);
}

const NULL_CLAIM_RETRIES = 5;
const NULL_CLAIM_WAIT_MS = 100;

/**
 * Why a queued `run` / `agent_run` row could not be claimed (INTERMITTENT-01): its state, whether its row is locked
 * right now (FOR UPDATE NOWAIT probe — a claim uses SKIP LOCKED, so a locked row yields a null claim), for a run the
 * workspace's running count vs. its concurrency limit, what was claimed instead, and every other session of this
 * database that is inside a transaction or waiting on a lock (with its locks, blockers and query).
 */
export async function claimDiagnostics(table: "run" | "agent_run", id: string, claimed: string[]) {
  const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
  const [target] = await q(`select id, status, locked_by, heartbeat_at, created_at, workspace_id from ${table} where id = $1`, [id]);
  let rowLock = "not locked";
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select id from ${table} where id = $1 for update nowait`, [id]);
  } catch (e) {
    rowLock = `LOCKED by another transaction (${(e as { code?: string }).code ?? "?"})`;
  } finally {
    await c.query("rollback");
    c.release();
  }
  const concurrency =
    table === "run" && target
      ? (await q(`select w.max_concurrent_runs as max, (select count(*)::int from run x where x.workspace_id = w.id and x.status = 'running') as running from workspace w where w.id = $1`, [target.workspace_id]))[0]
      : undefined;
  const queuedBefore = target ? (await q(`select count(*)::int as n from ${table} where status = 'queued' and created_at < $1`, [target.created_at]))[0] : undefined;
  const sessions = await q(
    `select a.pid, a.state, a.xact_start, a.wait_event_type, a.wait_event, left(a.query, 300) as query,
            (select array_agg(distinct l.locktype || ':' || l.mode || case when l.granted then '' else '(waiting)' end) from pg_locks l where l.pid = a.pid) as locks,
            pg_blocking_pids(a.pid) as blocked_by
       from pg_stat_activity a
      where a.datname = current_database() and a.pid <> pg_backend_pid() and (a.xact_start is not null or a.wait_event_type = 'Lock')`,
  );
  return JSON.stringify({ table, target, rowLock, concurrency, queuedBefore, claimed, sessions }, null, 1);
}

/**
 * Claims with the worker's own claim function until `targetId` is claimed, processing everything claimed on the way
 * (stray queued rows of earlier tests are drained oldest first, as a worker would). A null claim while the target is
 * still queued is retried a few times after a short wait (a claim skips rows another transaction holds at that
 * moment); if the target stays unclaimable, it throws with diagnostics instead of silently leaving it queued.
 * Returns true once the target was claimed and processed; false when the claim came back empty because the target
 * isn't queued (nothing to claim).
 */
export async function claimUntil(opts: {
  table: "run" | "agent_run";
  targetId: string;
  claim: (workerId: string) => Promise<string | null>;
  process: (id: string, workerId: string) => Promise<unknown>;
  workerId?: () => string;
  maxClaims?: number;
}): Promise<boolean> {
  const max = opts.maxClaims ?? 50;
  const claimed: string[] = [];
  const status = async () => (await pool.query(`select status from ${opts.table} where id = $1`, [opts.targetId])).rows[0]?.status as string | undefined;
  let nullClaims = 0;
  while (claimed.length < max) {
    const w = opts.workerId?.() ?? unique("worker");
    const id = await opts.claim(w);
    if (!id) {
      if ((await status()) !== "queued") return false;
      if (++nullClaims > NULL_CLAIM_RETRIES) {
        throw new Error(`Could not claim queued ${opts.table} ${opts.targetId} (${NULL_CLAIM_RETRIES} retries): ${await claimDiagnostics(opts.table, opts.targetId, claimed)}`);
      }
      await new Promise((r) => setTimeout(r, NULL_CLAIM_WAIT_MS));
      continue;
    }
    claimed.push(id);
    await opts.process(id, w);
    if (id === opts.targetId) return true;
  }
  throw new Error(`Never claimed ${opts.table} ${opts.targetId} within ${max} claims: ${await claimDiagnostics(opts.table, opts.targetId, claimed)}`);
}

/**
 * Claims runs until `runId` is claimed, processing everything claimed along the
 * way, then processes the target. Stray queued runs left by earlier tests are
 * drained harmlessly, so tests stay independent of execution order.
 */
export async function claimAndProcess(runId: string, workerId = unique("worker")) {
  const done = await claimUntil({ table: "run", targetId: runId, claim: (w) => claimNextRun(db, w), process: (id, w) => processRun(db, id, w), workerId: () => workerId, maxClaims: 25 });
  if (!done) throw new Error(`No queued run available; expected to claim ${runId}: ${await claimDiagnostics("run", runId, [])}`);
}

/** Re-reads a run row fresh from the DB (proves persistence, not return values). */
export async function freshRun(runId: string) {
  const [run] = await db.select().from(schema.run).where(eq(schema.run.id, runId));
  if (!run) throw new Error(`Run ${runId} not found in DB`);
  return run;
}

export async function closeDb() {
  await pool.end();
}
