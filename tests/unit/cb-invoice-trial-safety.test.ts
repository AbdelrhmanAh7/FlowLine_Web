import { describe, expect, it } from "vitest";
import jsonata from "jsonata";
import { executeGraph } from "@/engine/execute";
import type { FlowGraph } from "@/engine/types";
import { getPack, PACKS } from "@/company-builder/packs";
import { expectedInvoiceResult, invoiceOrganiserPack as pack, roundHalfEven } from "@/company-builder/packs/invoice-organiser";
import type { PackParams } from "@/company-builder/packs/types";
import { sampleTrialDrift } from "@/company-builder/sample-safety";
import { memoryStore } from "../fixtures/company-builder/store-stub";

// Codex PR1 review: the invoice evaluator only compared the run's totals with the run's own rows, and the sample-trial
// guard accepted any data.store config. Both are now checked against values derived independently of the run.

type Out = Record<string, unknown>;
const run = async (params: PackParams, input: unknown) => {
  const r = await executeGraph(pack.compile(params, (id) => id), input, { handler: memoryStore().handler });
  expect(r.status).toBe("succeeded");
  return r.output as Out;
};
const failed = (o: Out, input: unknown, params: PackParams) => pack.evaluate(o, input, params).filter((c) => !c.passed).map((c) => c.id);
const doc = (n: string, extra: Record<string, unknown> = {}) => ({ file: `f-${n}.csv`, vendor: "Vendor " + n, invoice_number: n, date: "2026-09-10", currency: "SAR", lines: [{ description: "x", qty: 2, unit_price: 50 }], stated_total: 100, ...extra });
const PARAMS: PackParams[] = [{ currencies: ["SAR"] }, { currencies: ["USD", "EUR"] }, { currencies: [] }, {}];

