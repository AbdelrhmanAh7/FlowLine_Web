import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { EXPRESSION_MAX_LENGTH } from "@/engine/expression";
import { applyAnswer, emptyState } from "@/company-builder/interview";
import { getPack } from "@/company-builder/packs";
import { customerFollowUpPack as pack, FACT_STEP_LIMIT, factSteps, MAX_FACT_STEPS } from "@/company-builder/packs/customer-follow-up";
import { composeBlueprint } from "@/company-builder/planner";
import { QUESTION_BY_ID } from "@/company-builder/questions";
import { compileTask, validateBlueprint } from "@/company-builder/validate";
import { memoryStore } from "../fixtures/company-builder/store-stub";

/**
 * FB2-01 regression: approved information up to the ACCEPTED maximum must always produce a valid, executable plan,
 * with every approved line preserved (nothing truncated or dropped), under the unchanged expression limit.
 * Length unit everywhere = JavaScript string length (UTF-16 code units): interview `maxLength`, UI textarea
 * `maxLength`, API validation and the planner all count the same unit.
 */
const MAX = QUESTION_BY_ID.get("cust_info")!.maxLength!;
const SID = "00000000-0000-4000-8000-0000000000f1";

/** Builds approved information of exactly `n` UTF-16 units from repeated lines; the LAST line is a unique price line. */
function info(n: number, unit: string, last: string) {
  const lines: string[] = [];
  let used = last.length;
  for (let i = 0; used + unit.length + 2 + 1 + 4 <= n; i++) {
    const l = `${unit}${i % 10}${i % 7}`;
    lines.push(l);
    used += l.length + 1;
  }
  // Exact length without trailing whitespace (the interview trims): a filler line of letters absorbs the remainder.
  const gap = n - used - 1;
  if (gap > 0) lines.push("z".repeat(gap));
  return [...lines, last].join("\n");
}

const VARIANTS = {
  english: { unit: "We work Saturday to Thursday. Line ", last: "Carpet cleaning costs 333 EGP." },
  arabic: { unit: "نعمل من السبت إلى الخميس سطر ", last: "تنظيف السجاد بسعر 333 جنيه." },
  mixed: { unit: "Delivery التوصيل free مجاني line ", last: "Carpet cleaning تنظيف سجاد costs 333 EGP." },
  escaping: { unit: 'He said "ok" \\ path\\x \'q\' {$x} `t` ', last: 'Carpet cleaning costs "333" EGP \\ ok.' },
} as const;

