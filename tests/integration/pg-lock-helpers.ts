import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "pg";
import { vi } from "vitest";
import { db } from "@/db";

/**
 * Two-connection lock-order helpers (same technique as retained-file-locking.test.ts): run a production function on its
 * own PostgreSQL connection, pause it only AFTER a real lock-taking statement has completed, then observe the competitor
 * waiting through `pg_blocking_pids`. No production test hook and no sleep is treated as proof of blocking.
 *
 * Authored for #108 (and used in #109 / federated lock-order tests): exports `routeTransactions`, `connect`,
 * `pauseAfter`, and `blockedByObserver` to test two concurrent production functions across separate PostgreSQL connections.
 */

/** A dedicated connection with bounded waits, so a stuck lock fails the test instead of hanging it. */
export async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  await client.connect();
  return client;
}

export function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** Pause only AFTER the real lock-taking SQL finishes (the lock is held while paused). */
export function pauseAfter(client: Client, pattern: RegExp) {
  const reached = barrier();
  const resume = barrier();
  const original = client.query;
  let paused = false;
  client.query = new Proxy(original, {
    apply(target, receiver, args) {
      const result = Reflect.apply(target, receiver, args);
      const text = typeof args[0] === "string" ? args[0] : args[0].text;
      if (!paused && pattern.test(text)) {
        paused = true;
        return Promise.resolve(result).then(async (rows) => {
          reached.release();
          await resume.promise;
          return rows;
        });
      }
      return result;
    },
  });
  return { reached: reached.promise, resume: resume.release, restore: () => { client.query = original; } };
}

/**
 * Observe an actual PostgreSQL wait, not elapsed time as evidence of blocking. `observer` must be the connection that
 * holds the lock (it is paused between statements, so it can still run this probe): the waiter has to be blocked BY it.
 * Returns the waiter's current statement text.
 */
export async function blockedByObserver(observer: Client, waiterPid: number, finished: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (finished()) throw new Error("Competing transaction completed before the lock barrier was released");
    // pg_blocking_pids is live; pg_stat_activity.query is not (it comes from a backend-status snapshot that can still
    // show the waiter's previous statement), so wait on the former and read the statement only once the wait is seen.
    // The observer holds the lock while paused, so the waiter stays at this statement.
    const { rows: [probe] } = await observer.query<{ blocked: boolean }>("select pg_backend_pid() = any(pg_blocking_pids($1)) as blocked", [waiterPid]);
    if (probe!.blocked) {
      await observer.query("select pg_stat_clear_snapshot()");
      return (await observer.query<{ query: string }>("select query from pg_stat_activity where pid = $1", [waiterPid])).rows[0]!;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Competing transaction did not block on the expected connection");
}

type TransactionRunner = Pick<typeof db, "transaction">;

/** Routes every `db.transaction` made inside `run(target, fn)` to that connection (and only those), so two production
 * functions can run at once, each on its own PostgreSQL connection, without a test hook in production code.
 * Exported for #108 (`account-delete-sso-lock-order.test.ts`) and reused by #37 (`federated-lock-order.test.ts`). */
export function routeTransactions() {
  const route = new AsyncLocalStorage<TransactionRunner>();
  const original = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementation(((callback: never, config?: never) => {
    const target = route.getStore();
    return target ? target.transaction(callback, config) : original(callback, config);
  }) as never);
  return { run: <T>(target: TransactionRunner, work: () => Promise<T>) => route.run(target, work), restore: () => spy.mockRestore() };
}
