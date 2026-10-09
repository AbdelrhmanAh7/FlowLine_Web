// e2e-army test for flows list and dashboard (#117)
// This test verifies that the flow list and dashboard correctly display run status as "succeeded" (not "succeed")
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { seeded } from "../hub/ops/verify/e2e-army/tests-dev/FlowLine_Web/lib.ts";
import { Http, actor, chain, newFlow, startRun, waitRun, type Graph } from "../hub/ops/verify/e2e-army/tests-dev/FlowLine_Web/_helpers.ts";

test("@issue-117 AC1: the flow list and dashboard correctly display last run status as \"succeeded\"", { tags: ["feat:fl-flows-list", "shard:flows-api", "lvl:api"] }, async () => {
  const { http } = await actor("flows-list-api");
  const ws = (await http.post("/api/workspaces", { json: { name: `List ${seeded("flows-list-ws", 4)}` } })).json.workspace;
  const w = `/api/workspaces/${ws.id}`;
  const good = await newFlow(http, ws.id, `Listed good ${seeded("fl-list-good", 3)}`, chain({ n: 1 }, "$"));
  const bad = await newFlow(http, ws.id, `Listed bad ${seeded("fl-list-bad", 3)}`, chain({ n: 1 }, '$number("x")'));
  const draft = await createFlow(http, ws.id, { name: `Listed draft ${seeded("fl-list-draft", 3)}` });
  // Run the good flow twice to get runCount: 2
  for (const id of [good.id, good.id]) {
    const run = await startRun(http, id);
    await waitRun(http, run.json.run.id);
  }
  const rows = (await http.get(`${w}/flows`)).json.flows as any[];
  expect(rows).toHaveLength(3);
  const row = (id: string) => rows.find((r) => r.id === id);
  // Verify the good flow has the correct status
  expect(row(good.id)).toMatchObject({ runCount: 2, lastRunStatus: "succeeded", successRate: 1, publishedVersion: 1, nodeCount: 3, trigger: "trigger.manual" });
  // Verify the bad flow has the correct status
  expect(row(bad.id)).toMatchObject({ runCount: 1, lastRunStatus: "failed", successRate: 0, publishedVersion: null });
  // Verify the draft flow has no run status
  expect(row(draft.id)).toMatchObject({ runCount: 0, lastRunStatus: null, successRate: null, nodeCount: 0, hasTrigger: false });
});
