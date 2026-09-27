import { afterAll, describe, expect, it } from "vitest";
import { executeGraph, sampleInputFor } from "@/engine/execute";
import { evaluateIsolated, stopSandbox } from "@/engine/sandbox";

afterAll(() => stopSandbox());
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { validateGraph } from "@/engine/validate";
import type { FlowGraph } from "@/engine/types";
import { checkRunRate, RUNS_PER_MINUTE } from "@/server/rate-limit";

describe("process-isolated expression evaluation (regression: Fable F2)", () => {
  it("evaluates normally", async () => {
    expect(await evaluateIsolated('{"n": a * 2}', { a: 21 })).toEqual({ n: 42 });
  });
  it("reports syntax and runtime errors with codes", async () => {
    await expect(evaluateIsolated("a +", {})).rejects.toMatchObject({ code: "EXPRESSION_SYNTAX" });
    await expect(evaluateIsolated('$number("x")', {})).rejects.toMatchObject({ code: "EXPRESSION_RUNTIME" });
  });
  it("stops a catastrophic-backtracking regex with a hard timeout", async () => {
    const t0 = Date.now();
    await expect(evaluateIsolated('$match($pad("a", 34, "a") & "!", /(a+)+$/)', {}, undefined, 500)).rejects.toMatchObject({ code: "EXPRESSION_TIMEOUT" });
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("refuses a huge $pad and survives a memory blow-up without crashing the host", async () => {
    await expect(evaluateIsolated('$pad("x", 400000000)', {}, undefined, 3000)).rejects.toMatchObject({ code: "EXPRESSION_LIMIT" });
    // Exponential string growth via recursion hits the sandbox heap cap / timeout, not the host.
    await expect(
      evaluateIsolated('($f := function($s, $n){ $n = 0 ? $s : $f($s & $s, $n - 1) }; $length($f("xxxxxxxx", 40)))', {}, undefined, 5000),
    ).rejects.toMatchObject({ code: expect.stringMatching(/EXPRESSION_(MEMORY|TIMEOUT|RUNTIME)/) });
    // Host still healthy afterwards.
    expect(await evaluateIsolated("1 + 1", {})).toBe(2);
  });
  it("runs a whole template through the isolated evaluator", async () => {
    const g = LOCAL_TEMPLATES[0]!.graph;
    const res = await executeGraph(g, sampleInputFor(g), { evaluate: (s, i, b) => evaluateIsolated(s, i, b) });
    expect(res.status).toBe("succeeded");
    expect(res.output).toEqual({ hot_lead: { name: "Ada Lovelace", domain: "analytical.io", tier: "hot" } });
  });
});

describe("output keys (regression: Fable F6)", () => {
  const base = () => structuredClone(LOCAL_TEMPLATES[0]!.graph) as FlowGraph;
  it("rejects reserved keys", () => {
    const g = base();
    (g.nodes.find((n) => n.id === "hot")!.data.config as { key: string }).key = "__proto__";
    expect(validateGraph(g).map((i) => i.code)).toContain("RESERVED_OUTPUT_KEY");
  });
  it("rejects duplicate keys across Output nodes", () => {
    const g = base();
    (g.nodes.find((n) => n.id === "nurture")!.data.config as { key: string }).key = "hot_lead";
    expect(validateGraph(g).filter((i) => i.code === "DUPLICATE_OUTPUT_KEY")).toHaveLength(2);
  });
});

describe("run rate limit (regression: Fable F9)", () => {
  it(`allows ${RUNS_PER_MINUTE}/min per user, then 429`, () => {
    const now = 1_000_000;
    for (let i = 0; i < RUNS_PER_MINUTE; i++) checkRunRate("rl-user", now + i);
    expect(() => checkRunRate("rl-user", now + 100)).toThrowError(/at most/);
    expect(() => checkRunRate("other-user", now + 100)).not.toThrow();
    expect(() => checkRunRate("rl-user", now + 61_000)).not.toThrow();
  });
});
