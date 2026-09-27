import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { DESIGN_TEMPLATES } from "@/engine/design-templates";
import { stopSandbox } from "@/engine/sandbox";
import type { FlowGraph } from "@/engine/types";
import { validateGraph } from "@/engine/validate";
import { decide } from "@/server/approvals";
import { createConnection } from "@/server/connections";
import { createFlow, saveFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { claimNextRun, processRun } from "../../worker/runner";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { startFake, type Fake } from "../contract/helpers";
import { claimAndProcess, closeDb, freshRun, makeUser, unique } from "./helpers";

let fake: Fake;
let ai: Awaited<ReturnType<typeof startFakeAi>>;
const prev = { ...process.env };
const PG = new URL(process.env.DATABASE_URL!);

beforeAll(async () => {
  fake = await startFake();
  ai = await startFakeAi(0);
  process.env.OLLAMA_BASE_URL = ai.url;
  process.env.FLOWLINE_AI_PROVIDER = "ollama";
  process.env.FLOWLINE_AI_MODEL = "fake-model";
  // Exact host:port pairs only: the fake providers, the fake AI/pricing page, and the local Postgres.
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `${process.env.FLOWLINE_EGRESS_ALLOWLIST},127.0.0.1:${ai.port},127.0.0.1:${PG.port}`;
  // A KPI table in the test database, read through the real Postgres adapter.
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("create table if not exists kpi_weekly (metric text primary key, value numeric not null)");
  await c.query("insert into kpi_weekly values ('active_users', 1284), ('revenue_k', 312), ('churn_pct', 2.1) on conflict (metric) do update set value = excluded.value");
  await c.end();
  for (let i = 0; i < 200; i++) {
    const id = await claimNextRun(db, "drain");
    if (!id) break;
    await processRun(db, id, "drain");
  }
});
afterAll(async () => {
  Object.assign(process.env, prev);
  stopSandbox();
  await ai.close();
  await fake.close();
  await closeDb();
});

/** What a user does after "Use template": pick connections and replace the placeholders. */
function setUp(graph: FlowGraph, connections: Record<string, string>, values: Record<string, string>): FlowGraph {
  const g = structuredClone(graph);
  for (const node of g.nodes) {
    const cfg = node.data.config as unknown as Record<string, unknown>;
    if (node.type === "integration.action") cfg.connectionId = connections[String(cfg.actionId).split(".")[0]!] ?? "";
    for (const [k, v] of Object.entries(cfg)) {
      if (typeof v === "string") cfg[k] = v.replace(/REPLACE_WITH_[A-Z0-9_]+/g, (m) => values[m] ?? m);
    }
  }
  return g;
}

async function fromTemplate(id: string, connFor: string[], values: Record<string, string>, adjust?: (g: FlowGraph) => void) {
  const user = await makeUser("tpl");
  const ws = await createWorkspace(user, unique("Templates"));
  const connections: Record<string, string> = {};
  for (const p of connFor) {
    const fields: Record<string, string> =
      p === "postgres"
        ? { connectionString: `postgres://${PG.username}:${PG.password}@127.0.0.1:${PG.port}/${PG.pathname.slice(1)}` }
        : p === "zendesk"
          ? { email: "agent@acme.test", token: "test-token", subdomain: "acme" }
          : { token: "test-token" };
    connections[p] = (await createConnection(db, user.id, ws.id, p, `${p} (test)`, fields)).id;
  }
  const flow = await createFlow(user, ws.id, { templateId: id });
  const tpl = DESIGN_TEMPLATES.find((t) => t.id === id)!;
  // Fresh from the template, setup is required.
  expect(validateGraph(flow.graph as FlowGraph).some((i) => i.code === "SETUP_REQUIRED" || i.code === "MISSING_CONNECTION")).toBe(true);
  const graph = setUp(tpl.graph, connections, values);
  adjust?.(graph);
  expect(validateGraph(graph)).toEqual([]);
  await saveFlow(user, flow.id, { baseRevision: 1, graph });
  return { user, ws, flow };
}

async function run(user: Awaited<ReturnType<typeof makeUser>>, flowId: string) {
  const r = await enqueueRun(user, flowId);
  await claimAndProcess(r.id);
  return r.id;
}
const steps = async (runId: string) => Object.fromEntries((await db.select().from(schema.runStep).where(eq(schema.runStep.runId, runId))).map((s) => [s.nodeId, s]));
const lastPost = async (provider: string, suffix: string) => (await fake.requests(provider)).filter((r) => r.method === "POST" && r.path.endsWith(suffix)).at(-1);
const posts = async (provider: string, suffix: string) => (await fake.requests(provider)).filter((r) => r.method === "POST" && r.path.endsWith(suffix)).length;

describe("the six design templates run end-to-end (deterministic provider doubles)", () => {
  it("Lead Enrichment Pipeline: hot lead → sheet row + Slack alert; small lead → nurture", async () => {
    await fake.reset();
    const { user, flow } = await fromTemplate("lead-enrichment", ["google_sheets", "slack"], { REPLACE_WITH_SPREADSHEET_ID: "sheet-1", REPLACE_WITH_CHANNEL_ID: "C_SALES" });
    const id = await run(user, flow.id);
    const r = await freshRun(id);
    expect(r.status).toBe("succeeded");
    const s = await steps(id);
    expect(s.enrich!.output).toMatchObject({ company: "Analytical Engines Ltd", domain: "analytical.io", industry: "Fintech", headcount: 250 });
    expect(s.score!.output).toMatchObject({ label: "hot" });
    expect(s.nurture!.status).toBe("skipped");
    expect(JSON.stringify((await lastPost("google_sheets", ":append"))?.body)).toContain("Analytical Engines Ltd");
    expect(JSON.stringify((await lastPost("slack", "chat.postMessage"))?.body)).toContain("Hot lead: Ada Lovelace");
    expect(s.enrich!.meta).toMatchObject({ provider: "ollama", model: "fake-model" });

    const cold = await enqueueRun(user, flow.id, { input: { body: { lead: { name: "Tiny Co", email: "x@tiny.test", company: "Tiny", employees: 4, industry: "Retail", role: "Owner" } } } });
    await claimAndProcess(cold.id);
    const c = await freshRun(cold.id);
    expect(c.output).toEqual({ nurture: { name: "Tiny Co", score: "cold" } });
  });

  it("Support Ticket Triage: open tickets → AI digest → Slack", async () => {
    await fake.reset();
    const { user, flow } = await fromTemplate("support-triage", ["zendesk", "slack"], { REPLACE_WITH_CHANNEL_ID: "C_SUPPORT" });
    const before = await posts("slack", "chat.postMessage");
    const id = await run(user, flow.id);
    expect((await freshRun(id)).status).toBe("succeeded");
    const s = await steps(id);
    expect((s.fetch!.output as { tickets: unknown[] }).tickets.length).toBeGreaterThan(0);
    expect((s.digest!.output as { text: string }).text).toMatch(/Summary/);
    expect(await posts("slack", "chat.postMessage")).toBe(before + 1);
    expect(JSON.stringify((await lastPost("slack", "chat.postMessage"))?.body)).toMatch(/Ticket triage \(\d+ open\)/);
  });

  it("Invoice PDF Extractor: PDF text extracted, ledger row added, reply only after approval — to the real sender", async () => {
    await fake.reset();
    const { user, ws, flow } = await fromTemplate("invoice-extractor", ["gmail", "google_sheets"], { REPLACE_WITH_LEDGER_SPREADSHEET_ID: "sheet-1" });
    const id = await run(user, flow.id);
    expect((await freshRun(id)).status).toBe("waiting_approval");
    const s = await steps(id);
    expect((s.pdf!.output as { text: string }).text).toContain("INV-001");
    expect(s.extract!.output).toMatchObject({ invoice_number: "INV-001", vendor: "Acme Supplies", total: 1250, due_date: "2026-10-15" });
    expect(JSON.stringify((await lastPost("google_sheets", ":append"))?.body)).toContain("INV-001");
    expect(await posts("gmail", "/messages/send")).toBe(0);
    const [ap] = await db.select().from(schema.approval).where(eq(schema.approval.runId, id));
    expect(ap!.argsPreview).toMatchObject({ to: "billing@acme-supplies.test" });
    await decide(db, { workspaceId: ws.id, approvalId: ap!.id, userId: user.id, decision: "approve" });
    await claimAndProcess(id);
    expect((await freshRun(id)).status).toBe("succeeded");
    expect(await posts("gmail", "/messages/send")).toBe(1);
  });

  it("Invoice PDF Extractor ignores instructions embedded in the document", async () => {
    await fake.reset();
    const { user, ws, flow } = await fromTemplate("invoice-extractor", ["gmail", "google_sheets"], { REPLACE_WITH_LEDGER_SPREADSHEET_ID: "sheet-1" }, (g) => {
      const msg = g.nodes.find((n) => n.id === "msg")!;
      (msg.data.config as unknown as { inputMapping: string }).inputMapping = '{ "messageId": messages[1].id }'; // the INV-002 email with the injection line
    });
    const id = await run(user, flow.id);
    const s = await steps(id);
    expect((s.pdf!.output as { text: string }).text).toContain("IGNORE PREVIOUS INSTRUCTIONS");
    expect(s.extract!.output).toMatchObject({ vendor: "Globex Corporation", total: 980.5 });
    expect(JSON.stringify(s.extract!.output)).not.toContain("attacker");
    const [ap] = await db.select().from(schema.approval).where(eq(schema.approval.runId, id));
    expect(ap!.argsPreview).toMatchObject({ to: "ap@globex.test" }); // recipient = the real sender, set by config, not by the document
    await decide(db, { workspaceId: ws.id, approvalId: ap!.id, userId: user.id, decision: "approve" });
    await claimAndProcess(id);
    const sends = (await fake.requests("gmail")).filter((r) => r.path.endsWith("/messages/send"));
    expect(sends).toHaveLength(1);
    expect(JSON.stringify(sends)).not.toContain("attacker@evil.test");
    const ai_ = await (await fetch(`${ai.url}/__fake/requests`)).json();
    const seen = JSON.stringify(ai_);
    expect(seen).not.toContain("IGNORE PREVIOUS INSTRUCTIONS"); // quarantined before the model saw it…
    expect(seen).toContain("[removed by Flowline: text that tried to instruct the AI]");
    expect(s.extract!.meta).toMatchObject({ quarantinedLines: 1 }); // …and the step says so
    const events = await db.select().from(schema.runEvent).where(eq(schema.runEvent.runId, id));
    expect(events.map((e) => e.type)).toContain("ai_instructions_quarantined");
  });

  it("Competitor Price Watch: first observation alerts, unchanged is quiet, a >5% change alerts", async () => {
    await fake.reset();
    await fetch(`${ai.url}/__fake/reset`, { method: "POST" });
    const { user, flow } = await fromTemplate("price-watch", ["slack"], { REPLACE_WITH_PRICING_URL: `http://127.0.0.1:${ai.port}/pricing`, REPLACE_WITH_CHANNEL_ID: "C_MKT" });
    const alerts = () => posts("slack", "chat.postMessage");
    const a0 = await alerts();
    const r1 = await run(user, flow.id);
    expect((await steps(r1)).price!.output).toMatchObject({ plan: "Pro", price: 49 });
    expect(await alerts()).toBe(a0 + 1);
    const r2 = await run(user, flow.id);
    expect((await freshRun(r2)).output).toEqual({ status: "unchanged" });
    expect(await alerts()).toBe(a0 + 1);
    await fetch(`${ai.url}/__fake/pricing`, { method: "POST", body: JSON.stringify({ price: 59 }) });
    await run(user, flow.id);
    expect(await alerts()).toBe(a0 + 2);
    expect(JSON.stringify((await lastPost("slack", "chat.postMessage"))?.body)).toContain("was 49");
  });

  it("Competitor Price Watch refuses private/metadata sources", async () => {
    const { user, flow } = await fromTemplate("price-watch", ["slack"], { REPLACE_WITH_PRICING_URL: "http://169.254.169.254/latest/meta-data/", REPLACE_WITH_CHANNEL_ID: "C_MKT" });
    const id = await run(user, flow.id);
    expect((await freshRun(id)).error?.code).toBe("EGRESS_BLOCKED");
  });

  it("Weekly KPI Digest: real Postgres query → AI narrative → email after approval", async () => {
    await fake.reset();
    const { user, ws, flow } = await fromTemplate("kpi-digest", ["postgres", "gmail"], { REPLACE_WITH_LEADERSHIP_EMAIL: "leadership@acme.test" });
    const id = await run(user, flow.id);
    expect((await freshRun(id)).status).toBe("waiting_approval");
    const s = await steps(id);
    const rows = (s.query!.output as { rows: { metric: string; value: string }[] }).rows;
    expect(rows.map((r) => r.metric)).toEqual(["active_users", "churn_pct", "revenue_k"]);
    expect((s.story!.output as { text: string }).text).toContain("active_users: 1284");
    const [ap] = await db.select().from(schema.approval).where(eq(schema.approval.runId, id));
    await decide(db, { workspaceId: ws.id, approvalId: ap!.id, userId: user.id, decision: "approve" });
    await claimAndProcess(id);
    expect((await freshRun(id)).status).toBe("succeeded");
    expect(await posts("gmail", "/messages/send")).toBe(1);
  });

  it("PR Review Router: risky migration PR → Linear follow-up with the AI summary", async () => {
    await fake.reset();
    const { user, flow } = await fromTemplate("pr-review-router", ["github", "linear"], { REPLACE_WITH_LINEAR_TEAM_ID: "team-eng" });
    const before = await posts("linear", "/graphql");
    const id = await run(user, flow.id);
    expect((await freshRun(id)).status).toBe("succeeded");
    const s = await steps(id);
    expect(s.review!.output).toMatchObject({ risky: true });
    expect(s.fine!.status).toBe("skipped");
    const linearCalls = (await fake.requests("linear")).filter((r) => r.method === "POST");
    expect(linearCalls.length).toBeGreaterThan(before);
    expect(JSON.stringify(linearCalls.at(-1)?.body)).toContain("Review risky PR #7");
  });

  it("each template creates an independent flow", async () => {
    const user = await makeUser("indep");
    const ws = await createWorkspace(user, unique("Indep"));
    const a = await createFlow(user, ws.id, { templateId: "lead-enrichment" });
    const b = await createFlow(user, ws.id, { templateId: "lead-enrichment" });
    const g = structuredClone(a.graph as FlowGraph);
    g.nodes[0]!.data.label = "Edited";
    await saveFlow(user, a.id, { baseRevision: 1, graph: g });
    const [bRow] = await db.select().from(schema.flow).where(eq(schema.flow.id, b.id));
    expect((bRow!.graph as FlowGraph).nodes[0]!.data.label).toBe("Form submitted");
    expect(DESIGN_TEMPLATES.find((t) => t.id === "lead-enrichment")!.graph.nodes[0]!.data.label).toBe("Form submitted");
  });
});
