import { describe, expect, it } from "vitest";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import type { FlowGraph } from "@/engine/types";
import { checkConnection, validateGraph } from "@/engine/validate";
import { connectionReason, denyReasonText, issueMessage, nodeText, notPreviewedReason, runLabel } from "@/i18n/engine-text";
import { createTranslator } from "@/i18n/translate";
import { duration, timeAgo } from "@/lib/format";
import { ALL_CAPABILITIES, denyReason, type Role } from "@/lib/permissions";
import { runningDetail } from "@/lib/run-status";
import type { RunStepDto } from "@/lib/types";

const en = createTranslator("en");
const ar = createTranslator("ar");
const ARABIC = /[؀-ۿ]/;

type N = { id: string; type: string; label?: string; config?: Record<string, unknown> };
function graph(nodes: N[], edges: [string, string, string?][] = []): FlowGraph {
  return {
    nodes: nodes.map((n, i) => ({ id: n.id, type: n.type, position: { x: i * 240, y: 0 }, data: { label: n.label ?? n.id, config: n.config ?? {} } })),
    edges: edges.map(([source, target, sourceHandle], i) => ({ id: `e${i}`, source, target, sourceHandle: sourceHandle ?? null })),
  } as unknown as FlowGraph;
}

/** Graphs that between them produce every validation message shape the engine emits. */
const BAD_GRAPHS: FlowGraph[] = [
  graph([]),
  graph([
    { id: "trig", type: "trigger.manual", config: { samplePayload: "{bad" } },
    { id: "sched", type: "trigger.schedule", config: { cron: "* *", timezone: "UTC", missedPolicy: "nope" } },
    { id: "tz", type: "trigger.schedule", config: { cron: "0 9 * * 1", timezone: "Mars/Base", missedPolicy: "skip" } },
    { id: "often", type: "trigger.schedule", config: { cron: "* * * * *", timezone: "UTC", missedPolicy: "skip" } },
    { id: "badcron", type: "trigger.schedule", config: { cron: "a b c d e", timezone: "UTC", missedPolicy: "skip" } },
    { id: "empty", type: "transform.json", label: "Step: one", config: { expression: "" } },
    { id: "syntax", type: "transform.json", config: { expression: "$$$((" } },
    { id: "cond", type: "logic.condition", config: { expression: "" } },
    { id: "okey", type: "output", config: { key: "1bad", expression: "" } },
    { id: "proto", type: "output", config: { key: "__proto__", expression: "" } },
    { id: "dup1", type: "output", config: { key: "same", expression: "" } },
    { id: "dup2", type: "output", config: { key: "same", expression: "(" } },
    { id: "filter", type: "data.filter", config: { predicate: "", source: "" } },
    { id: "map0", type: "data.map", config: { fields: [] } },
    { id: "map1", type: "data.map", config: { fields: [{ key: "a b", expression: "" }, { key: "x", expression: "1" }, { key: "x", expression: "(" }] } },
    { id: "merge", type: "data.merge", config: { mode: "zip" } },
    { id: "csv", type: "data.csv", config: { mode: "zip", source: "", delimiter: ",," } },
    { id: "file", type: "data.file", config: { from: "tape", as: "morse", source: "" } },
    { id: "upload", type: "data.file", config: { from: "upload", fileId: "", as: "text" } },
    { id: "store", type: "data.store", config: { op: "del", namespace: "!!", key: "", value: "" } },
    { id: "storeset", type: "data.store", config: { op: "set", namespace: "ok", key: "'k'", value: "" } },
    { id: "loop", type: "logic.loop", config: { items: "", flowId: "", maxItems: 0, version: 0 } },
    { id: "sub", type: "flow.subflow", config: { flowId: "", version: 0, input: "(" } },
    { id: "http", type: "http.request", config: { method: "FETCH", url: "", headers: "(", body: "(", timeoutMs: 5 } },
    { id: "gen", type: "ai.generate", config: { instructions: "", source: "", maxTokens: 1 } },
    { id: "long", type: "ai.generate", config: { instructions: "x".repeat(4001), source: "$" } },
    { id: "ext", type: "ai.extract", config: { instructions: "go", source: "$", schema: "{bad" } },
    { id: "ext2", type: "ai.extract", config: { instructions: "go", source: "$", schema: '{"type":"array"}' } },
    { id: "cls", type: "ai.classify", config: { instructions: "go", source: "$", labels: "one" } },
    { id: "code", type: "code.js", config: { code: "", timeoutMs: 1 } },
    { id: "codelong", type: "code.js", config: { code: "x".repeat(20001), timeoutMs: 5000 } },
    { id: "act", type: "integration.action", config: { actionId: "", connectionId: "", inputMapping: "{ \"at\": $now() }", requireApproval: true } },
    { id: "setup", type: "transform.json", config: { expression: "'REPLACE_WITH_SHEET_ID'" } },
    { id: "ref", type: "transform.json", config: { expression: "$steps.ghost" } },
    { id: "down", type: "transform.json", config: { expression: "$steps.late" } },
    { id: "late", type: "output", config: { key: "late", expression: "" } },
    { id: "unknownType", type: "made.up" },
  ], [
    ["trig", "trig"],
    ["trig", "down"],
    ["down", "late"],
    ["trig", "late"],
    ["late", "trig"],
    ["trig", "sched"],
    ["trig", "cond", "sideways"],
    ["trig", "cond"],
    ["cond", "merge", "true"],
    ["cond", "merge", "true"],
    ["merge", "filter"],
    ["filter", "merge"],
  ]),
  graph([{ id: "only", type: "trigger.manual", config: { samplePayload: "" } }]),
  graph([
    { id: "a", type: "trigger.manual" },
    { id: "a", type: "output", config: { key: "k", expression: "" } },
  ]),
];

