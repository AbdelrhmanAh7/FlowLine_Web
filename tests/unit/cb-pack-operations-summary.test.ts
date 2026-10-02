import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { EXPRESSION_MAX_LENGTH } from "@/engine/expression";
import { validateGraph } from "@/engine/validate";
import { operationsSummaryPack as pack } from "@/company-builder/packs/operations-summary";
import type { PackParams } from "@/company-builder/packs/types";

const PARAM_SETS: PackParams[] = [
  { language: "en" },
  { language: "ar", reportName: "ملخص الأسبوع" },
  { language: "en", overdueDays: 2 },
];

describe("operations-summary pack (executed by the real engine)", () => {
  for (const params of PARAM_SETS) {
    const tag = JSON.stringify(params);
    it(`sample and every frozen fixture pass their checks ${tag}`, async () => {
      const graph = pack.compile(params, (id) => id);
      const input = pack.sample(params);
      expect((input as { sample?: boolean }).sample).toBe(true);
      const res = await executeGraph(graph, input);
      expect(res.status).toBe("succeeded");
      expect(Object.keys(res.output)).toEqual(["summary_draft"]);
      expect(pack.evaluate(res.output, input, params).filter((c) => !c.passed)).toEqual([]);
      const fixtures = pack.fixtures(params);
      expect(fixtures.length).toBeGreaterThanOrEqual(5);
      for (const f of fixtures) {
        const r = await executeGraph(graph, f.input);
        expect(r.status, f.id).toBe("succeeded");
        expect(f.expect(r.output).filter((c) => !c.passed), f.id).toEqual([]);
        expect(pack.evaluate(r.output, f.input, params).filter((c) => !c.passed), `${f.id} evaluate`).toEqual([]);
      }
    });
  }

  it("Arabic language produces an Arabic template; English produces an English one", async () => {
    const en = await executeGraph(pack.compile({ language: "en" }, (id) => id), pack.sample({ language: "en" }));
    const ar = await executeGraph(pack.compile({ language: "ar" }, (id) => id), pack.sample({ language: "ar" }));
    const enText = (en.output.summary_draft as { summary_text: string }).summary_text;
    const arText = (ar.output.summary_draft as { summary_text: string }).summary_text;
    expect(enText).toContain("Team operations summary");
    expect(arText).toContain("ملخص عمليات الفريق");
    expect(arText).toContain("إجمالي العناصر");
  });

  it("the sample has the expected deterministic metrics", async () => {
    const res = await executeGraph(pack.compile({ language: "en" }, (id) => id), pack.sample({ language: "en" }));
    const d = res.output.summary_draft as { metrics: Record<string, unknown>; overdue: { id: string }[] };
    expect(d.metrics).toMatchObject({ total_items: 8, done: 3, in_progress: 2, blocked: 1, todo: 2, done_in_period: 2, overdue: 3 });
    expect(d.overdue.map((x) => x.id)).toEqual(["OPS-104", "OPS-103", "OPS-105"]);
  });

  it("params are data: quotes and JSONata syntax in reportName cannot change the expressions", async () => {
    const params = { language: "en", reportName: 'x" & $eval("1") & "\n}) $$' };
    const res = await executeGraph(pack.compile(params, (id) => id), pack.sample(params));
    expect(res.status).toBe("succeeded");
    expect(pack.evaluate(res.output, pack.sample(params), params).every((c) => c.passed)).toBe(true);
  });

  it("a wrong count fails counts_match_input", () => {
    const params = { language: "en" };
    const input = pack.sample(params);
    const wrong = {
      summary_draft: {
        period: { start: "2026-09-21", end: "2026-09-27", timezone: "Asia/Riyadh" },
        metrics: { total_items: 8, valid_items: 8, malformed_items: 0, done: 4, in_progress: 2, blocked: 1, todo: 2, done_in_period: 2, overdue: 3, open_by_owner: [] },
        overdue: [],
        blocked: [],
        summary_text: "Totals only.",
        generated_by: "template",
      },
    };
    const checks = pack.evaluate(wrong, input, params);
    expect(checks.find((c) => c.id === "counts_match_input")!.passed).toBe(false);
    expect(checks.find((c) => c.id === "overdue_correct")!.passed).toBe(false);
  });

  it("a summary that mentions a title not in the input, or is unlabelled, fails", async () => {
    const params = { language: "en" };
    const input = pack.sample(params);
    const res = await executeGraph(pack.compile(params, (id) => id), input);
    const good = res.output.summary_draft as Record<string, unknown>;
    const invented = pack.evaluate({ summary_draft: { ...good, summary_text: `${good.summary_text} Overdue: “Invented task”.` } }, input, params);
    expect(invented.find((c) => c.id === "summary_mentions_only_input_titles")!.passed).toBe(false);
    const unlabelled = pack.evaluate({ summary_draft: { ...good, generated_by: "ai" } }, input, params);
    expect(unlabelled.find((c) => c.id === "labelled_template")!.passed).toBe(false);
    expect(pack.evaluate({ summary_draft: good, needs_input: { reason: "no_items" } }, input, params).find((c) => c.id === "one_outcome")!.passed).toBe(false);
  });

  it("does not crash on hostile input shapes", async () => {
    const graph = pack.compile({ language: "en" }, (id) => id);
    for (const input of [{}, { items: null }, { items: 5 }, { items: [[1, 2], null, { id: {}, status: [] }] }, { period: "x", items: "y" }, []]) {
      const r = await executeGraph(graph, input);
      expect(r.status, JSON.stringify(input)).toBe("succeeded");
      expect(pack.evaluate(r.output, input, { language: "en" }).filter((c) => !c.passed), JSON.stringify(input)).toEqual([]);
    }
  });

  it("uses only declared node types, valid graphs and expressions under the length limit", () => {
    for (const params of PARAM_SETS) {
      const graph = pack.compile(params, (id) => id);
      expect(graph.nodes.every((n) => pack.nodeTypes.includes(n.type))).toBe(true);
      expect(validateGraph(graph)).toEqual([]);
      for (const n of graph.nodes) {
        const expr = (n.data.config as { expression?: string }).expression;
        if (expr) expect(expr.length, n.id).toBeLessThan(EXPRESSION_MAX_LENGTH);
      }
    }
    expect(pack.nodeTypes).toEqual(["trigger.manual", "transform.json", "logic.condition", "output"]);
  });
});
