import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runConcurrentPg } from "../helpers/concurrentPgTx";
import { connect } from "./pg-lock-helpers";

// Issue #116: the Postgres adapter (`runConcurrentPg`, #90) with row locks on real tables, next to the advisory-lock
// cases in concurrent-tx.test.ts. Two scratch tables (unique per run, dropped in afterAll) each hold one row; a side
// "locks" a table by taking that row FOR UPDATE on its own connection.
const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const T1 = `scratch_cc1_${suffix}`;
const T2 = `scratch_cc2_${suffix}`;
const lock = (c: Client, table: string) => c.query(`select id from ${table} where id = 1 for update`);

let admin: Client;
let since: Date; // server time before this file opened any adapter connection
beforeAll(async () => {
  admin = await connect();
  since = (await admin.query<{ now: Date }>("select now()")).rows[0].now;
  for (const t of [T1, T2]) await admin.query(`create table ${t} (id int primary key); insert into ${t} values (1)`);
});
afterAll(async () => {
  await admin?.query(`drop table if exists ${T1}, ${T2}`);
  await admin?.end();
});

describe("runConcurrentPg on scratch tables (two real connections)", () => {
  it("reports an opposite-order lock pair as a deadlock (40P01)", async () => {
    // Each side takes its first lock, then waits at the barrier until the other holds its own: the cycle is certain.
    const outcome = await runConcurrentPg(
      async ({ client, arrive }) => { await lock(client, T1); await arrive(); await lock(client, T2); return "a"; },
      async ({ client, arrive }) => { await lock(client, T2); await arrive(); await lock(client, T1); return "b"; },
      { timeoutMs: 8_000 },
    ).then((value) => ({ value }), (error: Error) => ({ error }));
    expect(outcome).toHaveProperty("error");
    expect((outcome as { error: Error }).error.message).toMatch(/^deadlock detected \(40P01\)/);
  }, 10_000);

  it("lets a same-order lock pair finish", async () => {
    // Both start together and lock T1 then T2: one waits for the other's commit, no cycle.
    const result = await runConcurrentPg(
      async ({ client, arrive }) => { await arrive(); await lock(client, T1); await lock(client, T2); return "a"; },
      async ({ client, arrive }) => { await arrive(); await lock(client, T1); await lock(client, T2); return "b"; },
      { timeoutMs: 8_000 },
    );
    expect(result).toEqual(["a", "b"]);
  }, 10_000);

  it("rejects at once with an error thrown before the barrier, while the other side waits there holding a lock", async () => {
    // A fails before arrive(); B holds T2 and is parked at arrive() for good. Teardown must not wait on B.
    const started = Date.now();
    const outcome = await runConcurrentPg(
      async ({ client }) => { await lock(client, T1); throw new Error("side A failed before arrive"); },
      async ({ client, arrive }) => { await lock(client, T2); await arrive(); return "b"; },
      { timeoutMs: 8_000 },
    ).then((value) => ({ value }), (error: Error) => ({ error }));
    expect((outcome as { error?: Error }).error?.message).toBe("side A failed before arrive");
    expect(Date.now() - started).toBeLessThan(5_000); // well under timeoutMs: it did not wait for B or the timeout
  }, 10_000);

  // Order-dependent on purpose: runs last in this file and checks what the three cases above left behind.
  it("leaves no scratch-table lock or open transaction behind", async () => {
    for (const t of [T1, T2]) {
      const { rows } = await admin.query(`select id from ${t} where id = 1 for update nowait`);
      expect(rows).toEqual([{ id: 1 }]);
    }
    // Every adapter backend this file opened is gone (terminated or ended): none is left idle in a transaction.
    const idleInTx = async () => (await admin.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity where datname = current_database()
         and backend_start >= $1 and state like 'idle in transaction%' and pid <> pg_backend_pid()`,
      [since],
    )).rows[0].n;
    await expect.poll(idleInTx, { timeout: 3_000 }).toBe(0);
  });
});
