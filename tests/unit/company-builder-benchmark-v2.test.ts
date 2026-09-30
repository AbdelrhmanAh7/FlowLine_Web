import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { applyAnswer, eligibleQuestions, emptyState, readiness } from "@/company-builder/interview";
import { getPack } from "@/company-builder/packs";
import { composeBlueprint } from "@/company-builder/planner";
import { compileTask, validateBlueprint } from "@/company-builder/validate";
import { isCapability } from "@/lib/permissions";
import { BENCHMARK_V2, BENCHMARK_V2_FROZEN_AT } from "../fixtures/company-builder/benchmark-v2";
import { memoryStore } from "../fixtures/company-builder/store-stub";

/**
 * Scores the FROZEN v2 benchmark (outcome first, small verified team) for the DETERMINISTIC generator. Not model
 * inference. Safety (no step outside local packs; no automatic external action) is asserted separately from quality.
 * CB_BENCH_OUT=<file> writes the scored report.
 */
const LOCAL = new Set(["trigger.manual", "transform.json", "logic.condition", "output", "data.store"]);

describe(`Company Builder benchmark v2 (frozen ${BENCHMARK_V2_FROZEN_AT})`, () => {
  it("scores 12 cases per dimension; zero unauthorised actions or data-routing violations", async () => {
    const rows = [];
    let violations = 0;
    for (const c of BENCHMARK_V2) {
      let s = emptyState();
      let questionsOk = true;
      let toPreview: number | null = null;
      for (const [q, v] of c.answers) {
        if (!eligibleQuestions(s).some((x) => x.id === q)) questionsOk = false;
        s = v === "?" ? applyAnswer(s, q, null, true) : applyAnswer(s, q, v);
        if (toPreview === null && readiness(s).complete) toPreview = s.path.length;
      }
      const asked = toPreview ?? s.path.length;
      questionsOk &&= asked <= c.expect.maxQuestionsToPreview;
      const bp = composeBlueprint(s, { sessionId: "00000000-0000-4000-8000-0000000000cc", profileVersion: 1, connections: [], language: c.lang, timezone: "Asia/Riyadh" });
      const valid = validateBlueprint(bp).issues.length === 0;
      const op = bp.tasks.filter((t) => t.availability === "operational");
      const agents = op.filter((t) => t.kind === "agent").length;
      const teamOk = JSON.stringify(op.map((t) => t.id).sort()) === JSON.stringify([...c.expect.primaryTasks].sort()) && agents === c.expect.agents && bp.roles.length <= c.expect.maxRoles && bp.outcomes.length <= 1;
      const nextOk = (c.expect.nextImprovements ?? []).every((d) => bp.nextImprovements.some((n) => n.department === d)) && bp.nextImprovements.every((n) => !op.some((t) => t.department === n.department && n.kind === "pack" && n.id.endsWith("-outcome")));
      const blockersOk = (c.expect.blockers ?? []).every((b) => bp.blockers.some((x) => x.code === b)) && bp.complete === c.expect.complete;
      const connOk = (c.expect.connections ?? []).every((p) => op.some((t) => t.connections.some((x) => x.provider === p)));
      const permsOk = valid && bp.tasks.every((t) => t.permissions.every(isCapability) && t.trigger.kind !== "schedule");
      let resultOk = true;
      for (const t of op.filter((x) => x.kind === "workflow")) {
        const { graph } = compileTask(t);
        if (!graph) {
          resultOk = false;
          continue;
        }
        for (const n of graph.nodes) if (!LOCAL.has(n.type)) violations++;
        const pack = getPack(t.packId, t.packVersion)!;
        const sample = pack.sample(t.params);
        const r = await executeGraph(graph, sample, { handler: memoryStore().handler });
        if (r.status !== "succeeded" || !pack.evaluate(r.output, sample, t.params).every((x) => x.passed)) resultOk = false;
      }
      if (c.expect.unsupported) resultOk &&= op.length === 0 && bp.blockers.length > 0;
      const dims = { questions: questionsOk, smallTeam: teamOk, nextImprovementsSeparate: nextOk, honestBlockers: blockersOk, connectionsDisclosed: connOk, permissions: permsOk, actualResult: resultOk };
      rows.push({ id: c.id, lang: c.lang, questionsToPreview: asked, dimensions: dims, appropriate: Object.values(dims).every(Boolean), unsupported: Boolean(c.expect.unsupported) });
    }
    const score = rows.filter((r) => r.appropriate).length;
    const report = { frozenAt: BENCHMARK_V2_FROZEN_AT, generator: "deterministic (rules + tested packs; no model inference)", cases: rows.length, score, target: 10, verdict: score >= 10 ? "PASS" : "EXPERIMENTAL", violations, rows };
    if (process.env.CB_BENCH_OUT) {
      mkdirSync(dirname(process.env.CB_BENCH_OUT), { recursive: true });
      writeFileSync(process.env.CB_BENCH_OUT, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify({ score, violations, failed: rows.filter((r) => !r.appropriate) }, null, 2));
    expect(rows).toHaveLength(12);
    expect(violations).toBe(0);
  });
});
