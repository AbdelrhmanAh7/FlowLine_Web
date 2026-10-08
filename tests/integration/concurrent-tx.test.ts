import { randomInt } from "node:crypto";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { ConcurrentTxDeadlockError, ConcurrentTxTimeoutError, runConcurrent } from "../helpers/concurrentTx";

// Two real PostgreSQL connections, locked with transaction-level advisory locks (no tables, nothing to clean up). Keys are
// random per test so nothing else in the database can collide. Deadlock detection costs one `deadlock_timeout` (1 s).
const lock = (client: Client, key: number) => client.query("select pg_advisory_xact_lock($1)", [key]);
const keys = () => [randomInt(1, 2 ** 30), randomInt(1, 2 ** 30)] as const;

describe("runConcurrent", () => {
  it("detects an opposite-order pair as a deadlock", async () => {
    const [k1, k2] = keys();
    const failure = await runConcurrent(
      async ({ client, barrier }) => { await lock(client, k1); await barrier(); await lock(client, k2); return "a"; },
      async ({ client, barrier }) => { await lock(client, k2); await barrier(); await lock(client, k1); return "b"; },
      { timeoutMs: 8_000 },
    ).then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(ConcurrentTxDeadlockError);
    expect((failure as Error).message).toContain("40P01");
    expect((failure as Error).message).toMatch(/transaction [AB]/);
  });

  it("passes a same-order pair and returns both results", async () => {
    const [k1, k2] = keys();
    const order: string[] = [];
    const tx = (name: string) => async ({ client, barrier }: { client: Client; barrier: () => Promise<void> }) => {
      await barrier(); // both transactions are open and about to take their first lock
      await lock(client, k1);
      await lock(client, k2);
      order.push(name);
      return name;
    };
    const result = await runConcurrent(tx("a"), tx("b"), { timeoutMs: 8_000 });
    expect(result).toEqual({ a: "a", b: "b" });
    expect(order).toHaveLength(2);
  });

  it("fails with a timeout error when a transaction hangs on a lock", async () => {
    const [k1] = keys();
    const failure = await runConcurrent(
      async ({ client, barrier }) => { await lock(client, k1); await barrier(); await new Promise<never>(() => undefined); },
      async ({ client, barrier }) => { await barrier(); await lock(client, k1); },
      { timeoutMs: 500 },
    ).then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(ConcurrentTxTimeoutError);
    expect((failure as Error).message).toContain("500 ms");
  });

  it("rethrows a callback error, and the other transaction's barrier fails instead of hanging", async () => {
    const failure = await runConcurrent(
      async () => { throw new Error("boom"); },
      async ({ barrier }) => { await barrier(); },
      { timeoutMs: 8_000 },
    ).then(() => null, (e: unknown) => e);
    expect((failure as Error).message).toBe("boom");
  });
});
