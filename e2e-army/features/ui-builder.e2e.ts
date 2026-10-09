// UI BUILDER shard (agent steps + exact checks): building on the canvas, running from it, version history, publishing with a webhook trigger and
// creating a flow with Copilot. Each test works in a fresh workspace of the session's owner (session fl-user, English UI).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel, seeded } from "../lib.ts";
import { E, N, actor, chain, connectAi, freshWorkspace, newFlow, createFlow, type Graph } from "./_helpers.ts";

const SESSION = { session: "fl-user" } as const;

test("[fl-builder.1] adding a trigger on an empty canvas places the node and the flow saves itself", { ...SESSION, tags: ["feat:fl-builder", "shard:ui-builder", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "builder-1");
  const flow = await createFlow(http, ws.id, { name: `Canvas ${seeded("builder-1", 4)}` });
  await app.open(`/w/${ws.slug}/flows/${flow.id}`);
  await expect(screen.getByText("Start with a trigger")).toBeVisible();
  await expect(browser.locator(".react-flow__node")).toHaveCount(0);
  await agent.act("add a manual trigger to the canvas");
  await expect(browser.locator(".react-flow__node")).toHaveCount(1);
  await expect(screen.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 20_000 });
  await agent.assert("a manual trigger node is shown on the flow canvas and the flow is saved");
  const saved = (await http.get(`/api/flows/${flow.id}`)).json.flow;
  expect(saved.graph.nodes.map((n: any) => n.type)).toEqual(["trigger.manual"]);
  expect(saved.revision).toBeGreaterThan(flow.revision);
});

test("[fl-builder.2] running a flow from the canvas executes it and shows the run's result in the run dock", { ...SESSION, tags: ["feat:fl-builder", "shard:ui-builder", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "builder-2");
  const flow = await createFlow(http, ws.id, { templateId: "lead-qualifier" });
  await app.open(`/w/${ws.slug}/flows/${flow.id}`);
  await expect(screen.getByTestId("node-normalise")).toBeVisible();
  await agent.act("run the flow");
  await expect(screen.getByTestId("node-hot")).toHaveAccessibleName(/succeeded/, { timeout: 30_000 });
  await expect(screen.getByTestId("node-nurture")).toHaveAccessibleName(/skipped/);
  await expect(screen.getByRole("region", "Run dock")).toBeVisible();
  await agent.assert("the run dock shows the steps of the latest run and the flow's steps are marked as succeeded or skipped");
  const runs = (await http.get(`/api/flows/${flow.id}/runs`)).json.runs as { status: string; triggerKind: string }[];
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ status: "succeeded", triggerKind: "manual" });
});

test("[fl-flow-versions.2] the history panel lists saved versions and restores an older one as a new draft", { ...SESSION, tags: ["feat:fl-flow-versions", "shard:ui-builder", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "builder-3");
  const first: Graph = chain({ step: "first" }, "$");
  const f = await newFlow(http, ws.id, `History ${seeded("builder-3", 4)}`, first, { createVersion: true });
  const second = await http.put(`/api/flows/${f.id}`, { json: { baseRevision: f.revision, graph: chain({ step: "second" }, "{ \"changed\": true }"), createVersion: true } });
  expect(second.status).toBe(200);
  await app.open(`/w/${ws.slug}/flows/${f.id}`);
  await agent.act("open the version history panel");
  await expect(screen.getByRole("dialog", "Version history")).toBeVisible();
  await expect(screen.getByRole("list", "Versions")).toBeVisible();
  await agent.act("restore the oldest saved version as a draft");
  await expect.poll(async () => (await http.get(`/api/flows/${f.id}`)).json.flow.revision, { timeout: 20_000, interval: 500 }).toBeGreaterThan(second.json.flow.revision);
  const now = (await http.get(`/api/flows/${f.id}`)).json.flow;
  expect(now.revision).toBeGreaterThan(second.json.flow.revision);
  expect(now.graph).toEqual(first);
  expect(((await http.get(`/api/flows/${f.id}/versions`)).json.versions as unknown[]).length).toBeGreaterThanOrEqual(2);
});

test("[fl-flow-publish.2] publishing a webhook flow from the canvas shows its URL and the one-time signing secret", { ...SESSION, tags: ["feat:fl-flow-publish", "shard:ui-builder", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "builder-4");
  const g: Graph = { nodes: [N.webhook({ body: { lead: { name: "Ada" } } }), N.transform("shape", '{ "who": body.lead.name }'), N.output("out", "result")], edges: [E("t", "shape"), E("shape", "out")] };
  const f = await newFlow(http, ws.id, `Hook ${seeded("builder-4", 4)}`, g);
  await app.open(`/w/${ws.slug}/flows/${f.id}`);
  await expect(screen.getByTestId("publish-state")).toBeVisible();
  await agent.act("publish the flow and open its triggers panel");
  await expect(screen.getByTestId("webhook-url")).toBeVisible({ timeout: 20_000 });
  await expect(screen.getByTestId("webhook-secret")).toBeVisible();
  await expect(screen.getByTestId("webhook-url")).toContainText("/api/hooks/");
  await agent.assert("the triggers panel shows an active webhook with its URL and a signing secret that is shown once");
  const info = (await http.get(`/api/flows/${f.id}/publish`)).json;
  expect(info.publishedVersionId).not.toBeNull();
  expect(info.webhook.active).toBe(true);
});

test("[fl-copilot.1] Create with Copilot turns a request into a reviewed proposal and a draft flow only after approval", { ...SESSION, tags: ["feat:fl-copilot", "shard:ui-builder", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "builder-5");
  await connectAi(http, ws.id, "builder-5");
  await app.open(`/w/${ws.slug}/flows`);
  await agent.act("open Create with Copilot, enter the request {request} and ask for a proposal", { params: { request: "Every Monday summarize the KPIs and email leadership" } });
  await expect(screen.getByTestId("copilot-proposal")).toBeVisible({ timeout: 30_000 });
  expect(((await http.get(`/api/workspaces/${ws.id}/flows`)).json.flows as unknown[]).length).toBe(0);
  await agent.assert("Copilot shows a proposal with the steps it would add and buttons to approve or reject it");
  await agent.act("approve the proposal and create the draft");
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/flows/[0-9a-f-]{36}$`), { timeout: 30_000 });
  const flows = (await http.get(`/api/workspaces/${ws.id}/flows`)).json.flows as { publishedVersion: number | null; runCount: number }[];
  expect(flows).toHaveLength(1);
  expect(flows[0]).toMatchObject({ publishedVersion: null, runCount: 0 });
});
