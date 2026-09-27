import { describe, expect, it } from "vitest";
import { executeGraph, NodeError, type HostHandler } from "@/engine/execute";
import type { FlowEdge, FlowGraph, FlowNode, NodeType } from "@/engine/types";
import { checkConnection, checkCron, validateGraph } from "@/engine/validate";
import { dueFires } from "@/engine/schedule-math";

let x = 0;
function n<T extends NodeType>(id: string, type: T, config: Record<string, unknown>, label = id): FlowNode {
  return { id, type, position: { x: (x += 100), y: 0 }, data: { label, config: config as never } };
}
const e = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });
const trigger = (payload: unknown) => n("t", "trigger.manual", { samplePayload: JSON.stringify(payload) });

describe("parallel branches and join", () => {
  it("fans out, runs branches in parallel, merges results", async () => {
    const order: string[] = [];
    const slow: HostHandler = async (node, input) => {
      order.push(`start:${node.id}`);
      await new Promise((r) => setTimeout(r, node.id === "b1" ? 60 : 10));
      order.push(`end:${node.id}`);
      return { kind: "ok", output: { from: node.id, v: (input as { v: number }).v } };
    };
    const g: FlowGraph = {
      nodes: [
        trigger({ v: 1 }),
        n("b1", "http.request", { method: "GET", url: "'https://example.com'", headers: "", body: "", timeoutMs: 5000, sideEffect: "none" }, "Branch 1"),
        n("b2", "http.request", { method: "GET", url: "'https://example.com'", headers: "", body: "", timeoutMs: 5000, sideEffect: "none" }, "Branch 2"),
        n("m", "data.merge", { mode: "object" }),
        n("o", "output", { key: "merged", expression: "" }),
      ],
      edges: [e("t", "b1"), e("t", "b2"), e("b1", "m"), e("b2", "m"), e("m", "o")],
    };
    expect(validateGraph(g)).toEqual([]);
    const res = await executeGraph(g, { v: 1 }, { handler: slow });
    expect(res.status).toBe("succeeded");
    expect(res.output.merged).toEqual({ "Branch 1": { from: "b1", v: 1 }, "Branch 2": { from: "b2", v: 1 } });
    // Both started before either finished → parallel.
    expect(order.slice(0, 2).sort()).toEqual(["start:b1", "start:b2"]);
  });

  it("a merge after a condition only gets the branch that ran", async () => {
    const g: FlowGraph = {
      nodes: [trigger({ v: 5 }), n("c", "logic.condition", { expression: "v > 3" }), n("hi", "transform.json", { expression: "'high'" }, "Hi"), n("lo", "transform.json", { expression: "'low'" }, "Lo"), n("m", "data.merge", { mode: "first" }), n("o", "output", { key: "r", expression: "" })],
      edges: [e("t", "c"), e("c", "hi", "true"), e("c", "lo", "false"), e("hi", "m"), e("lo", "m"), e("m", "o")],
    };
    const res = await executeGraph(g, { v: 5 });
    expect(res.output.r).toBe("high");
    expect(res.steps.find((s) => s.nodeId === "lo")!.status).toBe("skipped");
  });

  it("merge needs at least two inputs; single-input nodes refuse a second input", () => {
    const g: FlowGraph = { nodes: [trigger({}), n("m", "data.merge", { mode: "array" }), n("o", "output", { key: "r", expression: "" })], edges: [e("t", "m"), e("m", "o")] };
    expect(validateGraph(g).map((i) => i.code)).toContain("MERGE_NEEDS_INPUTS");
    const g2: FlowGraph = { nodes: [trigger({}), n("a", "transform.json", { expression: "1" }), n("b", "transform.json", { expression: "2" })], edges: [e("t", "a"), e("a", "b")] };
    expect(checkConnection(g2, { source: "t", target: "b" })).toMatch(/already has an input/);
  });
});

describe("data nodes", () => {
  it("filter, map and CSV parse/build", async () => {
    const g: FlowGraph = {
      nodes: [
        trigger({ csv: "name,amount\nA,5\nB,50\nC,500" }),
        n("p", "data.csv", { mode: "parse", source: "csv", delimiter: "," }),
        n("f", "data.filter", { predicate: "$number(amount) >= 50", source: "rows" }),
        n("m", "data.map", { fields: [{ key: "count", expression: "$count($)" }, { key: "names", expression: "$.name" }] }),
        n("o", "output", { key: "r", expression: "" }),
      ],
      edges: [e("t", "p"), e("p", "f"), e("f", "m"), e("m", "o")],
    };
    const res = await executeGraph(g, { csv: "name,amount\nA,5\nB,50\nC,500" });
    expect(res.status).toBe("succeeded");
    expect(res.output.r).toEqual({ count: 2, names: ["B", "C"] });
  });

  it("$steps references read upstream outputs and must point upstream", async () => {
    const g: FlowGraph = {
      nodes: [trigger({ a: 1 }), n("x", "transform.json", { expression: "{ 'twice': a * 2 }" }), n("y", "transform.json", { expression: "{ 'orig': $steps.t.a, 'twice': $steps.x.twice }" }), n("o", "output", { key: "r", expression: "" })],
      edges: [e("t", "x"), e("x", "y"), e("y", "o")],
    };
    const res = await executeGraph(g, { a: 1 });
    expect(res.output.r).toEqual({ orig: 1, twice: 2 });
    const bad = structuredClone(g);
    (bad.nodes[1]!.data.config as { expression: string }).expression = "$steps.y.twice";
    expect(validateGraph(bad).map((i) => i.code)).toContain("REFERENCE_NOT_UPSTREAM");
    (bad.nodes[1]!.data.config as { expression: string }).expression = "$steps.nope";
    expect(validateGraph(bad).map((i) => i.code)).toContain("UNKNOWN_REFERENCE");
  });
});