describe("invoice evaluator derives the expected result from the input", () => {
  it("roundHalfEven matches JSONata $round", async () => {
    for (const v of [0.125, 0.135, 2.675, 1.005, 1.015, 0.5, 1.5, 2.5, -2.5, 280.004999, 1e21, 1234.5678, 0.1 + 0.2, -0.001]) {
      expect(roundHalfEven(v, 2), String(v)).toBe(await jsonata(`$round(${v}, 2)`).evaluate({}));
    }
  });

  it("every compiled fixture and the sample still pass, for every currency setting", async () => {
    for (const params of PARAMS) {
      const fixtures = pack.fixtures(params);
      for (const input of [pack.sample(params), ...fixtures.filter((f) => f.id !== "inv-empty").map((f) => f.input)]) {
        const o = await run(params, input);
        expect(failed(o, input, params), JSON.stringify({ params, input })).toEqual([]);
      }
      // An empty batch is correctly sent to review and flagged, but it cannot count as a successful ledger outcome.
      const empty = await run(params, fixtures.find((f) => f.id === "inv-empty")!.input);
      expect((empty.discrepancy_review as { empty?: boolean }).empty).toBe(true);
      expect(failed(empty, fixtures.find((f) => f.id === "inv-empty")!.input, params)).toEqual(["not_empty"]);
    }
  });

  it("odd inputs (single object, rounding edges, mixed currencies, duplicates) are matched exactly", async () => {
    const inputs = [
      { documents: doc("1") },
      { documents: [doc("1", { lines: [{ qty: 3, unit_price: 0.335 }, { qty: 1, unit_price: 1.005 }], stated_total: 2.01 })] },
      { documents: [doc("1"), doc("2", { currency: "USD" }), doc("3"), doc("4", { currency: "EUR" })] },
      { documents: [doc("1"), doc("1")] },
      { documents: [doc("1", { stated_total: "100" }), doc("2", { lines: { qty: 2, unit_price: 50 } }), "junk", null] },
      {},
    ];
    for (const params of PARAMS) {
      for (const input of inputs) {
        const o = await run(params, input);
        const failedChecks = failed(o, input, params);
        expect(failedChecks, JSON.stringify({ params, input })).toEqual(expectedInvoiceResult(input, params).documents === 0 ? ["not_empty"] : []);
      }
    }
  });

  describe("mutated outputs fail", () => {
    const params: PackParams = { currencies: ["SAR", "USD"] };
    const clean = { documents: [doc("1"), doc("2", { currency: "USD", stated_total: 100 }), doc("3")] };
    const mixed = { documents: [doc("1"), doc("2", { stated_total: 130 })] };
    const mutate = async (input: unknown, f: (o: Out) => void) => {
      const o = structuredClone(await run(params, input));
      f(o);
      return failed(o, input, params);
    };
    const ledger = (o: Out) => o.ledger_draft as { documents: number; ledger_rows: Record<string, unknown>[]; totals_by_currency: Record<string, unknown>[] };
    const review = (o: Out) => o.discrepancy_review as { documents: number; empty: boolean; discrepancies: Record<string, unknown>[]; ledger_rows: Record<string, unknown>[]; totals_by_currency: Record<string, unknown>[] };

    it("the unmutated outputs pass", async () => {
      expect(await mutate(clean, () => {})).toEqual([]);
      expect(await mutate(mixed, () => {})).toEqual([]);
    });
    it("Codex example: invented rows with empty totals on the two-document sample", async () => {
      const input = pack.sample(params);
      const bad = await mutate(input, (o) => {
        delete o.discrepancy_review;
        o.ledger_draft = { documents: 2, ledger_rows: [{ date: "2026-01-01", vendor: "X", reference: "1", currency: "SAR", amount: 1 }, { date: "2026-01-01", vendor: "Y", reference: "2", currency: "SAR", amount: 2 }], totals_by_currency: [] };
      });
      expect(bad).toContain("correct_outcome");
      expect(bad.length).toBeGreaterThan(0);
    });
    it("forged rows / empty totals / duplicated rows / dropped rows", async () => {
      expect(await mutate(clean, (o) => ledger(o).ledger_rows.splice(0, 1, { ...ledger(o).ledger_rows[0]!, vendor: "Forged" }))).toContain("ledger_rows_exact");
      expect(await mutate(clean, (o) => { ledger(o).totals_by_currency = []; })).toContain("totals_per_currency");
      expect(await mutate(clean, (o) => ledger(o).ledger_rows.push(ledger(o).ledger_rows[0]!))).toEqual(expect.arrayContaining(["ledger_rows_exact", "every_document_accounted"]));
      expect(await mutate(clean, (o) => ledger(o).ledger_rows.pop())).toContain("ledger_rows_exact");
    });
    it("changed vendor / date / reference / amount / currency", async () => {
      for (const [k, v] of [["vendor", "Other"], ["date", "2026-09-11"], ["reference", "999"], ["amount", 100.01], ["currency", "EUR"]] as const) {
        expect(await mutate(clean, (o) => { ledger(o).ledger_rows[1]![k] = v; }), k).toContain("ledger_rows_exact");
      }
    });
    it("wrong currency or amount in the totals, and currencies combined", async () => {
      expect(await mutate(clean, (o) => { ledger(o).totals_by_currency[0]!.currency = "EUR"; })).toContain("totals_per_currency");
      expect(await mutate(clean, (o) => { ledger(o).totals_by_currency[0]!.total = 200.01; })).toContain("totals_per_currency");
      expect(await mutate(clean, (o) => { ledger(o).totals_by_currency = [{ currency: "SAR", total: 300, count: 3 }]; })).toContain("totals_per_currency");
    });
    it("omitted or altered discrepancies, and a hidden review", async () => {
      expect(await mutate(mixed, (o) => { review(o).discrepancies = []; })).toEqual(expect.arrayContaining(["discrepancies_exact", "every_document_accounted"]));
      expect(await mutate(mixed, (o) => { review(o).discrepancies[0]!.mismatch = false; })).toContain("discrepancies_exact");
      expect(await mutate(mixed, (o) => { o.ledger_draft = { documents: 2, ledger_rows: review(o).ledger_rows, totals_by_currency: review(o).totals_by_currency }; delete o.discrepancy_review; })).toContain("correct_outcome");
      expect(await mutate(mixed, (o) => { review(o).documents = 3; })).toContain("every_document_accounted");
    });
    it("duplicate input documents must each be accounted for", async () => {
      const dup = { documents: [doc("1"), doc("1")] };
      expect(await mutate(dup, () => {})).toEqual([]);
      expect(await mutate(dup, (o) => { ledger(o).ledger_rows.pop(); ledger(o).documents = 1; ledger(o).totals_by_currency = [{ currency: "SAR", total: 100, count: 1 }]; })).toEqual(expect.arrayContaining(["every_document_accounted", "ledger_rows_exact", "totals_per_currency"]));
    });
  });
});

