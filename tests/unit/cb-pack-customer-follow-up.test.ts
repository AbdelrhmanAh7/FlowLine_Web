import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { validateGraph } from "@/engine/validate";
import { EXPRESSION_MAX_LENGTH } from "@/engine/expression";
import { customerFollowUpPack as pack, REFUND_NOTE } from "@/company-builder/packs/customer-follow-up";
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
    // consequential_needs_person added 2026-10-01 (refund/cancellation rule): it also fails because there is no record.
    expect(failed).toEqual(["asks_for_missing_details", "consequential_needs_person", "details_extracted_correctly", "follow_up_recorded", "no_invented_numbers", "record_status_consistent", "reply_only_approved_info", "reply_to_sender", "review_required"].sort());
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

describe("Customer Request Follow-up — owner decisions 2026-10-01", () => {
  const scoped = { ...params, recordScope: "11111111-2222-4333-8444-555555555555" };
  const graph = pack.compile(scoped, (id) => id);
  const run = async (request: Record<string, unknown>, p: Record<string, unknown> = scoped, store = memoryStore()) => {
    const g = p === scoped ? graph : pack.compile(p as never, (id) => id);
    const r = await executeGraph(g, { request }, { handler: store.handler });
    return { r, o: r.output as Record<string, Record<string, unknown>>, store };
  };
  const base = { id: "od-1", from: "od@example.com", received_at: "2026-10-01T09:00:00+03:00", subject: "Request" };
  const failing = (o: Record<string, unknown>, request: Record<string, unknown>, p: Record<string, unknown> = scoped) => pack.evaluate(o, { request }, p as never).filter((c) => !c.passed).map((c) => c.id);

  describe("refund and cancellation requests always need a person (REF-*)", () => {
    for (const [name, body] of [
      ["English refund", "I want a refund for my deep cleaning booking"],
      ["English cancellation", "Please cancel my deep cleaning visit"],
      ["Arabic refund", "أريد استرداد المبلغ لحجز تنظيف عميق"],
      ["Arabic cancellation", "أرغب في إلغاء موعد تنظيف عميق"],
    ] as const) {
      it(`${name}: flagged for a person, approved policy only, no promise, waits for review`, async () => {
        const req = { ...base, body };
        const { r, o } = await run(req);
        expect(r.status).toBe("succeeded");
        const reply = o.reply_draft!;
        expect(reply.consequential).toBe("refund_or_cancellation");
        expect(reply.status).toBe("awaiting_review");
        expect(o.follow_up_record).toMatchObject({ consequential: "refund_or_cancellation", requires_human_decision: true, status: "awaiting_review" });
        const text = String(reply.body);
        expect(text).toContain("Cancellations are free up to 24 hours before the visit."); // approved policy line only
        expect(text).toMatch(/The business owner decides this refund or cancellation request\.|قرار طلب الاسترداد أو الإلغاء هذا يعود إلى مالك المشروع\./);
        expect(text).toMatch(/Nothing has been refunded or cancelled\.|لم يتم أي استرداد أو إلغاء\./);
        for (const promise of [/we (will|have) refund/i, /refund (has been|was) (issued|processed|made)/i, /you will (get|receive) your money/i, /تم (الاسترداد|استرداد المبلغ|إلغاء)/]) expect(text).not.toMatch(promise);
        expect(failing(o, req)).toEqual([]);
      });
    }
    it("REF-NOTE: the fixed note names the business owner as the decision maker and promises no outcome (ar and en)", () => {
      expect(Object.keys(REFUND_NOTE).sort()).toEqual(["ar", "en"]);
      // The owner, never "our team", decides THIS request.
      expect(REFUND_NOTE.en).toMatch(/business owner/i);
      expect(REFUND_NOTE.en).toContain("The business owner decides this refund or cancellation request.");
      expect(REFUND_NOTE.ar).toContain("قرار طلب الاسترداد أو الإلغاء هذا يعود إلى مالك المشروع.");
      expect(REFUND_NOTE.en).not.toMatch(/member of our team|our team will|next step/i);
      expect(REFUND_NOTE.ar).not.toMatch(/فريقنا|الخطوة التالية/);
      for (const lang of ["en", "ar"] as const) {
        const note = REFUND_NOTE[lang];
        expect(note, lang).not.toBe("");
        expect(note, lang).not.toMatch(/\d/); // no numbers, like every fixed approved sentence
        for (const promise of [
          /we (will|have|are going to) (refund|cancel)/i,
          /will be (refunded|cancelled)/i,
          /refund (has been|was|is|will be) (issued|processed|made|approved)/i,
          /cancellation is (approved|confirmed|accepted)/i,
          /your (refund|cancellation) is (approved|confirmed)/i,
          /you will (get|receive) your money/i,
          /تم (الاسترداد|الإلغاء|إلغاء)/,
          /سيتم (الاسترداد|الإلغاء|إلغاء)/,
          /تمت الموافقة/,
          /الموافقة على/,
          /ستصلك (أموالك|المبلغ)/,
        ]) expect(note, `${lang}: ${promise}`).not.toMatch(promise);
      }
    });
    it("VP-05/VP-06 scorer: excluding REFUND_NOTE non-promise sentence prevents false positive mustNotPromise matches", () => {
      // The scorer excludes the non-promise sentence so "refunded" and "cancelled" do not trigger mustNotPromise
      const stripped = REFUND_NOTE.en.toLowerCase().replace("nothing has been refunded or cancelled", "");
      const vp05MustNotPromise = ["we will refund", "refund has been issued", "refunded", "you will receive your money"];
      const vp06MustNotPromise = ["cancelled", "has been cancelled"];
      for (const term of [...vp05MustNotPromise, ...vp06MustNotPromise]) {
        expect(stripped).not.toContain(term);
      }
    });
    it("the flow can't act on a refund: it has no step that can reach money, payments or accounts", () => {
      for (const n of graph.nodes) expect(["trigger.manual", "transform.json", "logic.condition", "data.store", "output"]).toContain(n.type);
    });
    it("a tampered draft that drops the flag or promises a refund fails the objective checks", async () => {
      const req = { ...base, body: "I want a refund please" };
      const { o } = await run(req);
      const dropped = structuredClone(o);
      dropped.reply_draft!.consequential = null;
      dropped.follow_up_record!.requires_human_decision = false;
      expect(failing(dropped, req)).toContain("consequential_needs_person");
      const promised = structuredClone(o);
      promised.reply_draft!.body = "Hello,\n\nWe have refunded your payment.\n\nThank you — we'll confirm the details with you.";
      expect(failing(promised, req)).toContain("reply_only_approved_info");
      const skipped = structuredClone(o);
      skipped.reply_draft!.status = "approved";
      expect(failing(skipped, req)).toEqual(expect.arrayContaining(["review_required", "consequential_needs_person"]));
    });
    it("a non-refund request is not flagged", async () => {
      const req = { ...base, body: "How much does deep cleaning cost?" };
      const { o } = await run(req);
      expect(o.follow_up_record).toMatchObject({ consequential: null, requires_human_decision: false });
      expect(failing(o, req)).toEqual([]);
    });
  });

  describe("phone numbers as people write them (PH-*)", () => {
    for (const [written, phone] of [
      ["+20 10 1234 5678", "+201012345678"],
      ["010 1234 5678", "01012345678"],
      ["+966 55 123 4567", "+966551234567"],
      ["055-123-4567", "0551234567"],
      ["(055) 123 4567", "0551234567"],
      ["+٢٠ ١٠ ١٢٣٤ ٥٦٧٨", "+201012345678"],
    ] as const) {
      it(`"${written}" → ${phone} (display kept as written)`, async () => {
        const req = { ...base, body: `deep cleaning on 2026-10-05, call me on ${written} thanks` };
        const { o } = await run(req);
        expect((o.follow_up_record!.detected as { phone: string }).phone).toBe(phone);
        expect(o.follow_up_record!.phone_display).toBe(written.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/^\(/, "(").trim());
        expect(failing(o, req)).toEqual([]);
      });
    }
    it("nothing unrelated is merged and no country code is guessed", async () => {
      for (const body of ["2 bedrooms, 3 bathrooms, 450 SAR, deep cleaning", "deep cleaning at 08:00 to 12:30 please", "deep cleaning, order 12 34 56", "deep cleaning 1012345678"]) {
        const req = { ...base, body };
        const { o } = await run(req);
        const phone = (o.follow_up_record!.detected as { phone: string | null }).phone;
        if (body.endsWith("1012345678")) expect(phone).toBe("1012345678"); // as written: no "+20" or "0" added
        else expect(phone, body).toBeNull();
        expect(failing(o, req), body).toEqual([]);
      }
    });
  });

  describe("follow-up records are scoped to the interview (KEY-*)", () => {
    it("two interviews in one workspace never overwrite each other; retries update the same record", async () => {
      const store = memoryStore();
      const a = { ...params, recordScope: "aaaaaaaa-0000-4000-8000-000000000001" };
      const b = { ...params, recordScope: "bbbbbbbb-0000-4000-8000-000000000002" };
      const req = { ...base, body: "How much does deep cleaning cost?", sample: true };
      for (const p of [a, b, a, b]) await run(req, p, store); // two trials each (retry/refresh)
      expect([...store.entries.keys()].sort()).toEqual(["cb_customer_follow_ups/aaaaaaaa-0000-4000-8000-000000000001/sample:od-1", "cb_customer_follow_ups/bbbbbbbb-0000-4000-8000-000000000002/sample:od-1"]);
    });
    it("an unsafe scope is ignored rather than embedded", async () => {
      const p = { ...params, recordScope: 'x"; $eval("1") ; "' };
      const req = { ...base, body: "How much does deep cleaning cost?" };
      const { o, store } = await run(req, p);
      expect([...store.entries.keys()]).toEqual(["cb_customer_follow_ups/od-1"]);
      expect(failing(o, req, p)).toEqual([]);
    });
  });
});

