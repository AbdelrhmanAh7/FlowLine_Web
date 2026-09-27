import { describe, expect, it } from "vitest";
import { runningDetail, SLOW_AFTER_MS } from "@/lib/run-status";
import type { RunStepDto } from "@/lib/types";

const start = Date.parse("2026-09-27T10:00:00Z");
const step = (nodeType: string): RunStepDto => ({
  id: "s",
  nodeId: "n",
  nodeType,
  nodeLabel: "N",
  position: 1,
  status: "running",
  input: null,
  output: null,
  error: null,
  skipReason: null,
  startedAt: new Date(start).toISOString(),
  finishedAt: null,
  durationMs: null,
});

describe("runningDetail (degraded running states)", () => {
  it("a fast step is just running", () => {
    expect(runningDetail(step("http.request"), [], start + 300)).toEqual({ text: "Running…", degraded: false });
  });
  it("a provider-bound step past the threshold is 'provider slow'", () => {
    expect(runningDetail(step("integration.action"), [], start + 12_400)).toEqual({ text: "Running… 12s · provider slow", degraded: true });
    expect(runningDetail(step("ai.extract"), [], start + SLOW_AFTER_MS)).toMatchObject({ degraded: true });
  });
  it("a local step is never blamed on a provider", () => {
    expect(runningDetail(step("transform.json"), [], start + 30_000)).toEqual({ text: "Running… 30s", degraded: false });
  });
  it("retry events show the attempt and reason", () => {
    const events = [
      { id: 1, at: "", type: "step_retry", nodeId: "n", data: { attempt: 1, kind: "rate_limit" } },
      { id: 2, at: "", type: "step_retry", nodeId: "other", data: { attempt: 1, kind: "server" } },
    ];
    expect(runningDetail(step("integration.action"), events, start + 2_000)).toEqual({ text: "Running… 2s · retry 2 (rate limited)", degraded: true });
  });
});
