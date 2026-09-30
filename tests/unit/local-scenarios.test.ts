import { describe, expect, it } from "vitest";
import { executeGraph, sampleInputFor } from "@/engine/execute";
import { LOCAL_SCENARIOS } from "@/engine/local-scenarios";
import { LANDING_TEMPLATE_IDS, LANDING_TEMPLATES, LOCAL_TEMPLATES, onboardingTemplates } from "@/engine/templates";
import type { FlowGraph } from "@/engine/types";
import { NONDETERMINISTIC, validateGraph } from "@/engine/validate";
import { ar as arMessages } from "@/i18n/messages/ar";
import { en as enMessages } from "@/i18n/messages/en";
import { localizeTemplate } from "@/i18n/template-text";
import { createTranslator } from "@/i18n/translate";

/**
 * The everyday local scenarios run for real through the engine (no host handler, so no I/O is possible):
 * the default sample, an alternate input and an empty input each, plus date-window boundaries, rounding,
 * duplicates, source immutability and EN/AR catalogue completeness.
 */

const NEW_IDS = [
  "low-stock-list",
  "invoice-follow-up-list",
  "quote-calculator",
  "order-packing-list",
  "expense-category-summary",
  "subscription-review",
  "weekly-task-plan",
  "event-attendee-summary",
  "registration-check",
  "contact-list-cleanup",
  "support-backlog-summary",
  "survey-score-summary",
];
const LOCAL_NODE_TYPES = new Set(["trigger.manual", "transform.json", "data.filter", "logic.condition", "output"]);
const ARABIC = /[؀-ۿ]/;

const tpl = (id: string) => LOCAL_TEMPLATES.find((t) => t.id === id)!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sample payloads are free-form JSON
const sample = (id: string): any => structuredClone(sampleInputFor(tpl(id).graph));
async function run(id: string, input?: unknown) {
  const graph = tpl(id).graph;
  const res = await executeGraph(graph, input === undefined ? sampleInputFor(graph) : input);
  expect(res.error, `${id}: ${JSON.stringify(res.error)}`).toBeNull();
  expect(res.status).toBe("succeeded");
  return res.output as Record<string, Record<string, unknown>>;
}

describe("local template catalogue", () => {
  it("keeps the original three first, then appends the twelve scenarios", () => {
    expect(LOCAL_TEMPLATES.map((t) => t.id)).toEqual(["lead-qualifier", "ticket-priority", "order-totals", ...NEW_IDS]);
    expect(LOCAL_SCENARIOS.map((t) => t.id)).toEqual(NEW_IDS);
    expect(new Set(LOCAL_TEMPLATES.map((t) => t.id)).size).toBe(LOCAL_TEMPLATES.length);
  });

  for (const t of LOCAL_SCENARIOS) {
    it(`${t.id}: valid, local-only, deterministic, and read by node id`, () => {
      expect(validateGraph(t.graph)).toEqual([]);
      for (const n of t.graph.nodes) expect(LOCAL_NODE_TYPES.has(n.type), `${t.id}/${n.id} is ${n.type}`).toBe(true);
      const config = JSON.stringify(t.graph.nodes.map((n) => n.data.config));
      expect(config).not.toMatch(NONDETERMINISTIC); // explicit dates in the sample, never "today"
      expect(config).not.toMatch(/REPLACE_WITH_/);
      // Merge keys are node labels, which are translated in Arabic flows; scenarios never depend on labels.
      expect(t.graph.nodes.some((n) => n.type === "data.merge")).toBe(false);
      expect(t.graph.nodes.filter((n) => n.type === "trigger.manual")).toHaveLength(1);
      expect(t.graph.nodes.filter((n) => n.type === "output").length).toBeGreaterThanOrEqual(1);
    });
  }

  it("the sample and result explanations make no send/buy/book/approve/cancel claims", () => {
    for (const t of LOCAL_SCENARIOS) {
      const text = `${t.name} ${t.sample} ${t.result} ${t.graph.nodes.map((n) => n.data.label).join(" ")}`;
      expect(text, t.id).not.toMatch(/\b(sends?|sent to|emails? (?:the|your)|buys?|purchases?|books?|booked|approves?|approved|cancels?)\b/i);
    }
  });

  it("order-totals: honest description and branch label; ids, keys and behaviour unchanged", async () => {
    const t = tpl("order-totals");
    expect(t.description).not.toMatch(/discount rule/i);
    expect(t.description).toMatch(/No discount is applied/);
    const ok = t.graph.nodes.find((n) => n.id === "ok")!;
    expect(ok.data.label).toBe("No review needed");
    expect(ok.data.config).toEqual({ key: "approved", expression: "" });
    expect(await run("order-totals")).toEqual({ review: { total: 298.5, lines: 2 } });
    expect(await run("order-totals", { items: [{ sku: "A-1", qty: 2, price: 10 }] })).toEqual({ approved: { total: 20, lines: 1 } });
  });

  it("running every template leaves the template and its sample untouched", async () => {
    const before = structuredClone(LOCAL_TEMPLATES);
    for (const t of LOCAL_TEMPLATES) {
      const input = sampleInputFor(t.graph);
      const frozen = structuredClone(input);
      await executeGraph(t.graph, input);
      expect(input, t.id).toEqual(frozen);
    }
    expect(LOCAL_TEMPLATES).toEqual(before);
  });

  it("an Arabic-created flow (translated labels) saves exactly the English result", async () => {
    const ar = createTranslator("ar");
    for (const t of LOCAL_SCENARIOS) {
      const arabic = localizeTemplate(ar, t).graph as FlowGraph;
      expect(arabic.nodes.every((n) => ARABIC.test(n.data.label)), t.id).toBe(true);
      const [a, e] = await Promise.all([executeGraph(arabic, sampleInputFor(arabic)), executeGraph(t.graph, sampleInputFor(t.graph))]);
      expect(a.status, t.id).toBe("succeeded");
      expect(a.output, t.id).toEqual(e.output);
    }
  });
});

