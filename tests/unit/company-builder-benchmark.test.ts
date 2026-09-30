import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { applyAnswer, eligibleQuestions, emptyState } from "@/company-builder/interview";
import { getPack } from "@/company-builder/packs";
import { composeBlueprint } from "@/company-builder/planner";
import { compileTask, validateBlueprint } from "@/company-builder/validate";
import { isCapability } from "@/lib/permissions";
import { BENCHMARK, BENCHMARK_FROZEN_AT } from "../fixtures/company-builder/benchmark";
import { memoryStore } from "../fixtures/company-builder/store-stub";

/**
 * Scores the FROZEN 12-case benchmark for the DETERMINISTIC generator (rules + tested packs). This is not model
 * inference: the CLI generators' quality is measured separately, on the owner's machine (see CLI_PROTOTYPE.md).
 * Set CB_BENCH_OUT=<file> to write the scored report.
 */
// data.store (added 2026-09-30 for the follow-up record) writes only to the workspace's own namespaced store: no egress,
// no credentials. Expectations below are UNCHANGED; v1 now under-scores by design (see benchmark v2 and REPORT.md).
const LOCAL_NODES = new Set(["trigger.manual", "transform.json", "logic.condition", "output", "data.store"]);

describe(`Company Builder benchmark (frozen ${BENCHMARK_FROZEN_AT})`, () => {
  it("scores 12 cases per dimension with zero unauthorised actions or data-routing violations", async () => {
    const rows = [];
    let violations = 0;
    for (const c of BENCHMARK) {
      let s = emptyState();
      let questionsOk = true;
      for (const [q, v] of c.answers) {
        if (!eligibleQuestions(s).some((x) => x.id === q)) questionsOk = false; // asked only when relevant
        s = v === "?" ? applyAnswer(s, q, null, true) : applyAnswer(s, q, v);
      }
      questionsOk &&= s.path.length <= c.expect.maxQuestions;
      const bp = composeBlueprint(s, { sessionId: "00000000-0000-4000-8000-0000000000bb", profileVersion: 1, connections: [], language: c.lang });
      const valid = validateBlueprint(bp).issues.length === 0;
      const factsOk = (c.expect.inferredFacts ?? []).every((k) => s.facts[k]?.status === "inferred") && Object.values(s.facts).every((f) => !(f.source === "inference" && f.status === "confirmed"));
      const op = bp.tasks.filter((t) => t.availability === "operational").map((t) => t.id).sort();
      const tasksOk =
        JSON.stringify(op) === JSON.stringify([...c.expect.operationalTasks].sort()) &&
        (c.expect.nonOperationalTasks ?? []).every((id) => bp.tasks.some((t) => t.id === id && t.availability !== "operational")) &&
        (c.expect.blockers ?? []).every((b) => bp.blockers.some((x) => x.code === b)) &&
        bp.complete === c.expect.complete;
      const permsOk = valid && bp.tasks.every((t) => t.permissions.every(isCapability) && t.trigger.kind !== "schedule");
      let resultOk = true;
      for (const t of bp.tasks.filter((x) => x.availability === "operational" && x.kind === "workflow")) {
        const { graph } = compileTask(t);
        if (!graph) {
          resultOk = false;
          continue;
        }
        for (const n of graph.nodes) if (!LOCAL_NODES.has(n.type)) violations++;
        const pack = getPack(t.packId, t.packVersion)!;
        const sample = pack.sample(t.params);
        const r = await executeGraph(graph, sample, { handler: memoryStore().handler });
        if (r.status !== "succeeded" || !pack.evaluate(r.output, sample, t.params).every((x) => x.passed)) resultOk = false;
      }
      if (c.expect.unsupported) resultOk &&= op.length === 0 || bp.blockers.length > 0;
      const appropriate = factsOk && questionsOk && tasksOk && permsOk && resultOk;
      rows.push({ id: c.id, lang: c.lang, questionsAsked: s.path.length, dimensions: { factsProvenance: factsOk, questions: questionsOk, taskSelection: tasksOk, permissions: permsOk, actualResult: resultOk }, appropriate, unsupported: Boolean(c.expect.unsupported) });
    }
    const score = rows.filter((r) => r.appropriate).length;
    const report = { frozenAt: BENCHMARK_FROZEN_AT, generator: "deterministic (rules + tested packs; no model inference)", cases: rows.length, score, target: 10, verdict: score >= 10 ? "PASS" : "EXPERIMENTAL", violations, rows };
    if (process.env.CB_BENCH_OUT) {
      mkdirSync(dirname(process.env.CB_BENCH_OUT), { recursive: true });
      writeFileSync(process.env.CB_BENCH_OUT, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify({ score, violations, failed: rows.filter((r) => !r.appropriate) }, null, 2));
    expect(rows).toHaveLength(12);
    expect(violations).toBe(0); // safety is asserted independently of quality
  });
});
