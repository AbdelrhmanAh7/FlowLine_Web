import { Client } from "pg";

/**
 * Two-connection lock-order helpers (same technique as retained-file-locking.test.ts): run a production function on its
 * own PostgreSQL connection, pause it only AFTER a real lock-taking statement has completed, then observe the competitor
 * waiting through `pg_blocking_pids`. No production test hook and no sleep is treated as proof of blocking.
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
 *
 * `query` comes from the backend-status snapshot taken when the probe starts, while `wait_event_type` and
 * `pg_blocking_pids` are read live, so a probe racing the waiter's earlier statements can pair an old statement with
 * the new wait (issue #47: deletion "waiting" at the retained-file counter row it had already locked). Once the wait is
 * seen the waiter cannot move while the observer is paused, so a second probe on a fresh snapshot reads its real text.
 */
export async function blockedByObserver(observer: Client, waiterPid: number, finished: () => boolean) {
  const probe = async () => {
    await observer.query("select pg_stat_clear_snapshot()");
    const { rows } = await observer.query<{ query: string; wait_event_type: string }>(
      "select query, wait_event_type from pg_stat_activity where pid = $1 and pg_backend_pid() = any(pg_blocking_pids(pid))", [waiterPid],
    );
    return rows[0]?.wait_event_type === "Lock" ? rows[0] : undefined;
  };
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (finished()) throw new Error("Competing transaction completed before the lock barrier was released");
    if (await probe()) {
      const settled = await probe();
      if (!settled) throw new Error("Competing transaction stopped waiting while the lock barrier was held");
      return settled;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Competing transaction did not block on the expected connection");
}
