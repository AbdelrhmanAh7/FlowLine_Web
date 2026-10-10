import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { runConcurrentPg, type PgTxContext } from "../helpers/concurrentPgTx";

// Two real PostgreSQL connections locked with transaction-level advisory locks (no tables, nothing to clean up). The
// two-key form (90, n) lives in its own lock space, apart from the single-bigint locks the app takes, and each test uses
// its own fixed keys. Deadlock detection costs one `deadlock_timeout` (1 s by default).
const lock = (client: Client, key: number) => client.query("select pg_advisory_xact_lock(90, $1)", [key]);

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as Error,
  );

describe("runConcurrentPg", () => {
  it("detects an opposite-order pair as a deadlock (40P01)", async () => {
    const failure = await fail(
      runConcurrentPg(
        async ({ client, arrive }) => { await lock(client, 1); await arrive(); await lock(client, 2); return "a"; },
        async ({ client, arrive }) => { await lock(client, 2); await arrive(); await lock(client, 1); return "b"; },
        { timeoutMs: 8_000 },
      ),
    );
    expect(failure?.message).toMatch(/^deadlock detected \(40P01\)/);
  });

  it("passes a same-order pair on two connections and returns both results", async () => {
    const pids = new Set<number>();
    const tx = (name: string) => async ({ client, arrive }: PgTxContext) => {
      await arrive(); // both transactions are open and about to take their first lock
      const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
      pids.add(rows[0].pid);
      await lock(client, 3);
      await lock(client, 4);
      return name;
    };
    await expect(runConcurrentPg(tx("a"), tx("b"), { timeoutMs: 8_000 })).resolves.toEqual(["a", "b"]);
    expect(pids.size).toBe(2);
  });

  it("fails with a timeout when a transaction hangs, and frees the lock it held", async () => {
    const failure = await fail(
      runConcurrentPg(
        async ({ client, arrive }) => { await lock(client, 5); await arrive(); await new Promise<never>(() => undefined); },
        async ({ client, arrive }) => { await arrive(); await lock(client, 5); },
        { timeoutMs: 500 },
      ),
    );
    expect(failure?.message).toBe("runConcurrent timed out after 500ms");
    // The hung backend was terminated, so key 5 is free again at once.
    await expect(runConcurrentPg(async ({ client }) => lock(client, 5).then(() => "free"), async () => "ok", { timeoutMs: 2_000 })).resolves.toEqual(["free", "ok"]);
  });

  it("rethrows a callback error without waiting for the other transaction", async () => {
    const failure = await fail(
      runConcurrentPg(
        async () => { throw new Error("boom"); },
        async ({ arrive }) => { await arrive(); },
        { timeoutMs: 8_000 },
      ),
    );
    expect(failure?.message).toBe("boom");
  });

  it("fails clearly without a connection string", async () => {
    await expect(runConcurrentPg(async () => 1, async () => 2, { connectionString: "" })).rejects.toThrow(/DATABASE_URL is not set/);
  });
});
