import { beforeEach, describe, expect, it, vi } from "vitest";

// DB-free checks for the three review findings on PR #125 (issue #192): `pg` is replaced by a scripted fake, so a leaked
// connection, a connect that never finishes or a wait on the other callback shows up without PostgreSQL. The same
// helper on real connections is covered by tests/integration/concurrent-tx.test.ts.

type Step = "ok" | "hang" | Error;
type Script = { connect: Step; pid: Step };

const fx = vi.hoisted(() => ({
  scripts: [] as Script[],
  clients: [] as Array<{ ended: boolean; queries: Array<{ sql: string; params?: unknown[] }>; finishConnect?: () => void }>,
}));

vi.mock("pg", () => {
  const settle = (step: Step, value: unknown, onHang?: (resolve: () => void) => void) =>
    step === "ok" ? Promise.resolve(value) : step === "hang" ? new Promise((resolve) => onHang?.(() => resolve(value))) : Promise.reject(step);
  class Client {
    private readonly script: Script;
    private readonly state: (typeof fx.clients)[number];
    private readonly pid: number;
    constructor() {
      this.pid = 1000 + fx.clients.length;
      this.script = fx.scripts.shift() ?? { connect: "ok", pid: "ok" };
      this.state = { ended: false, queries: [] };
      fx.clients.push(this.state);
    }
    on() { return this; }
    connect() { return settle(this.script.connect, undefined, (finish) => { this.state.finishConnect = finish; }); }
    query(sql: string, params?: unknown[]) {
      this.state.queries.push({ sql, params });
      if (sql.includes("pg_backend_pid")) return settle(this.script.pid, { rows: [{ pid: this.pid }] });
      return Promise.resolve({ rows: [] });
    }
    end() { this.state.ended = true; return Promise.resolve(); }
  }
  return { Client };
});

import { runConcurrentPg } from "../helpers/concurrentPgTx";

const url = "postgres://fake/flowline_test";
const never = () => new Promise<never>(() => {});

beforeEach(() => {
  fx.scripts.length = 0;
  fx.clients.length = 0;
});

describe("runConcurrentPg (mocked pg, review findings of PR #125)", () => {
  it("ends a client whose pg_backend_pid() query fails after connect(), and the other connection too", async () => {
    const pidFailure = new Error("pid query failed");
    fx.scripts.push({ connect: "ok", pid: pidFailure }, { connect: "ok", pid: "ok" });
    const txA = vi.fn(async () => "a");
    const txB = vi.fn(async () => "b");
    await expect(runConcurrentPg(txA, txB, { connectionString: url, timeoutMs: 1_000 })).rejects.toBe(pidFailure);
    expect(fx.clients).toHaveLength(2);
    expect(fx.clients.every((c) => c.ended)).toBe(true);
    expect(txA).not.toHaveBeenCalled();
    expect(txB).not.toHaveBeenCalled();
  });

  it("applies timeoutMs to opening the connections and ends a connection that finishes later", async () => {
    fx.scripts.push({ connect: "hang", pid: "ok" }, { connect: "ok", pid: "ok" });
    const txA = vi.fn(async () => "a");
    await expect(runConcurrentPg(txA, async () => "b", { connectionString: url, timeoutMs: 50 })).rejects.toThrow(
      "runConcurrent timed out after 50ms (opening connections)",
    );
    expect(txA).not.toHaveBeenCalled();
    const [late, early] = fx.clients;
    late.finishConnect!();
    await expect.poll(() => late.ended && early.ended).toBe(true);
  });

  it("reports a 40P01 at once, without waiting for the other callback, and terminates both backends", async () => {
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const started = Date.now();
    const failure = await runConcurrentPg(
      async ({ arrive }) => { await arrive(); throw deadlock; },
      async ({ arrive }) => { await arrive(); return never(); },
      { connectionString: url, timeoutMs: 60_000 },
    ).then(() => null, (e: unknown) => e as Error);
    expect(failure?.message).toMatch(/^deadlock detected \(40P01\)/);
    expect(Date.now() - started).toBeLessThan(5_000);
    const killer = fx.clients[2];
    expect(killer.queries).toEqual([{ sql: expect.stringContaining("pg_terminate_backend"), params: [[1000, 1001]] }]);
    expect(fx.clients.every((c) => c.ended)).toBe(true);
  });
});
