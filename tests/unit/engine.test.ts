import { describe, expect, it } from "vitest";
import { executeGraph, sampleInputFor } from "@/engine/execute";
import { evaluateExpression } from "@/engine/expression";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { checkConnection, validateGraph } from "@/engine/validate";
import type { FlowGraph } from "@/engine/types";

const lead = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!.graph;
const clone = (g: FlowGraph): FlowGraph => structuredClone(g);

describe("validateGraph", () => {
  it("accepts every local template", () => {
    for (const t of LOCAL_TEMPLATES) expect(validateGraph(t.graph), t.id).toEqual([]);
  });
  it("flags an empty flow", () => {
    expect(validateGraph({ nodes: [], edges: [] })[0].code).toBe("EMPTY_FLOW");
  });
  it("flags missing trigger, unconnected input and bad expressions", () => {
    const g = clone(lead);
    g.nodes = g.nodes.filter((n) => n.id !== "trigger");
    g.edges = g.edges.filter((e) => e.source !== "trigger");
    (g.nodes.find((n) => n.id === "is-hot")!.data.config as { expression: string }).expression = "size >=";
    const codes = validateGraph(g).map((i) => i.code);
    expect(codes).toContain("NO_TRIGGER");
    expect(codes).toContain("UNCONNECTED_INPUT");
    expect(codes).toContain("INVALID_EXPRESSION");
  });
  it("flags invalid sample JSON", () => {
    const g = clone(lead);
    (g.nodes[0].data.config as { samplePayload: string }).samplePayload = "{nope";
    expect(validateGraph(g).map((i) => i.code)).toContain("INVALID_JSON");
  });
});

describe("checkConnection", () => {
  it("rejects self loops, cycles, double inputs, inputs into triggers, outputs from outputs", () => {
    expect(checkConnection(lead, { source: "normalise", target: "normalise" })).toMatch(/itself/);
    expect(checkConnection(lead, { source: "is-hot", target: "normalise", sourceHandle: "true" })).toMatch(/already has an input/);
    const noIn = { ...lead, edges: lead.edges.filter((e) => e.target !== "normalise") };
    expect(checkConnection(noIn, { source: "trigger", target: "normalise", sourceHandle: "out" })).toBeNull();
    expect(checkConnection(noIn, { source: "is-hot", target: "normalise", sourceHandle: "false" })).toMatch(/loop/);
    expect(checkConnection(lead, { source: "normalise", target: "trigger" })).toMatch(/can't receive input/);
    expect(checkConnection(lead, { source: "hot", target: "nurture" })).toMatch(/no outputs/);
    expect(checkConnection(lead, { source: "is-hot", target: "hot", sourceHandle: "maybe" })).toMatch(/Unknown output/);
  });
});

describe("executeGraph", () => {
  it("runs trigger → transform → condition → output and skips the other branch", async () => {
    const res = await executeGraph(lead, sampleInputFor(lead));
    expect(res.status).toBe("succeeded");
    expect(res.output).toEqual({ hot_lead: { name: "Ada Lovelace", domain: "analytical.io", tier: "hot" } });
    const byId = Object.fromEntries(res.steps.map((s) => [s.nodeId, s]));
    expect(byId["is-hot"].output).toEqual({ result: true, branch: "true" });
    expect(byId.nurture.status).toBe("skipped");
    expect(byId.nurture.skipReason).toMatch(/true branch/);
    expect(byId.normalise.input).toEqual(sampleInputFor(lead));
  });
  it("takes the false branch for small companies", async () => {
    const res = await executeGraph(lead, { lead: { name: "Tiny", email: "a@t.co", employees: 3 } });
    expect(res.output).toEqual({ nurture: { name: "Tiny", tier: "nurture" } });
  });
  it("fails a step with a runtime error and skips downstream", async () => {
    const g = clone(lead);
    (g.nodes.find((n) => n.id === "normalise")!.data.config as { expression: string }).expression = '$error("boom")';
    const res = await executeGraph(g, sampleInputFor(g));
    expect(res.status).toBe("failed");
    expect(res.error?.nodeId).toBe("normalise");
    expect(res.steps.find((s) => s.nodeId === "is-hot")!.status).toBe("skipped");
  });
  it("re-runs from a step reusing upstream outputs", async () => {
    const reused = new Map([
      ["trigger", { input: { lead: { employees: 1 } }, output: { lead: { employees: 1 } } }],
      ["normalise", { input: null, output: { name: "Cached", domain: "c.io", size: 999 } }],
    ]);
    const res = await executeGraph(lead, {}, { fromNodeId: "is-hot", reused });
    expect(res.steps.find((s) => s.nodeId === "normalise")!.status).toBe("reused");
    expect(res.output).toEqual({ hot_lead: { name: "Cached", domain: "c.io", tier: "hot" } });
  });
  it("refuses invalid graphs", async () => {
    const res = await executeGraph({ nodes: [], edges: [] }, {});
    expect(res.error?.code).toBe("INVALID_FLOW");
  });
});

describe("evaluateExpression sandbox", () => {
  it("stops runaway recursion", async () => {
    await expect(evaluateExpression("($f := function($n){ $f($n + 1) }; $f(0))", {})).rejects.toMatchObject({ code: expect.stringMatching(/EXPRESSION_(DEPTH|TIMEOUT|RUNTIME)/) });
  });
  it("returns null for no match", async () => {
    expect(await evaluateExpression("missing.field", { a: 1 })).toBeNull();
  });
});