describe("sample-trial drift against the compiled pack", () => {
  const followUp = getPack("customer-follow-up", 1)!;
  const params: PackParams = { approvedInfo: "Our monthly plan price is 300 SAR.", currencies: ["SAR"], language: "en" };
  const compiled = () => structuredClone(followUp.compile(params, (id) => id)) as FlowGraph;
  const cfg = (g: FlowGraph, id: string) => g.nodes.find((n) => n.id === id)!.data.config as unknown as Record<string, unknown>;

  it("every pack's own compiled graph is sample-safe, also with person-chosen labels and positions", () => {
    for (const p of PACKS) {
      const g = structuredClone(p.compile(params, (id) => `Label ${id}`));
      for (const n of g.nodes) n.position = { x: n.position.x + 17, y: -3 };
      for (const n of g.nodes) if (n.type === "trigger.manual") (n.data.config as { samplePayload?: string }).samplePayload = "{}";
      g.edges.reverse().forEach((e, i) => { e.id = `renamed-${i}`; });
      expect(sampleTrialDrift(p, params, g), p.id).toEqual([]);
    }
  });
  it("an edited data.store namespace / key / value / op is drift", () => {
    for (const [k, v] of [["namespace", "crm_customers"], ["key", '"customer-42"'], ["value", "request"], ["op", "del"]] as const) {
      const g = compiled();
      cfg(g, "record")[k] = v;
      expect(sampleTrialDrift(followUp, params, g), k).toEqual(["record"]);
    }
  });
  it("an edited upstream expression (which computes the store key) is drift", () => {
    const g = compiled();
    cfg(g, "draft").expression = '$merge([$, { "record": { "store_key": "customer-42" } }])';
    expect(sampleTrialDrift(followUp, params, g)).toEqual(["draft"]);
  });
  it("added, removed, duplicated, retyped nodes and rewired edges are drift", () => {
    const added = compiled();
    added.nodes.push({ ...structuredClone(added.nodes.find((n) => n.id === "record")!), id: "record-2" });
    expect(sampleTrialDrift(followUp, params, added)).toContain("record-2");
    const removed = compiled();
    removed.nodes = removed.nodes.filter((n) => n.id !== "record");
    expect(sampleTrialDrift(followUp, params, removed)).toContain("record");
    const dup = compiled();
    dup.nodes.push(structuredClone(dup.nodes.find((n) => n.id === "record")!));
    expect(sampleTrialDrift(followUp, params, dup)).toContain("record");
    const retyped = compiled();
    retyped.nodes.find((n) => n.id === "facts")!.type = "output";
    expect(sampleTrialDrift(followUp, params, retyped)).toContain("facts");
    const rewired = compiled();
    rewired.edges.find((e) => e.target === "record")!.source = "extract";
    expect(sampleTrialDrift(followUp, params, rewired)).toEqual(["edges"]);
  });
  it("a draft compiled from different params is drift", () => {
    const other = structuredClone(followUp.compile({ ...params, approvedInfo: "Delivery is free." }, (id) => id)) as FlowGraph;
    expect(sampleTrialDrift(followUp, params, other).length).toBeGreaterThan(0);
  });
  it("allows terminal output edits and harmless output-field overlays while keeping stored key data pinned", () => {
    const terminal = compiled();
    (terminal.nodes.find((n) => n.id === "reply")!.data.config as { expression: string }).expression = '"edited sample output"';
    expect(sampleTrialDrift(followUp, params, terminal)).toEqual([]);

    const overlay = compiled();
    const draft = cfg(overlay, "draft");
    draft.expression = `$merge([(${String(draft.expression)}), { "reply": "edited sample output", "used_lines": [] }])`;
    expect(sampleTrialDrift(followUp, params, overlay)).toEqual([]);

    const changesStoreValue = compiled();
    const changedDraft = cfg(changesStoreValue, "draft");
    changedDraft.expression = `$merge([(${String(changedDraft.expression)}), { "record": {} }])`;
    expect(sampleTrialDrift(followUp, params, changesStoreValue)).toContain("draft");
  });
  it("an output overlay on a node UPSTREAM of the store feeder is drift (it could unlabel the sample record or move its key)", () => {
    // `draft` builds record.store_key from `sample` + `id` and record.sample from `sample`; neither key is a root the
    // store reads, so an overlay on `extract` would pass the root check and write under a real customer's key.
    const unlabelled = compiled();
    const extract = cfg(unlabelled, "extract");
    extract.expression = `$merge([(${String(extract.expression)}), { "sample": false, "id": "other-request-id" }])`;
    expect(sampleTrialDrift(followUp, params, unlabelled)).toEqual(["extract"]);

    const replacesRequest = compiled();
    const facts = cfg(replacesRequest, "facts");
    facts.expression = `$merge([(${String(facts.expression)}), { "request": { "id": "other", "sample": false } }])`;
    expect(sampleTrialDrift(followUp, params, replacesRequest)).toEqual(["facts"]);

    // Even a harmless-looking overlay is refused upstream: only the direct store feeder may carry one.
    const harmless = compiled();
    const ex = cfg(harmless, "extract");
    ex.expression = `$merge([(${String(ex.expression)}), { "note": "x" }])`;
    expect(sampleTrialDrift(followUp, params, harmless)).toEqual(["extract"]);
  });
  it("permits registered local type changes for packs with no store side effect", () => {
    const noStore = getPack("customer-triage", 1)!;
    const graph = structuredClone(noStore.compile(params, (id) => id));
    graph.nodes.find((n) => n.id === "extract")!.type = "logic.condition";
    expect(sampleTrialDrift(noStore, params, graph)).toEqual([]);
    graph.nodes.find((n) => n.id === "extract")!.type = "http.request";
    expect(sampleTrialDrift(noStore, params, graph)).toContain("extract");
  });
});
