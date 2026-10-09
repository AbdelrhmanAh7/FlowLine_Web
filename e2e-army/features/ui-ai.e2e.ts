// UI AI shard (agent steps + exact checks): integrations (OAuth through the provider's consent page), knowledge, agents, and approving a gated
// action from the run inspector. Session fl-user (English UI); every test works in a fresh workspace.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { needsModel, seeded } from "../lib.ts";
import { E, N, actor, connect, connectAi, freshWorkspace, newFlow, startRun, waitRun, type Graph } from "./_helpers.ts";

const SESSION = { session: "fl-user" } as const;

test("[fl-integrations.1] the owner connects Slack from the Integrations page through the provider's consent and sees it connected", { ...SESSION, tags: ["feat:fl-integrations", "shard:ui-ai", "lvl:ui"] }, async ({ app, screen, agent, browser }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "ai-1");
  await app.open(`/w/${ws.slug}/integrations`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Integrations");
  await expect(screen.getByText("No connections yet")).toBeVisible();
  await agent.act("connect Slack");
  await expect(browser).toHaveURL(new RegExp(`/w/${ws.slug}/integrations`), { timeout: 30_000 });
  await expect(screen.getByTestId("connection-slack")).toBeVisible({ timeout: 30_000 });
  await agent.assert("a Slack connection card is shown as connected on the Integrations page");
  const conns = (await http.get(`/api/workspaces/${ws.id}/connections`)).json.connections as { provider: string; status: string; authType: string }[];
  expect(conns).toEqual([expect.objectContaining({ provider: "slack", status: "active", authType: "oauth2" })]);
  await agent.act("search the integrations catalog for {q}", { params: { q: "postgres" } });
  await expect(screen.getByText("PostgreSQL").first()).toBeVisible();
});

test("[fl-knowledge.1] the owner adds a text source in Knowledge, waits for indexing and finds a cited passage", { ...SESSION, tags: ["feat:fl-knowledge", "shard:ui-ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "ai-2");
  const title = `Refund policy ${seeded("ai-2-title", 4)}`;
  await app.open(`/w/${ws.slug}/knowledge`);
  await expect(screen.getByText("No knowledge yet")).toBeVisible();
  await agent.act("add the text source titled {title} with the text {text}", { params: { title, text: "Refund policy: customers may request a refund within 30 days of purchase." } });
  await expect.poll(async () => ((await http.get(`/api/workspaces/${ws.id}/knowledge`)).json.sources as any[]).find((s) => s.name === title)?.status, { timeout: 40_000, interval: 500 }).toBe("ready");
  await expect(screen.getByTestId(`source-${title}`)).toBeVisible();
  await agent.act("search the knowledge for {q}", { params: { q: "refund" } });
  await expect(screen.getByText("30 days", { exact: false }).first()).toBeVisible();
  await agent.assert("the search results show a passage about refunds within 30 days with the source title cited");
});

test("[fl-agents.1] the owner creates an agent in the UI and chats with it; the answer cites the knowledge it used", { ...SESSION, tags: ["feat:fl-agents", "shard:ui-ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "ai-3");
  await connectAi(http, ws.id, "ai-3");
  const title = `Returns FAQ ${seeded("ai-3-title", 4)}`;
  const src = (await http.post(`/api/workspaces/${ws.id}/knowledge`, { json: { name: title, text: "Returns: items can be sent back within 14 days in the original packaging." } })).json.source;
  await expect.poll(async () => ((await http.get(`/api/workspaces/${ws.id}/knowledge`)).json.sources as any[]).find((s) => s.id === src.id)?.status, { timeout: 40_000, interval: 500 }).toBe("ready");
  await app.open(`/w/${ws.slug}/agents`);
  await expect(screen.getByText("No agents yet")).toBeVisible();
  const name = `Returns bot ${seeded("ai-3-name", 4)}`;
  await agent.act("create a new agent named {name} with the instructions {text} and save it", { params: { name, text: "Answer questions about returns using the knowledge." } });
  await expect.poll(async () => ((await http.get(`/api/workspaces/${ws.id}/agents`)).json.agents as any[]).find((a) => a.name === name)?.version, { timeout: 30_000, interval: 500 }).toBe(1);
  const created = ((await http.get(`/api/workspaces/${ws.id}/agents`)).json.agents as any[]).find((a) => a.name === name);
  expect(created.tools).toEqual([expect.objectContaining({ tool: "knowledge_search", permission: "allow" })]);
  // Granting the agent this knowledge source is a new immutable version (the pick list itself is exercised at API level in fl-agents.2/.3).
  const v2 = await http.put(`/api/agents/${created.id}`, { json: { name, instructions: "Answer questions about returns using the knowledge.", tools: [{ tool: "knowledge_search", permission: "allow" }], knowledgeSourceIds: [src.id] } });
  expect(v2.status).toBe(200);
  await app.open(`/w/${ws.slug}/agents/${created.id}`);
  await agent.act("ask the agent {q}", { params: { q: "How many days do I have to return an item?" } });
  await expect(screen.getByText(/14 days/).first()).toBeVisible({ timeout: 40_000 });
  await agent.assert("the agent answered that items can be returned within 14 days and cites the source it used");
});

test("[fl-approvals.3] a gated action waits in the run inspector and a person approves it, after which the run completes", { ...SESSION, tags: ["feat:fl-approvals", "shard:ui-ai", "lvl:ui"] }, async ({ app, screen, agent }) => {
  needsModel();
  const { http } = await actor("ui-owner");
  const ws = await freshWorkspace(http, "ai-4");
  const conn = await connect(http, ws.id, "slack", `Slack ${seeded("ai-4-conn", 4)}`);
  const text = `UI approved ${seeded("ai-4-text", 8)}`;
  const g: Graph = { nodes: [N.manual({}), N.action("post", "slack.post_message", conn.id, JSON.stringify({ channel: "C001GEN", text }), true), N.output("o", "sent")], edges: [E("t", "post"), E("post", "o")] };
  const f = await newFlow(http, ws.id, `Gated UI ${seeded("ai-4-flow", 4)}`, g);
  const run = (await startRun(http, f.id)).json.run;
  const waiting = await waitRun(http, run.id, ["waiting_approval"]);
  await app.open(`/w/${ws.slug}/runs?status=waiting&run=${run.id}`);
  await expect(screen.getByRole("heading", { level: 1 })).toHaveText("Run history");
  await agent.act("approve the pending action of this run");
  await expect.poll(async () => (await http.get(`/api/runs/${run.id}`)).json.run.status, { timeout: 40_000, interval: 500 }).toBe("succeeded");
  const done = (await http.get(`/api/runs/${run.id}`)).json.run;
  expect(done.approvals[0]).toMatchObject({ id: waiting.approvals[0].id, status: "approved" });
  expect(done.output.sent.channel).toBe("C001GEN");
  await app.open(`/w/${ws.slug}/runs?run=${run.id}`);
  await expect(screen.getByText(`#${run.number}`).first()).toBeVisible();
  await agent.assert("the run is shown as succeeded with all its steps completed");
});
