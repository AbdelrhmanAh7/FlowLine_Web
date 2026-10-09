import { describe, expect, it } from "vitest";
import { runConcurrent, type TxContext } from "../helpers/concurrentTx";

const never = () => new Promise<never>(() => {});

describe("runConcurrent", () => {
  it("resolves with both results for a same-order pair", async () => {
    const txA = async (ctx: TxContext) => {
      await ctx.arrive();
      return "a";
    };
    const txB = async (ctx: TxContext) => {
      await ctx.arrive();
      return "b";
    };
    await expect(runConcurrent(txA, txB, { timeoutMs: 1000 })).resolves.toEqual(["a", "b"]);
  });

  it("does not let either transaction proceed until both reached the barrier", async () => {
    const events: string[] = [];
    const tx = (name: string) => async (ctx: TxContext) => {
      events.push(`${name}:arrive`);
      await ctx.arrive();
      events.push(`${name}:proceed`);
      return name;
    };
    await runConcurrent(tx("a"), tx("b"), { timeoutMs: 1000 });
    expect(events.slice(0, 2).sort()).toEqual(["a:arrive", "b:arrive"]);
    expect(events.slice(2).sort()).toEqual(["a:proceed", "b:proceed"]);
  });

  it("reports an opposite-order pair that raises 40P01 as a deadlock", async () => {
    const txA = async (ctx: TxContext) => {
      await ctx.arrive();
      throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
    };
    const txB = async (ctx: TxContext) => {
      await ctx.arrive();
      return never();
    };
    await expect(runConcurrent(txA, txB, { timeoutMs: 1000 })).rejects.toThrow(/deadlock/i);
  });

  it("fails with a timeout message when a transaction hangs", async () => {
    const hung = async (ctx: TxContext) => {
      await ctx.arrive();
      return never();
    };
    const done = async (ctx: TxContext) => {
      await ctx.arrive();
      return "b";
    };
    await expect(runConcurrent(hung, done, { timeoutMs: 50 })).rejects.toThrow(/timed out/i);
  });

  it("absorbs a late error from a timed-out transaction (no unhandled rejection)", async () => {
    // PR #94: a hung transaction failed after its timeout and surfaced as an unhandled error at teardown.
    let abort!: (err: Error) => void;
    const hung = async (ctx: TxContext) => {
      await ctx.arrive();
      return new Promise<never>((_, reject) => {
        abort = reject;
      });
    };
    const done = async (ctx: TxContext) => {
      await ctx.arrive();
      return "b";
    };
    await expect(runConcurrent(hung, done, { timeoutMs: 50 })).rejects.toThrow(/timed out/i);
    abort(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }));
  });
});
