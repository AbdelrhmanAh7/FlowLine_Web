import { Client } from "pg";

/**
 * Test-only helper for lock-order regression tests: runs two transactions at the same time, each on its own PostgreSQL
 * connection, and fails clearly if they deadlock (40P01) or hang.
 *
 * Each callback receives its open transaction (`client`) and `barrier()`. `barrier()` resolves once BOTH transactions have
 * called it the same number of times, so place it right after the first lock statement to make sure both transactions
 * hold their first lock before either asks for its second one (the interleaving that deadlocks an inconsistent lock order).
 * The helper issues BEGIN before calling the callbacks and COMMIT (or ROLLBACK on error) after them.
 *
 *   const { a, b } = await runConcurrent(
 *     async ({ client, barrier }) => { await client.query("select pg_advisory_xact_lock($1)", [1]); await barrier(); await client.query("select pg_advisory_xact_lock($1)", [2]); return "a"; },
 *     async ({ client, barrier }) => { await client.query("select pg_advisory_xact_lock($1)", [2]); await barrier(); await client.query("select pg_advisory_xact_lock($1)", [1]); return "b"; },
 *     { timeoutMs: 5_000 },
 *   ); // opposite order: rejects with ConcurrentTxDeadlockError; swap B's two locks (same order) and it resolves { a: "a", b: "b" }
 *
 * Do not put a barrier after a lock the other transaction also waits on in the same order: that is a real wait, not a
 * deadlock, and the barrier would time out. For same-order pairs call `barrier()` before the first lock instead.
 */
export interface ConcurrentTx {
  client: Client;
  /** Waits until the other transaction has reached its matching barrier call. Rejects if the other one ended first. */
  barrier(): Promise<void>;
}
export type TxCallback<T> = (tx: ConcurrentTx) => Promise<T>;
export interface RunConcurrentOptions {
  /** Whole-run limit (default 5000 ms); also bounds every barrier wait. */
  timeoutMs?: number;
  connectionString?: string;
}

export class ConcurrentTxDeadlockError extends Error {
  constructor(public readonly which: "A" | "B", cause: unknown) {
    super(`Deadlock detected (Postgres 40P01) in transaction ${which}: ${(cause as Error).message}`, { cause });
    this.name = "ConcurrentTxDeadlockError";
  }
}

export class ConcurrentTxTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Concurrent transactions did not finish within ${timeoutMs} ms (hung on a lock or a barrier that was never reached)`);
    this.name = "ConcurrentTxTimeoutError";
  }
}

const SIDES = ["A", "B"] as const;
type Side = (typeof SIDES)[number];

async function openClient(connectionString: string) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  // Terminated/idle backends make pg emit 'error'; without a listener Vitest reports an unhandled error.
  client.on("error", () => undefined);
  await client.connect();
  const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  return { client, pid: rows[0].pid };
}

/** Best effort: end the backends from a third connection so a hung lock wait cannot outlive the test. */
async function terminateBackends(connectionString: string, pids: number[]) {
  const killer = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  killer.on("error", () => undefined);
  try {
    await killer.connect();
    await killer.query("select pg_terminate_backend(pid) from unnest($1::int[]) as pid", [pids]);
  } catch {
    // The connections are destroyed below either way.
  } finally {
    await killer.end().catch(() => undefined);
  }
}

export async function runConcurrent<A, B>(
  txA: TxCallback<A>,
  txB: TxCallback<B>,
  { timeoutMs = 5_000, connectionString = process.env.DATABASE_URL }: RunConcurrentOptions = {},
): Promise<{ a: A; b: B }> {
  if (!connectionString) throw new Error("runConcurrent needs a connection string (DATABASE_URL is not set)");
  const opened = await Promise.allSettled([openClient(connectionString), openClient(connectionString)]);
  const connections = opened.flatMap((o) => (o.status === "fulfilled" ? [o.value] : []));
  const release = () => Promise.allSettled(connections.map((c) => c.client.end()));
  const failed = opened.find((o) => o.status === "rejected");
  if (failed) {
    await release();
    throw (failed as PromiseRejectedResult).reason;
  }

  const arrivals: Record<Side, number> = { A: 0, B: 0 };
  const ended: Record<Side, boolean> = { A: false, B: false };
  const waiting: Record<Side, { n: number; resolve: () => void; reject: (e: Error) => void }[]> = { A: [], B: [] };
  const other = (side: Side): Side => (side === "A" ? "B" : "A");
  const endedEarly = () => new Error("The other transaction ended before reaching the barrier");

  const barrierFor = (side: Side) => () => {
    const n = ++arrivals[side];
    const peer = other(side);
    if (arrivals[peer] >= n) {
      waiting[peer].filter((w) => w.n <= n).forEach((w) => w.resolve());
      waiting[peer] = waiting[peer].filter((w) => w.n > n);
      return Promise.resolve();
    }
    if (ended[peer]) return Promise.reject(endedEarly());
    return new Promise<void>((resolve, reject) => waiting[side].push({ n, resolve, reject }));
  };

  const runSide = async <T>(side: Side, tx: TxCallback<T>, client: Client): Promise<T> => {
    try {
      await client.query("begin");
      const result = await tx({ client, barrier: barrierFor(side) });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      ended[side] = true;
      waiting[other(side)].forEach((w) => w.reject(endedEarly()));
      waiting[other(side)] = [];
    }
  };

  let timer: NodeJS.Timeout | undefined;
  try {
    const timedOut = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ConcurrentTxTimeoutError(timeoutMs)), timeoutMs); });
    const settled = Promise.allSettled([runSide("A", txA, connections[0].client), runSide("B", txB, connections[1].client)]);
    const [ra, rb] = await Promise.race([settled, timedOut]);
    for (const [side, r] of [["A", ra], ["B", rb]] as const) {
      if (r.status === "rejected" && (r.reason as { code?: string })?.code === "40P01") throw new ConcurrentTxDeadlockError(side, r.reason);
    }
    if (ra.status === "rejected") throw ra.reason;
    if (rb.status === "rejected") throw rb.reason;
    return { a: ra.value as A, b: rb.value as B };
  } catch (error) {
    if (error instanceof ConcurrentTxTimeoutError) await terminateBackends(connectionString, connections.map((c) => c.pid));
    throw error;
  } finally {
    clearTimeout(timer);
    await release();
  }
}