describe("EN/AR text for every local template", () => {
  type Entry = { name: string; description: string; sample: string; result: string; nodes: Record<string, string> };
  const enCat = (enMessages as unknown as { localTemplates: Record<string, Entry> }).localTemplates;
  const arCat = (arMessages as unknown as { localTemplates: Record<string, Entry> }).localTemplates;
  const fields = ["name", "description", "sample", "result"] as const;

  for (const t of LOCAL_TEMPLATES) {
    it(`${t.id}: English is the template's own text; Arabic is complete`, () => {
      for (const f of fields) {
        expect(enCat[t.id]?.[f], `${t.id}.${f}`).toBe(t[f]);
        expect(arCat[t.id]?.[f], `${t.id}.${f}`).toMatch(ARABIC);
      }
      expect(Object.keys(arCat[t.id]!.nodes).sort()).toEqual(t.graph.nodes.map((n) => n.id).sort());
      expect(Object.keys(enCat[t.id]!.nodes).sort()).toEqual(t.graph.nodes.map((n) => n.id).sort());
    });
  }

  it("no catalogue entries for templates that don't exist", () => {
    const ids = LOCAL_TEMPLATES.map((t) => t.id).sort();
    expect(Object.keys(enCat).sort()).toEqual(ids);
    expect(Object.keys(arCat).sort()).toEqual(ids);
  });

  it("every category used has both translations", () => {
    for (const t of LOCAL_TEMPLATES) {
      expect((enMessages.templateCategory as Record<string, string>)[t.category], t.category).toBe(t.category);
      expect((arMessages.templateCategory as Record<string, string>)[t.category], t.category).toMatch(ARABIC);
    }
  });
});