describe("validation finding VF-01 — quote the price of the service asked about, never another service's", () => {
  const p = {
    approvedInfo: "Deep cleaning for a 2-bedroom apartment costs 1500 EGP.\nOffice cleaning starts at 900 EGP per visit.\nWe work Saturday to Thursday, 9:00 to 18:00.",
    services: ["deep cleaning|تنظيف عميق", "office cleaning|تنظيف مكاتب"],
    requiredDetails: ["service", "date", "phone"],
    followUpHours: 24,
    timezone: "Africa/Cairo",
    language: "ar",
  };
  const g = pack.compile(p, (id) => id);
  const ask = async (body: string) => {
    const input = { request: { id: "vf", from: "vf@example.com", received_at: "2026-10-01T11:00:00+03:00", subject: "طلب", body } };
    const r = await executeGraph(g, input, { handler: memoryStore().handler });
    const o = r.output as Record<string, Record<string, unknown>>;
    return { body: String(o.reply_draft?.body ?? ""), failed: pack.evaluate(o, input, p).filter((c) => !c.passed).map((c) => c.id) };
  };
  it("an amount with a currency makes a line a price line; an Arabic office-price question gets the office price only", async () => {
    const r = await ask("أحتاج تنظيف مكاتب يوم 2026-10-09، رقمي 01123456789، كم السعر؟");
    expect(r.body).toContain("Office cleaning starts at 900 EGP per visit.");
    expect(r.body).not.toContain("1500");
    expect(r.failed).toEqual([]);
  });
  it("a price question naming no service still gets every approved price line", async () => {
    const r = await ask("How much do you charge?");
    expect(r.body).toContain("1500 EGP");
    expect(r.body).toContain("900 EGP");
    expect(r.failed).toEqual([]);
  });
});
