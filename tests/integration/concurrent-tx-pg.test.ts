import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runConcurrentPg } from "./concurrentTx.pg";
import { connect } from "./pg-lock-helpers";

// Issue #116: runConcurrent against real PostgreSQL. Two scratch tables (unique per run, dropped in afterAll) each hold
// one row; a side "locks" a table by taking that row FOR UPDATE on its own connection.
const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const T1 = `scratch_cc1_${suffix}`;
const T2 = `scratch_cc2_${suffix}`;
const lock = (c: Client, table: string) => c.query(`select id from ${table} where id = 1 for update`);

let admin: Client;
beforeAll(async () => {
  admin = await connect();
  for (const t of [T1, T2]) await admin.query(`create table ${t} (id int primary key); insert into ${t} values (1)`);
});
afterAll(async () => {
  await admin?.query(`drop table if exists ${T1}, ${T2}`);
  await admin?.end();
});

describe("runConcurrentPg (two real connections)", () => {
  it("reports an opposite-order lock pair as a deadlock (40P01)", async () => {
    // Each side takes its first lock, then waits at the barrier until the other holds its own: the cycle is certain.
    const outcome = await runConcurrentPg(
      async (c, ctx) => { await lock(c, T1); await ctx.arrive(); await lock(c, T2); return "a"; },
      async (c, ctx) => { await lock(c, T2); await ctx.arrive(); await lock(c, T1); return "b"; },
      { timeoutMs: 8_000 },
    ).then((value) => ({ value }), (error: Error) => ({ error }));
    expect(outcome).toHaveProperty("error");
    expect((outcome as { error: Error }).error.message).toMatch(/deadlock detected \(40P01\)/);
  }, 10_000);

  it("lets a same-order lock pair finish", async () => {
    // Both start together and lock T1 then T2: one waits for the other's commit, no cycle.
    const result = await runConcurrentPg(
      async (c, ctx) => { await ctx.arrive(); await lock(c, T1); await lock(c, T2); return "a"; },
      async (c, ctx) => { await ctx.arrive(); await lock(c, T1); await lock(c, T2); return "b"; },
      { timeoutMs: 8_000 },
    );
    expect(result).toEqual(["a", "b"]);
  }, 10_000);

  it("leaves no scratch-table lock behind", async () => {
    const { rows } = await admin.query(`select id from ${T1} where id = 1 for update nowait`);
    expect(rows).toEqual([{ id: 1 }]);
  });
});
