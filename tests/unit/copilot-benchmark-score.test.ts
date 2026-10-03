import { describe, expect, it } from "vitest";
import { scoreCase, summarizeScores, type BenchmarkScores } from "../../scripts/copilot-benchmark-score";

const supported: BenchmarkScores = { structure: true, nodeSelection: true, order: true, params: true, result: true, safeRefusal: true };

describe("Copilot benchmark scoring", () => {
  it("requires every correctness dimension for a supported case", () => {
    expect(scoreCase(false, supported)).toBe(true);
    for (const key of ["structure", "nodeSelection", "order", "params", "result"] as const) {
      expect(scoreCase(false, { ...supported, [key]: false })).toBe(false);
    }
  });

  it("never credits a refusal of a supported case", () => {
    expect(scoreCase(false, { ...supported, safeRefusal: false })).toBe(false);
    expect(scoreCase(true, { ...supported, structure: null, safeRefusal: true })).toBe(true);
    expect(scoreCase(true, { ...supported, structure: null, safeRefusal: false })).toBe(false);
  });

  it("keeps structure, latency and cost separate from correctness", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ correct: i < 10, scores: i < 10 ? supported : { ...supported, result: false }, latencyMs: i + 1, costMicros: i === 11 ? null : 2 }));
    const summary = summarizeScores(rows);
    expect(summary.targetMet).toBe(true);
    expect(summary.dimensions.result).toEqual({ passed: 10, applicable: 12 });
    expect(summary.latency.totalMs).toBe(78);
    expect(summary.cost.totalMicros).toBeNull();
    expect(summarizeScores(rows.slice(0, 11)).targetMet).toBe(false);
  });
});
