import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { applyAnswer, emptyState } from "@/company-builder/interview";
import { getPack } from "@/company-builder/packs";
import { composeBlueprint } from "@/company-builder/planner";
import { compileTask } from "@/company-builder/validate";
import { memoryStore } from "../fixtures/company-builder/store-stub";

/**
 * FB2-03: a date or phone number must never become evidence for a service. Expected results are stated here
 * independently (not derived from the pack's own matcher), so the evaluator can't simply agree with faulty matching.
 */
function run(services: string, approved: string) {
  let s = emptyState();
  for (const [q, v] of [["first_outcome", "customer"], ["situation", "improve"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_services", services], ["cust_info", approved]] as [string, unknown][]) s = applyAnswer(s, q, v);
  const task = composeBlueprint(s, { sessionId: "00000000-0000-4000-8000-0000000000f3", profileVersion: 1, connections: [], language: "en", timezone: "UTC" }).tasks[0]!;
  const { graph, issues } = compileTask(task);
  expect(issues).toEqual([]);
  return async (body: string) => {
    const input = { request: { id: "a", from: "a@example.com", received_at: "2026-10-01T09:00:00Z", subject: "Request", body } };
    const r = await executeGraph(graph!, input, { handler: memoryStore().handler });
    const o = r.output as { follow_up_record: { detected: { service: string | null } }; reply_draft?: { body: string; asked_for: string[] } };
    return { o, failedChecks: getPack(task.packId, task.packVersion)!.evaluate(r.output as Record<string, unknown>, input, task.params).filter((c) => !c.passed).map((c) => c.id) };
  };
}

describe("FB2-03 — numbers in service names never match dates, phones or prices", () => {
  const ask = run("24/7 emergency plumbing, deep cleaning", "Emergency plumbing call-out costs 500 EGP.\nDeep cleaning costs 1500 EGP.");
  it("a date that contains 24 doesn't select a service; the reply asks which service", async () => {
    const { o, failedChecks } = await (await ask)("Can you come on 2026-10-24? How much is it?");
    expect(o.follow_up_record.detected.service).toBeNull(); // independent expectation
    expect(o.reply_draft?.asked_for).toContain("service");
    expect(failedChecks).toEqual([]);
  });
  it("a phone number containing 24 or 7 doesn't select a service", async () => {
    const { o } = await (await ask)("call me on 01024724724");
    expect(o.follow_up_record.detected.service).toBeNull();
  });
  it("the full service name still matches, written with or without the slash", async () => {
    for (const body of ["I need 24/7 emergency plumbing tonight", "do you do 24-7 emergency plumbing?"]) {
      const { o } = await (await ask)(body);
      expect(o.follow_up_record.detected.service, body).toBe("24/7 emergency plumbing");
    }
  });
  it("a price amount never selects a service", async () => {
    const { o } = await (await ask)("Is it 1500 or 500?");
    expect(o.follow_up_record.detected.service).toBeNull();
  });
  it("'name / other name' (spaced slash) still creates two names for one service", async () => {
    const two = run("office cleaning / تنظيف مكاتب", "Office cleaning starts at 900 EGP.");
    const { o } = await (await two)("أحتاج تنظيف مكاتب");
    expect(o.follow_up_record.detected.service).toBe("office cleaning");
  });
});