describe("pause, cancel, resume", () => {
  const g: FlowGraph = {
    nodes: [
      trigger({}),
      n("a", "integration.action", { actionId: "x", connectionId: "c", inputMapping: "{}", requireApproval: true }, "Needs approval"),
      n("b", "transform.json", { expression: "'independent'" }, "Independent"),
      n("after", "transform.json", { expression: "'after'" }),
      n("o", "output", { key: "b", expression: "" }),
    ],
    edges: [e("t", "a"), e("t", "b"), e("a", "after"), e("b", "o")],
  };

  it("a paused step blocks only its dependants; independent branches finish", async () => {
    const h: HostHandler = async () => ({ kind: "pause", status: "waiting_approval", message: "approve me" });
    const res = await executeGraph(g, {}, { handler: h });
    expect(res.status).toBe("waiting_approval");
    const by = Object.fromEntries(res.steps.map((s) => [s.nodeId, s.status]));
    expect(by).toMatchObject({ a: "waiting_approval", b: "succeeded", o: "succeeded" });
    expect(by.after).toBeUndefined(); // not yet decided — neither skipped nor run
  });

  it("resumes from prior steps without re-running them", async () => {
    let calls = 0;
    const h: HostHandler = async () => {
      calls++;
      return { kind: "ok", output: { sent: true } };
    };
    const prior = new Map([
      ["t", { status: "succeeded" as const, input: {}, output: {} }],
      ["b", { status: "succeeded" as const, input: {}, output: "independent" }],
      ["o", { status: "succeeded" as const, input: "independent", output: "independent" }],
    ]);
    const res = await executeGraph(g, {}, { handler: h, prior });
    expect(res.status).toBe("succeeded");
    expect(calls).toBe(1);
  });

  it("cancellation stops pending steps", async () => {
    let cancelled = false;
    const h: HostHandler = async () => {
      cancelled = true;
      throw new NodeError("X", "boom-cancel");
    };
    const g2: FlowGraph = { nodes: [trigger({}), n("a", "code.js", { code: "return 1", timeoutMs: 1000 }), n("b", "transform.json", { expression: "1" }), n("o", "output", { key: "r", expression: "" })], edges: [e("t", "a"), e("a", "b"), e("b", "o")] };
    const res = await executeGraph(g2, {}, { handler: h, isCancelled: () => cancelled });
    expect(res.status).toBe("failed");
    expect(res.steps.find((s) => s.nodeId === "b")!.status).toBe("cancelled");
  });
});

describe("validation limits", () => {
  it("rejects unbounded loops, bad cron and oversized structures", () => {
    const g: FlowGraph = { nodes: [trigger({}), n("l", "logic.loop", { items: "$", flowId: "f", version: 1, maxItems: 100000 })], edges: [e("t", "l")] };
    expect(validateGraph(g).map((i) => i.code)).toContain("UNBOUNDED_LOOP");
    expect(checkCron("* * * * *", "UTC")).toMatch(/at most every 5 minutes/);
    expect(checkCron("0 9 * * 1", "Mars/Olympus")).toMatch(/Unknown time zone/);
    expect(checkCron("0 9 * * 1", "Africa/Cairo")).toBeNull();
    // A cycle closing through a merge (which accepts many inputs) is still rejected.
    const cyc: FlowGraph = { nodes: [trigger({}), n("m", "data.merge", { mode: "array" }), n("a", "transform.json", { expression: "1" })], edges: [e("t", "m"), e("m", "a")] };
    expect(checkConnection(cyc, { source: "a", target: "m" })).toMatch(/loop/);
  });
});

describe("schedule fire times across DST (America/New_York)", () => {
  it("spring forward: 02:30 doesn't exist on 2026-03-08 — fires at most once that day", () => {
    const fires = dueFires("30 2 * * *", "America/New_York", new Date("2026-03-07T00:00:00Z"), new Date("2026-03-10T00:00:00Z"));
    const perDay = new Map<string, number>();
    for (const f of fires) {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", dateStyle: "short" }).format(f);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    for (const count of perDay.values()) expect(count).toBeLessThanOrEqual(1);
    expect(fires.length).toBeGreaterThanOrEqual(2);
  });
  it("fall back: 01:30 happens twice on 2026-11-01 — the schedule fires once", () => {
    const fires = dueFires("30 1 * * *", "America/New_York", new Date("2026-10-31T12:00:00Z"), new Date("2026-11-02T12:00:00Z"));
    const nov1 = fires.filter((f) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", dateStyle: "short" }).format(f) === "2026-11-01");
    expect(nov1).toHaveLength(1);
  });
  it("weekly Monday 09:00 Cairo is 09:00 local", () => {
    const fires = dueFires("0 9 * * 1", "Africa/Cairo", new Date("2026-09-27T00:00:00Z"), new Date("2026-10-06T00:00:00Z"));
    expect(fires.map((f) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(f))).toEqual(["Mon 09:00", "Mon 09:00"]);
  });
});
