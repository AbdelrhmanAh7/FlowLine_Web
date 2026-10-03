/** Independent benchmark dimensions. A supported request that is refused is incorrect. */
export type BenchmarkScores = {
  structure: boolean | null;
  nodeSelection: boolean | null;
  order: boolean | null;
  params: boolean | null;
  result: boolean | null;
  safeRefusal: boolean;
};

export function scoreCase(refusalExpected: boolean, scores: BenchmarkScores): boolean {
  if (refusalExpected) return scores.safeRefusal;
  return scores.safeRefusal && [scores.structure, scores.nodeSelection, scores.order, scores.params, scores.result].every((v) => v === true);
}

export function summarizeScores(rows: { correct: boolean; scores: BenchmarkScores; latencyMs: number; costMicros: number | null }[]) {
  const dimensions = ["structure", "nodeSelection", "order", "params", "result", "safeRefusal"] as const;
  return {
    correct: rows.filter((r) => r.correct).length,
    total: rows.length,
    targetMet: rows.length === 12 && rows.filter((r) => r.correct).length >= 10,
    dimensions: Object.fromEntries(dimensions.map((name) => [name, {
      passed: rows.filter((r) => r.scores[name] === true).length,
      applicable: rows.filter((r) => r.scores[name] !== null).length,
    }])),
    latency: { totalMs: rows.reduce((n, r) => n + r.latencyMs, 0), byCaseMs: rows.map((r) => r.latencyMs) },
    cost: { totalMicros: rows.every((r) => r.costMicros !== null) ? rows.reduce((n, r) => n + r.costMicros!, 0) : null, byCaseMicros: rows.map((r) => r.costMicros) },
  };
}