describe("curated lists", () => {
  it("the landing page shows 3–6 existing templates, each once", () => {
    expect(LANDING_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(LANDING_TEMPLATES.length).toBeLessThanOrEqual(6);
    expect(new Set(LANDING_TEMPLATE_IDS).size).toBe(LANDING_TEMPLATE_IDS.length);
    expect(LANDING_TEMPLATES.every(Boolean)).toBe(true);
  });

  it("onboarding suggests at most three, goal matches first", () => {
    expect(onboardingTemplates("sales").map((t) => t.id)).toEqual(["lead-qualifier", "quote-calculator", "contact-list-cleanup"]);
    expect(onboardingTemplates("support").map((t) => t.id)).toEqual(["ticket-priority", "registration-check", "support-backlog-summary"]);
    expect(onboardingTemplates("data")[0]!.id).toBe("order-totals");
    // Only one engineering-goal template: it comes first, topped up with general ones.
    expect(onboardingTemplates("engineering").map((t) => t.id)).toEqual(["weekly-task-plan", "lead-qualifier", "ticket-priority"]);
    expect(onboardingTemplates(null).map((t) => t.id)).toEqual(["lead-qualifier", "ticket-priority", "order-totals"]);
    for (const goal of ["sales", "support", "data", "engineering"] as const) {
      const list = onboardingTemplates(goal);
      expect(list).toHaveLength(3);
      expect(list[0]!.goal).toBe(goal);
    }
  });
});

describe("low-stock-list", () => {
  it("default: items at or below the reorder level, largest shortfall first (equal counts as low)", async () => {
    expect(await run("low-stock-list")).toEqual({
      restock_list: {
        count: 3,
        items: [
          { sku: "FL-101", name: "Paper cups (pack of 50)", onHand: 4, reorderLevel: 10, shortBy: 6 },
          { sku: "FL-104", name: "Napkins (pack of 200)", onHand: 0, reorderLevel: 5, shortBy: 5 },
          { sku: "FL-103", name: "Oat milk 1 L", onHand: 6, reorderLevel: 6, shortBy: 0 },
        ],
      },
    });
  });
  it("alternate: everything above its level takes the other branch; a one-item list stays a list", async () => {
    expect(await run("low-stock-list", { products: [{ sku: "A", onHand: 9, reorderLevel: 3 }, { sku: "B", onHand: 1, reorderLevel: 0 }] })).toEqual({ all_stocked: { checked: 2 } });
    const one = await run("low-stock-list", { products: [{ sku: "A", name: "A", onHand: "2", reorderLevel: "3" }] });
    expect(one.restock_list!.items).toEqual([{ sku: "A", name: "A", onHand: 2, reorderLevel: 3, shortBy: 1 }]);
  });
  it("ties are ordered by SKU", async () => {
    const out = await run("low-stock-list", { products: [{ sku: "Z", onHand: 1, reorderLevel: 3 }, { sku: "A", onHand: 0, reorderLevel: 2 }] });
    expect((out.restock_list!.items as { sku: string }[]).map((i) => i.sku)).toEqual(["A", "Z"]);
  });
  it("empty or missing list", async () => {
    expect(await run("low-stock-list", { products: [] })).toEqual({ all_stocked: { checked: 0 } });
    expect(await run("low-stock-list", {})).toEqual({ all_stocked: { checked: 0 } });
  });
});

describe("invoice-follow-up-list", () => {
  it("default: unpaid and strictly before the check date; due today is not overdue", async () => {
    expect(await run("invoice-follow-up-list")).toEqual({
      follow_up: {
        asOf: "2026-09-30",
        currency: "USD",
        count: 2,
        totalDue: 1615.25,
        invoices: [
          { number: "INV-1041", customer: "Cedar Studio", amount: 1200, dueDate: "2026-09-10", daysOverdue: 20 },
          { number: "INV-1044", customer: "Oasis Florist", amount: 415.25, dueDate: "2026-09-22", daysOverdue: 8 },
        ],
      },
    });
  });
  it("date boundary: one day later, the invoice due that day becomes 1 day overdue", async () => {
    const input = sample("invoice-follow-up-list");
    input.asOf = "2026-10-01";
    const out = (await run("invoice-follow-up-list", input)).follow_up!;
    expect((out.invoices as { number: string; daysOverdue: number }[]).map((i) => [i.number, i.daysOverdue])).toEqual([["INV-1041", 21], ["INV-1044", 9], ["INV-1042", 1]]);
    expect(out.totalDue).toBe(1965.75);
  });
  it("a missing paid flag counts as unpaid", async () => {
    const out = await run("invoice-follow-up-list", { asOf: "2026-09-30", currency: "USD", invoices: [{ number: "N-1", amount: 10, dueDate: "2026-09-29" }] });
    expect(out.follow_up!.count).toBe(1);
  });
  it("alternate and empty: nothing overdue", async () => {
    const input = sample("invoice-follow-up-list");
    for (const inv of input.invoices) inv.paid = true;
    expect(await run("invoice-follow-up-list", input)).toEqual({ nothing_overdue: { asOf: "2026-09-30", count: 0 } });
    expect(await run("invoice-follow-up-list", { asOf: "2026-09-30", invoices: [] })).toEqual({ nothing_overdue: { asOf: "2026-09-30", count: 0 } });
  });
});

describe("quote-calculator", () => {
  it("default: line totals, subtotal, 10% discount and total to two decimals", async () => {
    expect(await run("quote-calculator")).toEqual({
      quote: {
        customer: "Nile Bakery",
        currency: "USD",
        lines: [
          { item: "Logo design", qty: 1, unitPrice: 250, lineTotal: 250 },
          { item: "Menu printing", qty: 200, unitPrice: 0.35, lineTotal: 70 },
          { item: "Window sticker", qty: 3, unitPrice: 14.99, lineTotal: 44.97 },
        ],
        lineCount: 3,
        subtotal: 364.97,
        discountPercent: 10,
        discount: 36.5,
        total: 328.47,
      },
    });
  });
  it("rounding: a half cent rounds to even, and discount + total always equals the subtotal", async () => {
    const q = (await run("quote-calculator", { currency: "USD", discountPercent: 50, lines: [{ item: "x", qty: 1, unitPrice: 0.25 }] })).quote!;
    expect([q.subtotal, q.discount, q.total]).toEqual([0.25, 0.12, 0.13]);
    const q2 = (await run("quote-calculator", { currency: "USD", discountPercent: 12.5, lines: [{ item: "x", qty: 3, unitPrice: 33.33 }] })).quote!;
    expect(q2.subtotal).toBe(99.99);
    expect(Math.round(((q2.discount as number) + (q2.total as number)) * 100)).toBe(9999);
  });
  it("alternate: no discount given means 0%", async () => {
    const input = sample("quote-calculator");
    delete input.discountPercent;
    const q = (await run("quote-calculator", input)).quote!;
    expect([q.discountPercent, q.discount, q.total]).toEqual([0, 0, 364.97]);
  });
  it("an out-of-range discount or no lines needs a fix", async () => {
    const input = sample("quote-calculator");
    input.discountPercent = 120;
    expect(await run("quote-calculator", input)).toEqual({ needs_fix: { lineCount: 3, discountPercent: 120 } });
    expect(await run("quote-calculator", { discountPercent: 10, lines: [] })).toEqual({ needs_fix: { lineCount: 0, discountPercent: 10 } });
  });
});

describe("order-packing-list", () => {
  it("default: paid orders shipping by the pack date (inclusive), with quantities summed per item", async () => {
    expect(await run("order-packing-list")).toEqual({
      packing_list: {
        packDate: "2026-10-01",
        orderCount: 2,
        orders: ["SO-2201", "SO-2202"],
        pickList: [
          { sku: "MUG-01", name: "Ceramic mug", qty: 3 },
          { sku: "TEA-10", name: "Mint tea tin", qty: 1 },
        ],
      },
    });
  });
  it("date boundary: two days later the later paid order is included too", async () => {
    const input = sample("order-packing-list");
    input.packDate = "2026-10-03";
    const out = (await run("order-packing-list", input)).packing_list!;
    expect(out.orders).toEqual(["SO-2201", "SO-2202", "SO-2204"]);
    expect(out.pickList).toEqual([
      { sku: "BAG-05", name: "Tote bag", qty: 1 },
      { sku: "MUG-01", name: "Ceramic mug", qty: 3 },
      { sku: "TEA-10", name: "Mint tea tin", qty: 1 },
    ]);
  });
  it("a single order with a single item still gives lists", async () => {
    const out = await run("order-packing-list", { packDate: "2026-10-01", orders: [{ orderId: "A", status: "paid", shipBy: "2026-10-01", items: [{ sku: "S", name: "S", qty: 2 }] }] });
    expect(out.packing_list).toEqual({ packDate: "2026-10-01", orderCount: 1, orders: ["A"], pickList: [{ sku: "S", name: "S", qty: 2 }] });
  });
  it("empty: nothing to pack", async () => {
    expect(await run("order-packing-list", { packDate: "2026-10-01", orders: [] })).toEqual({ nothing_to_pack: { packDate: "2026-10-01", orderCount: 0 } });
  });
});

describe("expense-category-summary", () => {
  it("default: first and last day included, days outside excluded, largest category first", async () => {
    expect(await run("expense-category-summary")).toEqual({
      expense_summary: {
        from: "2026-09-01",
        to: "2026-09-30",
        currency: "USD",
        count: 5,
        total: 114.13,
        byCategory: [
          { category: "Travel", count: 2, total: 60.75 },
          { category: "Software", count: 2, total: 29.98 },
          { category: "Meals", count: 1, total: 23.4 },
        ],
      },
    });
  });
  it("alternate: a one-day window and equal totals ordered by name", async () => {
    const out = await run("expense-category-summary", {
      currency: "USD",
      from: "2026-09-10",
      to: "2026-09-10",
      expenses: [
        { date: "2026-09-10", category: "Travel", amount: 5 },
        { date: "2026-09-10", category: "Meals", amount: 5 },
        { date: "2026-09-11", category: "Meals", amount: 99 },
      ],
    });
    expect(out.expense_summary!.byCategory).toEqual([
      { category: "Meals", count: 1, total: 5 },
      { category: "Travel", count: 1, total: 5 },
    ]);
    expect(out.expense_summary!.total).toBe(10);
  });
  it("empty: nothing in range", async () => {
    const input = sample("expense-category-summary");
    input.from = "2025-01-01";
    input.to = "2025-01-31";
    expect(await run("expense-category-summary", input)).toEqual({ no_expenses: { from: "2025-01-01", to: "2025-01-31", count: 0 } });
  });
});

describe("subscription-review", () => {
  it("default: renewals in the range (last day included), soonest first, and the yearly total", async () => {
    const out = (await run("subscription-review")).subscription_review!;
    expect(out).toMatchObject({ from: "2026-10-01", to: "2026-10-31", currency: "USD", yearlyTotal: 536.63, unknownCycle: [], renewingCount: 3 });
    expect(out.renewing).toEqual([
      { name: "Music streaming", amount: 10.99, cycle: "monthly", nextRenewal: "2026-10-05", yearlyCost: 131.88 },
      { name: "News site", amount: 4.99, cycle: "monthly", nextRenewal: "2026-10-18", yearlyCost: 59.88 },
      { name: "Cloud storage", amount: 99, cycle: "yearly", nextRenewal: "2026-10-31", yearlyCost: 99 },
    ]);
  });
  it("alternate: an unknown billing cycle is listed and left out of the total instead of guessed", async () => {
    const input = sample("subscription-review");
    input.subscriptions.push({ name: "Gym", amount: 5, cycle: "weekly", nextRenewal: "2026-10-07" });
    const out = (await run("subscription-review", input)).subscription_review!;
    expect(out.yearlyTotal).toBe(536.63);
    expect(out.unknownCycle).toEqual(["Gym"]);
    expect(out.renewingCount).toBe(4);
  });
  it("empty", async () => {
    expect(await run("subscription-review", { currency: "USD", from: "2026-10-01", to: "2026-10-31", subscriptions: [] })).toEqual({
      subscription_review: { from: "2026-10-01", to: "2026-10-31", currency: "USD", yearlyTotal: 0, unknownCycle: [], renewingCount: 0, renewing: [] },
    });
  });
});

describe("weekly-task-plan", () => {
  it("default: open tasks due by week end, in order, until the hours run out", async () => {
    expect(await run("weekly-task-plan")).toEqual({
      plan_with_overflow: {
        weekStart: "2026-10-05",
        weekEnd: "2026-10-11",
        hoursAvailable: 10,
        hoursPlanned: 7,
        thisWeek: [
          { title: "Send project update", due: "2026-10-02", hours: 1, overdue: true, fits: true },
          { title: "Prepare workshop slides", due: "2026-10-07", hours: 4, overdue: false, fits: true },
          { title: "Review budget draft", due: "2026-10-07", hours: 2, overdue: false, fits: true },
        ],
        later: [{ title: "Write blog post", due: "2026-10-10", hours: 5, overdue: false, fits: false }],
      },
    });
  });
  it("boundary: exactly the available hours fits", async () => {
    const input = sample("weekly-task-plan");
    input.hoursAvailable = 12;
    const out = await run("weekly-task-plan", input);
    expect(Object.keys(out)).toEqual(["weekly_plan"]);
    expect(out.weekly_plan).toMatchObject({ hoursPlanned: 12, later: [] });
  });
  it("a task due on the week end is included; one day after is not", async () => {
    const base = { weekStart: "2026-10-05", weekEnd: "2026-10-11", hoursAvailable: 8 };
    const out = await run("weekly-task-plan", { ...base, tasks: [{ title: "On", due: "2026-10-11", hours: 1 }, { title: "After", due: "2026-10-12", hours: 1 }] });
    expect((out.weekly_plan!.thisWeek as { title: string }[]).map((t) => t.title)).toEqual(["On"]);
  });
  it("empty", async () => {
    expect(await run("weekly-task-plan", { weekStart: "2026-10-05", weekEnd: "2026-10-11", hoursAvailable: 10, tasks: [] })).toEqual({
      weekly_plan: { weekStart: "2026-10-05", weekEnd: "2026-10-11", hoursAvailable: 10, hoursPlanned: 0, thisWeek: [], later: [] },
    });
  });
});

describe("event-attendee-summary", () => {
  it("default: one count per email (case and spaces ignored), cancellations excluded", async () => {
    expect(await run("event-attendee-summary")).toEqual({
      attendee_summary: {
        event: "Community meetup",
        capacity: 40,
        registered: 4,
        duplicatesIgnored: 1,
        cancelled: 1,
        checkedIn: 2,
        byTicket: [
          { ticket: "standard", count: 2 },
          { ticket: "vip", count: 2 },
        ],
        seatsLeft: 36,
      },
    });
  });
  it("alternate: over capacity takes the other branch; no email preserves distinct attendees", async () => {
    const input = sample("event-attendee-summary");
    input.capacity = 3;
    expect((await run("event-attendee-summary", input)).over_capacity).toMatchObject({ registered: 4, seatsLeft: -1 });
    const noEmail = await run("event-attendee-summary", { event: "E", capacity: 10, attendees: [{ name: "A", ticket: "t" }, { name: "a ", ticket: "t" }, { name: "B", ticket: "t" }] });
    expect(noEmail.attendee_summary).toMatchObject({ registered: 3, duplicatesIgnored: 0 });
  });
  it("empty", async () => {
    expect(await run("event-attendee-summary", { event: "E", capacity: 40, attendees: [] })).toEqual({
      attendee_summary: { event: "E", capacity: 40, registered: 0, duplicatesIgnored: 0, cancelled: 0, checkedIn: 0, byTicket: [], seatsLeft: 40 },
    });
  });
});

describe("scenario review regressions", () => {
  it("duplicate attendee check-ins combine regardless of input order, without conflating names", async () => {
    const attendees = [
      { name: "Same Name", email: "A@example.com", ticket: "standard", checkedIn: false },
      { name: "Same Name", email: " a@example.com ", ticket: "standard", checkedIn: true },
      { name: "Same Name", ticket: "standard", checkedIn: true },
      { name: "Same Name", ticket: "standard", checkedIn: false },
    ];
    for (const rows of [attendees, [...attendees].reverse()]) {
      const out = await run("event-attendee-summary", { event: "E", capacity: 10, attendees: rows });
      expect(out.attendee_summary).toMatchObject({ registered: 3, checkedIn: 2, duplicatesIgnored: 1, seatsLeft: 7 });
    }
  });
  it("negative or missing quote quantities and prices require correction", async () => {
    for (const line of [{ qty: -1, unitPrice: 10 }, { qty: 1, unitPrice: -10 }, { unitPrice: 10 }, { qty: 1 }]) {
      const out = await run("quote-calculator", { currency: "USD", lines: [{ item: "x", ...line }] });
      expect(Object.keys(out)).toEqual(["needs_fix"]);
    }
  });
  it("malformed and impossible registration dates cannot appear complete", async () => {
    for (const date of ["2026-10-09junk", "2026-02-30", "2025-02-29", "2026-13-01"]) {
      const input = sample("registration-check");
      input.registration.submittedOn = date;
      expect((await run("registration-check", input)).needs_follow_up!.problems).toContain("invalid_date");
    }
    for (const window of [{ opens: "bad", closes: "2026-10-15" }, { opens: "2026-10-16", closes: "2026-10-01" }]) {
      const input = sample("registration-check");
      input.window = window;
      expect((await run("registration-check", input)).needs_follow_up!.problems).toContain("invalid_window");
    }
    const leap = sample("registration-check");
    leap.window = { opens: "2024-02-01", closes: "2024-02-29" };
    leap.registration.submittedOn = "2024-02-29";
    expect(Object.keys(await run("registration-check", leap))).toEqual(["complete_registration"]);
  });
  it("strict task priority keeps an oversized task and all following tasks for review", async () => {
    const out = await run("weekly-task-plan", { weekStart: "2026-10-05", weekEnd: "2026-10-11", hoursAvailable: 2, tasks: [
      { title: "First", due: "2026-10-05", priority: 1, hours: 3 },
      { title: "Small", due: "2026-10-06", priority: 1, hours: 1 },
    ] });
    expect(out.plan_with_overflow).toMatchObject({ hoursPlanned: 0, thisWeek: [] });
    expect((out.plan_with_overflow!.later as { title: string }[]).map((task) => task.title)).toEqual(["First", "Small"]);
  });
});

describe("registration-check", () => {
  it("default: sent on the closing day is on time; the email is tidied", async () => {
    expect(await run("registration-check")).toEqual({
      complete_registration: {
        name: "Yara Mansour",
        email: "yara@example.com",
        course: "Intro to budgeting",
        submittedOn: "2026-10-15",
        opens: "2026-10-01",
        closes: "2026-10-15",
        problems: [],
        complete: true,
      },
    });
  });
  it("window boundaries: the opening day is on time; the day before or after is not", async () => {
    const at = async (d: string) => {
      const input = sample("registration-check");
      input.registration.submittedOn = d;
      return run("registration-check", input);
    };
    expect(Object.keys(await at("2026-10-01"))).toEqual(["complete_registration"]);
    expect((await at("2026-09-30")).needs_follow_up!.problems).toEqual(["outside_window"]);
    expect((await at("2026-10-16")).needs_follow_up!.problems).toEqual(["outside_window"]);
  });
  it("empty: every problem is listed", async () => {
    const out = await run("registration-check", { window: { opens: "2026-10-01", closes: "2026-10-15" }, registration: {} });
    expect(out.needs_follow_up).toMatchObject({ problems: ["missing_name", "invalid_email", "missing_course", "missing_date"], complete: false });
    const bad = await run("registration-check", { window: { opens: "2026-10-01", closes: "2026-10-15" }, registration: { name: " ", email: "x@y", course: "C", submittedOn: "2026-10-02" } });
    expect(bad.needs_follow_up!.problems).toEqual(["missing_name", "invalid_email"]);
  });
});

describe("contact-list-cleanup", () => {
  it("default: trims, lowercases emails, keeps the first of each email, lists unusable emails", async () => {
    expect(await run("contact-list-cleanup")).toEqual({
      clean_contacts: {
        received: 6,
        kept: 2,
        duplicatesRemoved: 2,
        needsEmail: ["Rania Samir", "Adam Kareem"],
        contacts: [
          { name: "Hana Youssef", email: "hana@example.com", company: "Cedar Studio" },
          { name: "Tarek Fawzi", email: "tarek@example.com", company: "Atlas Tutors" },
        ],
      },
    });
  });
  it("alternate: a missing email field needs an email; a single contact stays a list", async () => {
    const out = await run("contact-list-cleanup", { contacts: [{ name: "No Mail" }, { name: "One", email: "one@example.com" }] });
    expect(out.clean_contacts).toEqual({ received: 2, kept: 1, duplicatesRemoved: 0, needsEmail: ["No Mail"], contacts: [{ name: "One", email: "one@example.com" }] });
  });
  it("empty", async () => {
    expect(await run("contact-list-cleanup", { contacts: [] })).toEqual({ clean_contacts: { received: 0, kept: 0, duplicatesRemoved: 0, needsEmail: [], contacts: [] } });
  });
});

describe("support-backlog-summary", () => {
  it("default: open tickets by priority; exactly the limit counts as waiting too long", async () => {
    const out = (await run("support-backlog-summary")).stale_backlog!;
    expect(out).toMatchObject({ asOf: "2026-09-30", open: 4, byPriority: { high: 2, normal: 1, low: 1, other: 0 }, staleCount: 2 });
    expect((out.stale as { id: number; daysSinceUpdate: number }[]).map((s) => [s.id, s.daysSinceUpdate])).toEqual([[5103, 15], [5102, 7]]);
  });
  it("alternate: a longer limit means nothing is waiting too long", async () => {
    const input = sample("support-backlog-summary");
    input.staleAfterDays = 8;
    expect((await run("support-backlog-summary", input)).stale_backlog!.staleCount).toBe(1);
    input.staleAfterDays = 30;
    expect((await run("support-backlog-summary", input)).backlog_summary).toMatchObject({ open: 4, staleCount: 0, stale: [] });
  });
  it("empty", async () => {
    expect(await run("support-backlog-summary", { asOf: "2026-09-30", staleAfterDays: 7, tickets: [] })).toEqual({
      backlog_summary: { asOf: "2026-09-30", open: 0, byPriority: { high: 0, normal: 0, low: 0, other: 0 }, staleCount: 0, stale: [] },
    });
  });
});

describe("survey-score-summary", () => {
  it("default: the last day is included, the day after is not; average and share satisfied are rounded", async () => {
    expect(await run("survey-score-summary")).toEqual({
      survey_low_scores: {
        from: "2026-09-01",
        to: "2026-09-30",
        counted: 5,
        notCounted: 1,
        average: 3.8,
        satisfiedPercent: 60,
        byScore: [
          { score: 1, count: 0 },
          { score: 2, count: 1 },
          { score: 3, count: 1 },
          { score: 4, count: 1 },
          { score: 5, count: 2 },
        ],
        lowScores: [{ respondent: "R-03", date: "2026-09-14", score: 2, comment: "Waited too long" }],
      },
    });
  });
  it("alternate: text, fractional and out-of-scale scores are not counted; rounding to 2 and 1 decimals", async () => {
    const out = await run("survey-score-summary", {
      from: "2026-09-01",
      to: "2026-09-30",
      responses: [
        { respondent: "a", date: "2026-09-02", score: 5 },
        { respondent: "b", date: "2026-09-02", score: 4 },
        { respondent: "c", date: "2026-09-02", score: 4 },
        { respondent: "d", date: "2026-09-02", score: "4" },
        { respondent: "e", date: "2026-09-02", score: 4.5 },
        { respondent: "f", date: "2026-09-02", score: 6 },
        { respondent: "g", date: "2026-09-02", score: 3 },
      ],
    });
    expect(out.survey_summary).toMatchObject({ counted: 4, notCounted: 3, average: 4, satisfiedPercent: 75, lowScores: [] });
    const thirds = await run("survey-score-summary", { from: "2026-09-01", to: "2026-09-30", responses: [5, 4, 4].map((score, i) => ({ respondent: `${i}`, date: "2026-09-05", score })) });
    expect(thirds.survey_summary).toMatchObject({ average: 4.33, satisfiedPercent: 100 });
    const oneOfThree = await run("survey-score-summary", { from: "2026-09-01", to: "2026-09-30", responses: [5, 3, 3].map((score, i) => ({ respondent: `${i}`, date: "2026-09-05", score })) });
    expect(oneOfThree.survey_summary).toMatchObject({ average: 3.67, satisfiedPercent: 33.3 });
  });
  it("empty: no average rather than a made-up zero", async () => {
    const out = await run("survey-score-summary", { from: "2026-09-01", to: "2026-09-30", responses: [] });
    expect(out.survey_summary).toMatchObject({ counted: 0, notCounted: 0, average: null, satisfiedPercent: null, lowScores: [] });
  });
});
