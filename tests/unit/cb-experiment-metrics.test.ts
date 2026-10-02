import { describe, expect, it } from "vitest";
import type { CompanyBlueprint } from "@/company-builder/model";
import { clientEventBody, computeMetrics, effortBody, type MetricInputs } from "@/company-builder/experiment-metrics";

const t0 = new Date("2026-10-01T09:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const plan = (missing: string[]) => ({ tasks: [{ connections: missing.map((provider) => ({ provider, status: "missing", connectionId: null })) }] }) as unknown as CompanyBlueprint;
const ok = { structurallyValid: true, ranWithoutErrors: true, matchedOutcome: true, checks: [] };

function base(over: Partial<MetricInputs> = {}): MetricInputs {
  return {
    sessionCreatedAt: t0,
    answers: [
      { questionId: "offering", value: "x", unknown: false, at: at(10).toISOString() },
      { questionId: "first_outcome", value: "customer", unknown: false, at: at(20).toISOString() },
      { questionId: "cust_channel", value: "email", unknown: false, at: at(30).toISOString() },
      { questionId: "cust_channel", value: "form", unknown: false, at: at(200).toISOString() }, // edit after preview
      { questionId: "cust_volume", value: "under_20", unknown: false, at: at(210).toISOString() }, // first answer after preview: not an edit
    ],
    plans: [{ createdAt: at(60), body: plan(["gmail"]) }],
    trials: [
      { createdAt: at(300), completedAt: at(304), verdict: { ...ok, matchedOutcome: false }, userVerdict: "rejected", userVerdictAt: at(320) },
      { createdAt: at(400), completedAt: at(403), verdict: ok, userVerdict: "accepted", userVerdictAt: at(420) },
    ],
    events: [
      { kind: "active_time", data: { seconds: 60 }, at: at(60) },
      { kind: "active_time", data: { seconds: 45 }, at: at(120) },
      { kind: "help_opened", data: { topic: "plan_cost" }, at: at(70) },
      { kind: "support_minutes", data: { minutes: 15 }, at: at(500) },
      { kind: "external_delay_minutes", data: { minutes: 90 }, at: at(500) },
    ],
    cliReportedUsd: [],
    laterRuns: [],
    now: at(3600),
    ...over,
  };
}

describe("experiment metrics (definitions in COMPETITIVE_TEST_PROTOCOL.md)", () => {
  it("computes each metric from its own source, without double-counting", () => {
    const m = computeMetrics(base());
    expect(m.timeToPlanPreviewS).toBe(60);
    expect(m.questionsToPreview).toBe(3);
    expect(m.editsBeforeFirstAcceptedResult).toBe(1);
    expect(m.connectionsRequired).toBe(1);
    expect(m.timeToFirstVerifiedResultS).toBe(420);
    expect(m.activeUserTimeS).toBe(105);
    expect(m.systemWaitingTimeS).toBe(7);
    expect(m.externalOnboardingDelayMin).toBe(90);
    expect(m.supportTimeMin).toBe(15);
    expect(m.helpOpened).toBe(1);
    expect(m.results).toEqual({ accepted: 1, rejected: 1, notJudged: 0 });
    // AI cost, platform charges and support effort are separate buckets; nothing is estimated.
    expect(m.cost).toEqual({ aiReportedUsd: 0, platformCharges: null, supportEffortMin: 15 });
  });

  it("sums raw trial milliseconds before rounding the aggregate seconds", () => {
    const trials = (ms: number) => Array.from({ length: 10 }, () => ({
      createdAt: t0,
      completedAt: new Date(t0.getTime() + ms),
      verdict: null,
      userVerdict: null,
      userVerdictAt: null,
    }));
    expect(computeMetrics(base({ trials: trials(600) })).systemWaitingTimeS).toBe(6);
    expect(computeMetrics(base({ trials: trials(400) })).systemWaitingTimeS).toBe(4);
  });

  it("acceptance of a result whose checks failed is never a verified result", () => {
    const m = computeMetrics(base({ trials: [{ createdAt: at(300), completedAt: at(304), verdict: { ...ok, matchedOutcome: false }, userVerdict: "accepted", userVerdictAt: at(320) }] }));
    expect(m.timeToFirstVerifiedResultS).toBeNull();
    expect(m.reusedFollowingWeek).toBeNull();
  });

  it("reuse in the following week: pending inside the window, then true/false; trial runs never count", () => {
    const accepted = at(420);
    const day = 86_400_000;
    expect(computeMetrics(base({ now: new Date(accepted.getTime() + 2 * day) })).reusedFollowingWeek).toBe("pending");
    expect(computeMetrics(base({ now: new Date(accepted.getTime() + 9 * day) })).reusedFollowingWeek).toBe(false);
    expect(computeMetrics(base({ now: new Date(accepted.getTime() + 9 * day), laterRuns: [new Date(accepted.getTime() + 3 * day)] })).reusedFollowingWeek).toBe(true);
    // A run on the same day as the acceptance is setup, not reuse.
    expect(computeMetrics(base({ now: new Date(accepted.getTime() + 9 * day), laterRuns: [new Date(accepted.getTime() + 3600_000)] })).reusedFollowingWeek).toBe(false);
  });

  it("no plan yet: preview metrics are unknown, not zero", () => {
    const m = computeMetrics(base({ plans: [], trials: [] }));
    expect(m.timeToPlanPreviewS).toBeNull();
    expect(m.questionsToPreview).toBeNull();
    expect(m.connectionsRequired).toBeNull();
  });

  it("event payloads carry only bounded numbers and enum ids (no text, no answers)", () => {
    expect(() => clientEventBody.parse({ kind: "active_time", seconds: 3600 })).toThrow();
    expect(() => clientEventBody.parse({ kind: "help_opened", topic: "customer said: call me on 0551234567" })).toThrow();
    expect(() => clientEventBody.parse({ kind: "answer_text", text: "secret" })).toThrow();
    expect(() => effortBody.parse({ kind: "support", minutes: 0 })).toThrow();
    expect(clientEventBody.parse({ kind: "active_time", seconds: 30 })).toEqual({ kind: "active_time", seconds: 30 });
  });
});
