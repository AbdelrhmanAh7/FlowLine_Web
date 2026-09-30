import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { validateGraph } from "@/engine/validate";
import { EXPRESSION_MAX_LENGTH } from "@/engine/expression";
import { customerFollowUpPack as pack } from "@/company-builder/packs/customer-follow-up";
import { FOLLOW_UP_FIXTURES, FOLLOW_UP_PARAMS } from "../fixtures/company-builder/customer-follow-up.fixtures";
import { memoryStore } from "../fixtures/company-builder/store-stub";

const params = { ...FOLLOW_UP_PARAMS, services: [...FOLLOW_UP_PARAMS.services], requiredDetails: [...FOLLOW_UP_PARAMS.requiredDetails], language: "en" };

describe("Customer Request Follow-up — frozen acceptance fixtures (first vertical slice)", () => {
  const graph = pack.compile(params, (id) => id);

  it("compiles to registered local steps only, validates, and stays within expression limits", () => {
    expect(validateGraph(graph)).toEqual([]);
    for (const n of graph.nodes) expect(pack.nodeTypes).toContain(n.type);
    for (const n of graph.nodes) {
      const e = (n.data.config as { expression?: string }).expression;
      if (e) expect(e.length).toBeLessThanOrEqual(EXPRESSION_MAX_LENGTH);
    }
  });

  for (const f of FOLLOW_UP_FIXTURES) {
    it(`${f.id}: business result matches the frozen expectation`, async () => {
      const store = memoryStore();
      const r = await executeGraph(graph, f.input, { handler: store.handler });
      expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
      const o = r.output as Record<string, Record<string, unknown>>;
      const e = f.expect;
      const out = o[e.outcome]!;
      expect(out, `expected ${e.outcome}`).toBeTruthy();
      expect(o[e.outcome === "reply_draft" ? "needs_person" : "reply_draft"]).toBeUndefined();
      expect(out.language).toBe(e.language);
      expect(out.suspicious).toBe(e.suspicious);
      if (e.reason) expect(out.reason).toBe(e.reason);
      for (const s of e.mustInclude ?? []) expect(String(out.body)).toContain(s);
      for (const s of e.mustNotInclude ?? []) expect(String(out.body ?? "")).not.toContain(s);
      const rec = o.follow_up_record as Record<string, unknown>;
      expect(rec.detected).toEqual(e.detected);
      expect(rec.missing).toEqual(e.missing);
      expect(rec.status).toBe(e.record.status);
      expect(rec.key).toBe(e.record.key);
      expect(rec.next_follow_up_at).toBe(e.record.nextFollowUpAt);
      expect(store.entries.get(`cb_customer_follow_ups/${e.record.key}`)).toEqual(rec);
      // Independent objective checks must all pass too.
      const checks = pack.evaluate(r.output, f.input, params);
      expect(checks.filter((c) => !c.passed)).toEqual([]);
    });
  }

  it("a duplicate event updates the SAME follow-up record (no second record)", async () => {
    const store = memoryStore();
    const f = FOLLOW_UP_FIXTURES[0]!;
    await executeGraph(graph, f.input, { handler: store.handler });
    await executeGraph(graph, f.input, { handler: store.handler });
    expect([...store.entries.keys()].filter((k) => k.endsWith("/fu-01"))).toHaveLength(1);
  });

  it("objective checks catch a wrong result that is still valid JSON (invented price, wrong recipient, no record)", () => {
    const f = FOLLOW_UP_FIXTURES[1]!;
    const wrong = { reply_draft: { to: "someone-else@example.com", body: "Hello, carpet cleaning costs 99 SAR.", used_lines: ["Carpet cleaning costs 99 SAR."], asked_for: [], status: "sent" } };
    const failed = pack.evaluate(wrong, f.input, params).filter((c) => !c.passed).map((c) => c.id).sort();
    expect(failed).toEqual(["asks_for_missing_details", "details_extracted_correctly", "follow_up_recorded", "no_invented_numbers", "record_status_consistent", "reply_only_approved_info", "reply_to_sender", "review_required"].sort());
  });

  it("the generic per-business fixtures also pass, with other params (Arabic, no approved info)", async () => {
    for (const p of [params, { ...params, language: "ar" }, { approvedInfo: "", services: [], requiredDetails: ["phone"], language: "en" }]) {
      const g = pack.compile(p, (id) => id);
      const sample = pack.sample(p);
      const s = await executeGraph(g, sample, { handler: memoryStore().handler });
      expect(s.status).toBe("succeeded");
      expect(pack.evaluate(s.output, sample, p).filter((c) => !c.passed)).toEqual([]);
      for (const fx of pack.fixtures(p)) {
        const r = await executeGraph(g, fx.input, { handler: memoryStore().handler });
        expect(r.status, fx.id).toBe("succeeded");
        expect(fx.expect(r.output).every((c) => c.passed), fx.id).toBe(true);
      }
    }
  });
});
