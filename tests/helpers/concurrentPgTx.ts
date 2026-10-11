import { Client } from "pg";
import { runConcurrent, type TxContext } from "./concurrentTx";

/**
 * Test-only helper for lock-order regression tests (#41, #42, #45, #47): runs two transactions at the same time, each on
 * its own PostgreSQL connection, on top of the DB-free `runConcurrent` core (barrier, 40P01 mapping, timeout).
 *
 * Each callback gets its open transaction (`client`) and `arrive()`, the two-party barrier: it resolves once BOTH
 * transactions have called it. Call it right after the first lock so both hold their first lock before either asks
 * for its second one (the interleaving that deadlocks an inconsistent lock order). The helper issues BEGIN before the
 * callback and COMMIT after it (ROLLBACK on error).
 *
 *   const lock = (c: Client, k: number) => c.query("select pg_advisory_xact_lock(90, $1)", [k]);
 *   await runConcurrentPg(
 *     async ({ client, arrive }) => { await lock(client, 1); await arrive(); await lock(client, 2); return "a"; },
 *     async ({ client, arrive }) => { await lock(client, 2); await arrive(); await lock(client, 1); return "b"; },
 *     { timeoutMs: 5_000 },
 *   ); // opposite order: rejects with "deadlock detected (40P01): ..."; with B taking 1 then 2 it resolves ["a", "b"]
 *
 * For a same-order pair call `arrive()` BEFORE the first lock: after it, the second transaction really waits for the
 * first one, so it could never reach the barrier and the run would time out.
 *
 * Rejects with "runConcurrent timed out after <n>ms" when the pair (connecting included) outlives `timeoutMs`. On any
 * failure both backends are ended with pg_terminate_backend from a third connection, so a hung lock wait never outlives
 * the test; that cleanup adds at most CLEANUP_GRACE_MS to the rejection.
 */
export type PgTxContext = TxContext & { client: Client };
export type PgTxFn<T> = (tx: PgTxContext) => Promise<T>;
export interface RunConcurrentPgOptions {
  /** Limit for connecting and running both transactions (default 5000 ms). */
  timeoutMs?: number;
  connectionString?: string;
}

export const CLEANUP_GRACE_MS = 1_000;

type Conn = { client: Client; pid: number };

/** Resolves when `p` settles or after `ms`, whichever is first; never rejects. */
function bounded(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    p.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function open(connectionString: string, timeoutMs: number): Promise<Conn> {
  const client = new Client({ connectionString, connectionTimeoutMillis: timeoutMs });
  // A backend ended by pg_terminate_backend makes pg emit 'error'; unheard, Vitest reports it as an unhandled error.
  client.on("error", () => undefined);
  try {
    await client.connect();
    const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    return { client, pid: rows[0].pid };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
}

const endAll = (conns: Conn[]) => bounded(Promise.allSettled(conns.map((c) => c.client.end())), CLEANUP_GRACE_MS);

async function terminate(connectionString: string, pids: number[]): Promise<void> {
  const killer = new Client({ connectionString, connectionTimeoutMillis: CLEANUP_GRACE_MS });
  killer.on("error", () => undefined);
  try {
    await killer.connect();
    await killer.query("select pg_terminate_backend(pid) from unnest($1::int[]) as pid", [pids]);
  } finally {
    await killer.end().catch(() => undefined);
  }
}

async function inTransaction<T>(client: Client, ctx: TxContext, tx: PgTxFn<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await tx({ ...ctx, client });
    await client.query("commit");
    return result;
  } catch (error) {
    // Not awaited: the core reports this error at once; the backend is terminated anyway.
    void client.query("rollback").catch(() => undefined);
    throw error;
  }
}

export async function runConcurrentPg<A, B>(
  txA: PgTxFn<A>,
  txB: PgTxFn<B>,
  { timeoutMs = 5_000, connectionString = process.env.DATABASE_URL }: RunConcurrentPgOptions = {},
): Promise<[A, B]> {
  if (!connectionString) throw new Error("runConcurrentPg needs a connection string (DATABASE_URL is not set)");
  const deadline = Date.now() + timeoutMs;

  const opening = Promise.allSettled([open(connectionString, timeoutMs), open(connectionString, timeoutMs)]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => resolve("expired"), timeoutMs);
  });
  const opened = await Promise.race([opening, expired]).finally(() => clearTimeout(timer));
  if (opened === "expired") {
    // Close whatever finishes connecting later.
    void opening.then((rs) => endAll(rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))));
    throw new Error(`runConcurrent timed out after ${timeoutMs}ms (opening connections)`);
  }
  const conns = opened.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failed = opened.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    await endAll(conns);
    throw failed.reason;
  }

  const [a, b] = conns;
  try {
    return await runConcurrent(
      (ctx) => inTransaction(a.client, ctx, txA),
      (ctx) => inTransaction(b.client, ctx, txB),
      { timeoutMs: Math.max(1, deadline - Date.now()) },
    );
  } catch (error) {
    await bounded(terminate(connectionString, [a.pid, b.pid]), CLEANUP_GRACE_MS);
    // The core got only the time left after connecting; report the limit the caller asked for.
    if (error instanceof Error && error.message.startsWith("runConcurrent timed out after ")) {
      throw new Error(`runConcurrent timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    await endAll(conns);
  }
}