const issues = BAD_GRAPHS.flatMap((g) => {
  const labelOf = new Map(g.nodes.map((n) => [n.id, n.data.label]));
  return validateGraph(g).map((i) => ({ ...i, label: i.nodeId ? labelOf.get(i.nodeId) : undefined }));
});

describe("engine text in the UI language", () => {
  it("the fixture graphs cover the validation codes", () => {
    const codes = new Set(issues.map((i) => i.code));
    for (const c of ["EMPTY_FLOW", "INVALID_JSON", "INVALID_SCHEDULE", "EMPTY_EXPRESSION", "INVALID_EXPRESSION", "INVALID_OUTPUT_KEY", "RESERVED_OUTPUT_KEY", "DUPLICATE_OUTPUT_KEY", "EMPTY_MAPPING", "INVALID_FIELD", "DUPLICATE_FIELD", "INVALID_CONFIG", "MISSING_FILE", "MISSING_SUBFLOW", "UNBOUNDED_LOOP", "INVALID_SCHEMA", "MISSING_ACTION", "MISSING_CONNECTION", "APPROVAL_UNSTABLE_INPUT", "SETUP_REQUIRED", "UNKNOWN_REFERENCE", "REFERENCE_NOT_UPSTREAM", "UNCONNECTED_INPUT", "MERGE_NEEDS_INPUTS", "INVALID_EDGE", "MULTIPLE_TRIGGERS", "UNKNOWN_NODE", "NO_STEPS", "DUPLICATE_NODE_ID"]) {
      expect(codes, c).toContain(c);
    }
  });

  it("English reproduces the engine's message exactly (with and without the node label)", () => {
    for (const i of issues) {
      expect(issueMessage(en, i, i.label)).toBe(i.message);
      expect(issueMessage(en, i)).toBe(i.message);
    }
  });

  it("Arabic translates every validation message (only machine text — keys, JSONata errors — stays Latin)", () => {
    for (const i of issues) {
      for (const out of [issueMessage(ar, i, i.label), issueMessage(ar, i)]) {
        expect(out, i.message).not.toBe(i.message);
        expect(out, i.message).toMatch(ARABIC);
        expect(out).not.toMatch(/\{\w+\}|undefined/);
      }
    }
  });

  it("connection refusals: English unchanged, Arabic translated", () => {
    const g = graph(
      [
        { id: "t", type: "trigger.manual", label: "Start" },
        { id: "x", type: "transform.json", label: "Shape" },
        { id: "o", type: "output", label: "Done" },
        { id: "m", type: "data.merge", label: "Join" },
      ],
      [["t", "x"], ["x", "o"], ["t", "m"], ["x", "m"], ["o", "m"], ["t", "m"], ["x", "m"], ["o", "m"], ["t", "m"]],
    );
    const reasons = [
      checkConnection(g, { source: "x", target: "x" }),
      checkConnection(g, { source: "x", target: "nope" }),
      checkConnection(graph([{ id: "a", type: "made.up" }, { id: "b", type: "output" }]), { source: "a", target: "b" }),
      checkConnection(g, { source: "o", target: "x" }),
      checkConnection(g, { source: "x", target: "t" }),
      checkConnection(g, { source: "t", target: "x", sourceHandle: "sideways" }),
      checkConnection(g, { source: "t", target: "o" }),
      checkConnection(g, { source: "t", target: "m" }),
      checkConnection({ nodes: g.nodes, edges: g.edges.slice(0, 2) }, { source: "t", target: "x" }),
      checkConnection({ nodes: g.nodes, edges: [g.edges[0]!] }, { source: "x", target: "t" }),
    ].filter((r): r is string => r !== null);
    expect(new Set(reasons).size).toBeGreaterThanOrEqual(8);
    const loop = checkConnection(graph([{ id: "a", type: "transform.json" }, { id: "b", type: "transform.json" }], [["a", "b"]]), { source: "b", target: "a" })!;
    for (const r of [...reasons, loop]) {
      expect(connectionReason(en, r)).toBe(r);
      expect(connectionReason(ar, r)).toMatch(ARABIC);
    }
  });

  it("the English node catalogue mirrors the engine definitions; Arabic has every node", () => {
    for (const def of Object.values(NODE_DEFINITIONS)) {
      for (const f of ["title", "subtitle", "description"] as const) {
        expect(nodeText(en, def.type, f), `${def.type}.${f}`).toBe(def[f]);
        expect(nodeText(ar, def.type, f), `${def.type}.${f}`).not.toBe("");
      }
      expect(nodeText(ar, def.type, "description")).toMatch(ARABIC);
    }
    expect(nodeText(ar, "made.up", "title")).toBe("made.up");
  });

  it("permission reasons: English identical to denyReason for every capability and role", () => {
    for (const cap of ALL_CAPABILITIES) {
      for (const role of ["owner", "editor", "viewer", null] as (Role | null)[]) {
        expect(denyReasonText(en, role, cap)).toBe(denyReason(role, cap));
        expect(denyReasonText(ar, role, cap)).toMatch(ARABIC);
      }
    }
    expect(denyReasonText(ar, "viewer", "flow.edit")).toBe("يقتصر هذا الإجراء على المالكين والمحرّرين في مساحة العمل؛ دورك: مُشاهد");
  });

  it("run status labels and the running line", () => {
    expect(runLabel(en, "succeeded")).toBe("Success");
    expect(runLabel(ar, "waiting_approval")).toBe("بانتظار الموافقة");
    expect(runLabel(ar, "brand_new")).toBe("brand_new");
    const start = Date.parse("2026-09-27T10:00:00Z");
    const step = { nodeId: "n", nodeType: "integration.action", startedAt: new Date(start).toISOString() } as RunStepDto;
    const events = [{ id: 1, at: "", type: "step_retry", nodeId: "n", data: { kind: "constructor" } }];
    for (const [ev, at] of [[[], start + 300], [[], start + 12_400], [events, start + 2_000]] as const) {
      expect(runningDetail(step, [...ev], at, en)).toEqual(runningDetail(step, [...ev], at));
    }
    expect(runningDetail(step, [], start + 12_400, ar)).toEqual({ text: "قيد التشغيل… 12 ث · المزوّد بطيء", degraded: true });
    expect(runningDetail(step, events, start + 2_000, ar).text).toContain("خطأ عابر");
  });

  it("Copilot 'Not previewed' reasons: English unchanged, Arabic translated", () => {
    const reasons = [
      'Not previewed: "Send mail" (integration.action) runs outside Flowline — test it in the builder after approving.',
      "Not previewed: an expression uses pattern matching — run it in the builder after approving.",
      "Not previewed: the trigger's sample payload isn't valid JSON.",
      "Not previewed: timeout",
    ];
    for (const r of reasons) {
      expect(notPreviewedReason(en, r)).toBe(r);
      expect(notPreviewedReason(ar, r)).toMatch(/^لم تُعايَن: /);
    }
    expect(en("copilot.previewOk")).toBe("Ran without errors — verify the output matches your request.");
  });

  it("format helpers stay English by default and follow the locale when given", () => {
    const now = Date.parse("2026-09-27T10:00:00Z");
    expect(timeAgo(new Date(now - 5 * 60_000), now)).toBe("5m ago");
    expect(timeAgo(null, now)).toBe("never");
    expect(timeAgo("", now)).toBe("never");
    expect(timeAgo(new Date(now - 5 * 60_000), now, "ar")).toBe("قبل 5 دقائق");
    expect(timeAgo(null, now, "ar")).toBe("لم يحدث بعد");
    expect(duration(850)).toBe("850ms");
    expect(duration(12_300)).toBe("12.3s");
    expect(duration(125_000)).toBe("2m 5s");
    expect(duration(12_300, "ar")).not.toMatch(/[٠-٩]/);
  });
});