function planFor(approved: string) {
  let s = emptyState();
  for (const [q, v] of [["first_outcome", "customer"], ["situation", "improve"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_services", "carpet cleaning / تنظيف سجاد, deep cleaning"], ["cust_info", approved]] as [string, unknown][]) s = applyAnswer(s, q, v);
  return composeBlueprint(s, { sessionId: SID, profileVersion: 1, connections: [], language: "en", timezone: "Africa/Cairo" });
}

describe("FB2-01 — approved information up to the accepted maximum always compiles and runs, nothing dropped", () => {
  for (const [name, v] of Object.entries(VARIANTS)) {
    for (const n of [950, 1050, 1100, MAX]) {
      it(`${name}, ${n} UTF-16 units: valid plan, every expression within ${EXPRESSION_MAX_LENGTH}, last line still quoted`, async () => {
        const approved = info(n, v.unit, v.last);
        expect(approved.length).toBe(n);
        const bp = planFor(approved);
        expect(validateBlueprint(bp).issues).toEqual([]);
        const task = bp.tasks[0]!;
        expect(task.params.approvedInfo).toBe(approved); // preserved exactly (no silent truncation)
        const { graph, issues } = compileTask(task);
        expect(issues).toEqual([]);
        for (const node of graph!.nodes) {
          const e = (node.data.config as { expression?: string }).expression;
          if (e) expect(e.length, node.id).toBeLessThanOrEqual(EXPRESSION_MAX_LENGTH);
        }
        const pack = getPack(task.packId, task.packVersion)!;
        const input = { request: { id: `fb201-${name}-${n}`, from: "c@example.com", received_at: "2026-10-01T09:00:00+03:00", subject: "Q", body: "How much is carpet cleaning? تنظيف سجاد كم السعر؟" } };
        const r = await executeGraph(graph!, input, { handler: memoryStore().handler });
        expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
        const out = r.output as { reply_draft?: { body: string } };
        expect(out.reply_draft?.body).toContain(v.last.trim()); // the very last approved line survives end to end
        expect(pack.evaluate(r.output as Record<string, unknown>, input, task.params).filter((c) => !c.passed)).toEqual([]);
      });
    }
  }
  it(`just beyond the accepted maximum (${MAX + 1}) is refused by the interview with a clear error, not truncated`, () => {
    let s = emptyState();
    s = applyAnswer(s, "first_outcome", "customer");
    expect(() => applyAnswer(s, "cust_info", "x".repeat(MAX + 1))).toThrow(/ANSWER_TOO_LONG/);
    expect(applyAnswer(s, "cust_info", "x".repeat(MAX)).facts["customer.approved_info"]!.value).toHaveLength(MAX);
  });
});

describe("FB2-01 — data steps: bounded, complete, ordered (property and worst cases)", () => {
  const svc = ["carpet cleaning|تنظيف سجاد", "deep cleaning|تنظيف عميق", "office cleaning|تنظيف مكاتب"];
  const check = (approvedInfo: string) => {
    const params = { approvedInfo, services: svc, requiredDetails: ["service", "date", "phone"], followUpHours: 24, timezone: "UTC", language: "en" };
    const plan = factSteps(params);
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
    for (const e of plan.steps) expect(e.length).toBeLessThanOrEqual(FACT_STEP_LIMIT);
    // Reassemble every series from the steps in key order: nothing lost, nothing reordered.
    const merged: Record<string, unknown[]> = {};
    for (const e of plan.steps) Object.assign(merged, JSON.parse(e.slice("$merge([$, ".length, -"])".length)));
    const approved = plan.approvedKeys.flatMap((k) => merged[k] as { t: string }[]).map((x) => x.t);
    const expected = approvedInfo.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    expect(approved).toEqual(expected);
    expect(plan.serviceKeys.flatMap((k) => merged[k] as unknown[])).toHaveLength(3);
    return plan;
  };
  it("random inputs (seeded) of 0–1200 units: every step under the limit; data complete and ordered", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const alphabet = ['a', 'b', ' ', '"', '\\', 'ع', 'ر', '\n', '1', '.', 'é', '$'];
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(rnd() * (MAX + 1));
      check(Array.from({ length: n }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(""));
    }
  });
  it("worst-case escaping at the maximum (1200 quotes/backslashes) and many one-letter lines still compile and run", async () => {
    for (const approved of ['"\\'.repeat(MAX / 2), Array.from({ length: MAX / 2 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("\n")]) {
      const plan = check(approved);
      expect(plan.steps.length).toBeLessThanOrEqual(MAX_FACT_STEPS);
      const params = { approvedInfo: approved, services: svc, requiredDetails: ["service"], followUpHours: 24, timezone: "UTC", language: "en" };
      expect(pack.paramIssues!(params)).toEqual([]);
      const g = pack.compile(params, (x) => x);
      const r = await executeGraph(g, { request: { id: "w", from: "w@example.com", body: "carpet cleaning please" } }, { handler: memoryStore().handler });
      expect(r.status, JSON.stringify(r.error)).toBe("succeeded");
    }
  });
  it("text longer than the accepted maximum from any other source is refused, never trimmed", () => {
    expect(pack.paramIssues!({ approvedInfo: "x".repeat(MAX + 1) })).toContain("APPROVED_INFO_TOO_LONG");
  });
});
