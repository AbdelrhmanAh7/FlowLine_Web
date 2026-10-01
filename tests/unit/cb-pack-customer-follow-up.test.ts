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

describe("Customer Request Follow-up — independent review regressions (Fable, FB-*)", () => {
  const graph = pack.compile(params, (id) => id);
  const run = async (request: Record<string, unknown>, p: Record<string, unknown> = params) => {
    const g = p === params ? graph : pack.compile(p as never, (id) => id);
    const r = await executeGraph(g, { request }, { handler: memoryStore().handler });
    return { r, o: r.output as Record<string, Record<string, unknown>> };
  };
  const base = { id: "rv-1", from: "rv@example.com", received_at: "2026-10-01T09:00:00+03:00", subject: "Request", body: "How much does deep cleaning cost? 2026-10-05, 0551234567" };
  const failing = (o: Record<string, unknown>, request: Record<string, unknown>) => pack.evaluate(o, { request }, params).filter((c) => !c.passed).map((c) => c.id);
  const tamper = async (patch: (o: Record<string, Record<string, unknown>>) => void, request: Record<string, unknown> = base) => {
    const { o } = await run(request);
    expect(failing(o, request)).toEqual([]); // the untouched result passes
    const bad = structuredClone(o);
    patch(bad);
    return failing(bad, request);
  };

  it("FB-01: an invented commitment with no claimed lines fails (the reply text is recomputed, not trusted)", async () => {
    expect(await tamper((o) => Object.assign(o.reply_draft!, { body: "Hello,\n\nWe guarantee a full refund and free carpet cleaning forever.\n\nThanks", used_lines: [] }))).toContain("reply_only_approved_info");
  });
  it("FB-01: an invented price made of digits that appear elsewhere in the approved info fails", async () => {
    const f = await tamper((o) => Object.assign(o.reply_draft!, { body: "Carpet cleaning costs 8 SAR per 2 metres." }));
    expect(f).toEqual(expect.arrayContaining(["reply_only_approved_info", "no_invented_numbers"]));
  });
  it("FB-01: an approved line from another topic fails", async () => {
    expect(await tamper((o) => Object.assign(o.reply_draft!, { body: `${o.reply_draft!.body}\n\nWe serve Riyadh and Diriyah only.` }))).toContain("reply_only_approved_info");
  });
  it("FB-01: an invented Arabic-Indic price fails the number check", async () => {
    expect(await tamper((o) => Object.assign(o.reply_draft!, { body: `${o.reply_draft!.body} السعر ٩٩ ريال` }))).toContain("no_invented_numbers");
  });
  it("FB-01: a wrong follow-up time or customer in the record fails", async () => {
    expect(await tamper((o) => Object.assign(o.follow_up_record!, { next_follow_up_at: "1999-01-01T00:00:00.000Z" }))).toContain("follow_up_recorded");
    expect(await tamper((o) => Object.assign(o.follow_up_record!, { customer: "someone@else.example" }))).toContain("follow_up_recorded");
  });
  it("FB-01: a reply where a hand-off is expected (or the wrong hand-off reason) fails", async () => {
    const complaint = { ...base, body: "Your team damaged my desk and I am angry." };
    expect(await tamper((o) => Object.assign(o.needs_person!, { reason: "no_approved_information" }), complaint)).toContain("handoff_has_reason");
  });
  it("FB-05: a reply with no recipient fails reply_to_sender", async () => {
    const req = { ...base, from: undefined };
    const { o } = await run(req);
    expect(failing(o, req)).toContain("reply_to_sender");
  });
  it("FB-02: approved information is split per line only; abbreviations never cut a sentence", async () => {
    const p = { ...params, approvedInfo: "We work 8 a.m. to 6 p.m. Saturday to Thursday.\nPrices incl. VAT start at 450 SAR." };
    const { o } = await run({ ...base, body: "What are your working hours for deep cleaning?" }, p);
    expect(String(o.reply_draft!.body)).toContain("We work 8 a.m. to 6 p.m. Saturday to Thursday.");
  });
  it("FB-03: a non-ISO received time never crashes the run; no follow-up time is invented", async () => {
    for (const received_at of ["garbage", 5, "Wed, 1 Oct 2026 09:00:00 +0300"]) {
      const req = { ...base, received_at };
      const { r, o } = await run(req);
      expect(r.status, String(received_at)).toBe("succeeded");
      expect(o.follow_up_record!.next_follow_up_at ?? null).toBeNull();
      expect(failing(o, req)).toEqual([]);
    }
  });
  it("FB-06: keywords match at word starts only (Arabic and English)", async () => {
    const { o } = await run({ ...base, body: "أبغى تنظيف سجاد الحين" });
    expect(o.follow_up_record!.topic).not.toBe("coverage");
    const { o: o2 } = await run({ ...base, body: "I discover your deep cleaning is great, can I book?" });
    expect(o2.follow_up_record!.topic).not.toBe("coverage");
  });
  it("FB-07: Persian digits are normalised like Arabic-Indic digits", async () => {
    const req = { ...base, body: "deep cleaning ۲۰۲۶-۱۰-۰۵ رقمي ۰۵۵۱۲۳۴۵۶۷" };
    const { o } = await run(req);
    expect(o.follow_up_record!.detected).toEqual({ service: "deep cleaning", phone: "0551234567", date: "2026-10-05" });
    expect(failing(o, req)).toEqual([]);
  });
});
