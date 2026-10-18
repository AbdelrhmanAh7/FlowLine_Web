// Issue #117: the flow list and the dashboard numbers summarise each flow's last run, success rate and publication
// (mirrors the hub's [fl-flows-list.3], which failed on main @ d211653). Request-level (no model).
// The stable-gate failure was NOT the run status: the row already had lastRunStatus "succeeded" (the issue text cut the
// message off mid-word). The mismatch was publishedVersion: 3, expected 1 — every manual run stored a "run" snapshot in
// flow_version and took a version number, so the first publication after two runs was v3. Run snapshots are now unnumbered.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = process.env.E2E_ARMY_PASSWORD || "Army-Passw0rd!";
const FIXED = "fl_test_beta_mode=open; fl_locale=en";
/** Deterministic per stack: derived from a fixed seed and the stack URL, never from the clock. */
const seeded = (base: string, seed: string, n = 10) =>
  createHash("sha256").update(`${base}|${seed}`).digest("base64url").slice(0, n).toLowerCase().replace(/[^a-z0-9]/g, "x");

type Headers = Record<string, string>;
interface Res { status: number; json: unknown }
/** One row of GET /api/workspaces/:id/flows, as the flow list renders it. */
interface FlowRow {
  id: string;
  runCount: number;
  lastRunStatus: string | null;
  successRate: number | null;
  publishedVersion: number | null;
  nodeCount: number;
  trigger: string | null;
  hasTrigger: boolean;
}

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its request headers. */
async function signedIn(base: string, email: string): Promise<Headers> {
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED };
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    let token: string | null = null;
    await expect.poll(async () => {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      return token !== null;
    }, { timeout: 12_000, interval: 250, message: "no verification e-mail in the test outbox" }).toBe(true);
    if (!token) throw new Error("no verification e-mail in the test outbox");
    const v = await fetch(`${base}/api/email`, { method: "POST", headers: h, body: JSON.stringify({ action: "verify", token }) });
    if (!v.ok) throw new Error(`verify ${v.status}`);
  }
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(res.status).toBe(200);
  const session = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { ...h, cookie: `${FIXED}; ${session}` };
}

function client(base: string, headers: Headers) {
  const call = async (method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: r.status, json };
  };
  return { get: (p: string) => call("GET", p), post: (p: string, b?: unknown) => call("POST", p, b ?? {}), put: (p: string, b: unknown) => call("PUT", p, b) };
}
type Http = ReturnType<typeof client>;

/** trigger -> transform -> output: three nodes; `expression` is JSONata over the trigger payload. */
const chain = (payload: unknown, expression: string) => ({
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 100 }, data: { label: "Start", config: { samplePayload: JSON.stringify(payload) } } },
    { id: "shape", type: "transform.json", position: { x: 300, y: 100 }, data: { label: "shape", config: { expression } } },
    { id: "out", type: "output", position: { x: 900, y: 100 }, data: { label: "out", config: { key: "result", expression: "" } } },
  ],
  edges: [
    { id: "e-t-shape-out", source: "t", target: "shape", sourceHandle: "out" },
    { id: "e-shape-out-out", source: "shape", target: "out", sourceHandle: "out" },
  ],
});

async function createFlow(http: Http, workspaceId: string, name: string) {
  const r = await http.post(`/api/workspaces/${workspaceId}/flows`, { name });
  expect(r.status).toBe(201);
  return (r.json as { flow: { id: string; revision: number } }).flow;
}
async function newFlow(http: Http, workspaceId: string, name: string, graph: unknown) {
  const f = await createFlow(http, workspaceId, name);
  const r = await http.put(`/api/flows/${f.id}`, { baseRevision: f.revision, graph });
  expect(r.status).toBe(200);
  return (r.json as { flow: { id: string; revision: number } }).flow;
}
/** Starts a manual run and waits until it is terminal (a failed run is a valid outcome here, not an error). */
async function runToEnd(http: Http, flowId: string) {
  const started = await http.post(`/api/flows/${flowId}/runs`);
  expect(started.status).toBe(202);
  const runId = (started.json as { run: { id: string } }).run.id;
  await expect
    .poll(async () => ((await http.get(`/api/runs/${runId}`)).json as { run?: { status?: string } } | null)?.run?.status, { timeout: 60_000, interval: 500 })
    .toMatch(/^(succeeded|failed|cancelled)$/);
}

test(
  "@issue-204 (from #117) AC1: the flow list and dashboard show each flow's last run, success rate and first published version (v1)",
  { tags: ["feat:fl-flows-list", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const http = client(base, await signedIn(base, `army-117-${seeded(base, "army-117-owner")}@flowline-e2e.test`));
    const created = await http.post("/api/workspaces", { name: `List ${seeded(base, "army-117-ws", 6)}` });
    expect(created.status).toBe(201);
    const ws = (created.json as { workspace: { id: string } }).workspace;
    const w = `/api/workspaces/${ws.id}`;

    // Empty case: a new workspace lists no flows.
    expect(((await http.get(`${w}/flows`)).json as { flows: unknown[] }).flows.length).toBe(0);

    const good = await newFlow(http, ws.id, `Listed good ${seeded(base, "army-117-good", 4)}`, chain({ n: 1 }, "$"));
    const bad = await newFlow(http, ws.id, `Listed bad ${seeded(base, "army-117-bad", 4)}`, chain({ n: 1 }, '$number("x")'));
    const draft = await createFlow(http, ws.id, `Listed draft ${seeded(base, "army-117-draft", 4)}`);
    for (const id of [good.id, good.id, bad.id]) await runToEnd(http, id);
    expect((await http.post(`/api/flows/${good.id}/publish`)).status).toBe(201);

    const rows = ((await http.get(`${w}/flows`)).json as { flows: FlowRow[] }).flows;
    expect(rows).toHaveLength(3);
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(good.id)).toMatchObject({ runCount: 2, lastRunStatus: "succeeded", successRate: 1, publishedVersion: 1, nodeCount: 3, trigger: "trigger.manual" });
    expect(row(bad.id)).toMatchObject({ runCount: 1, lastRunStatus: "failed", successRate: 0, publishedVersion: null });
    expect(row(draft.id)).toMatchObject({ runCount: 0, lastRunStatus: null, successRate: null, nodeCount: 0, hasTrigger: false });

    // The flows dashboard renders the rows above (same endpoint), so publishedVersion 1 is what it shows. The workspace
    // overview has no version field: it only counts the same flows and the active runs.
    const overview = (await http.get(`${w}/overview`)).json;
    expect(overview).toMatchObject({ flows: 3, activeRuns: 0 });
  },
);

// ── #117 spec AC1–AC5: the run summary in GET /api/v1/flows and the flow list ────────────────────────────────────────
// The test above and its helpers stay as on main (the issue spec's AC6), so this test has its own run helper that
// returns the finished run. It adds the public API, runs on both sides of a publication, and a paused flow.

/** The run-summary fields of one row of GET /api/v1/flows or GET /api/workspaces/:id/flows. */
interface SummaryRow { id: string; runCount: number; lastRunStatus: string | null; lastRunAt: string | null }

/** Starts a manual run, waits until it is terminal and returns it as GET /api/runs/:id reports it. */
async function finishedRun(http: Http, flowId: string) {
  const started = await http.post(`/api/flows/${flowId}/runs`);
  expect(started.status).toBe(202);
  const runId = (started.json as { run: { id: string } }).run.id;
  const read = async () => ((await http.get(`/api/runs/${runId}`)).json as { run: { status: string; finishedAt: string | null } }).run;
  await expect.poll(async () => (await read()).status, { timeout: 60_000, interval: 500 }).toMatch(/^(succeeded|failed|cancelled)$/);
  return read();
}

test(
  "@issue-117 AC1-AC5: GET /api/v1/flows and the flow list count runs before and after publishing v3, show the last finished run, keep run-less and paused flows",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api", "feat:fl-public-api-v1", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const headers = await signedIn(base, `army-117-${seeded(base, "army-117-owner")}@flowline-e2e.test`);
    const http = client(base, headers);
    const created = await http.post("/api/workspaces", { name: `Runs ${seeded(base, "army-117-runs-ws", 6)}` });
    expect(created.status).toBe(201);
    const ws = (created.json as { workspace: { id: string } }).workspace;
    const w = `/api/workspaces/${ws.id}`;
    const slack = await http.post(`${w}/connections`, { provider: "slack", label: `Slack ${seeded(base, "army-117-slack", 4)}`, fields: { token: "test-token" } });
    expect(slack.status).toBe(201);
    const connectionId = (slack.json as { connection: { id: string } }).connection.id;

    // v1 and v2 publish a step that fails, so the run before v3 fails.
    const flow = await newFlow(http, ws.id, `Spans ${seeded(base, "army-117-spans", 4)}`, chain({ n: 1 }, '$number("x")'));
    for (let i = 0; i < 2; i++) expect((await http.post(`/api/flows/${flow.id}/publish`)).status).toBe(201);
    const before = await finishedRun(http, flow.id);
    expect(before.status).toBe("failed");
    // The next revision posts to Slack instead. v3 publishes it, and the run after v3 succeeds.
    const posting = {
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 100 }, data: { label: "Start", config: { samplePayload: "{}" } } },
        { id: "post", type: "integration.action", position: { x: 300, y: 100 }, data: { label: "post", config: { actionId: "slack.post_message", connectionId, inputMapping: JSON.stringify({ channel: "C001GEN", text: `Spans ${seeded(base, "army-117-text", 6)}` }), requireApproval: false } } },
        { id: "out", type: "output", position: { x: 900, y: 100 }, data: { label: "out", config: { key: "sent", expression: "" } } },
      ],
      edges: [
        { id: "e-t-post", source: "t", target: "post", sourceHandle: "out" },
        { id: "e-post-out", source: "post", target: "out", sourceHandle: "out" },
      ],
    };
    expect((await http.put(`/api/flows/${flow.id}`, { baseRevision: flow.revision, graph: posting })).status).toBe(200);
    expect((await http.post(`/api/flows/${flow.id}/publish`)).status).toBe(201);
    const after = await finishedRun(http, flow.id);
    expect(after.status).toBe("succeeded");
    expect(after.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(Date.parse(after.finishedAt!)).toBeGreaterThan(Date.parse(before.finishedAt!));
    const idle = await createFlow(http, ws.id, `Idle ${seeded(base, "army-117-idle", 4)}`);

    // The public API is read with a flows:read key and no session.
    const minted = await http.post(`${w}/api-keys`, { name: `List ${seeded(base, "army-117-key", 4)}`, mode: "test", scopes: ["flows:read"] });
    expect(minted.status).toBe(201);
    const key = (minted.json as { key: string }).key;
    const publicApi = async () => {
      const r = await fetch(`${base}/api/v1/flows`, { headers: { authorization: `Bearer ${key}` } });
      expect(r.status).toBe(200);
      const flows = ((await r.json()) as { flows: SummaryRow[] }).flows;
      return (id: string) => flows.find((f) => f.id === id);
    };
    const flowList = async () => {
      const flows = ((await http.get(`${w}/flows`)).json as { flows: SummaryRow[] }).flows;
      return (id: string) => flows.find((f) => f.id === id);
    };

    // AC1-AC3: both runs count, and the last run is the one that finished last, at the time it finished.
    const summary = { runCount: 2, lastRunStatus: "succeeded", lastRunAt: after.finishedAt };
    let v1 = await publicApi();
    expect(v1(flow.id)).toMatchObject({ ...summary, publishedVersion: 3, paused: false });
    // AC4: a flow that never ran is still listed, with no runs and no last run.
    expect(v1(idle.id)).toMatchObject({ runCount: 0, lastRunStatus: null, lastRunAt: null, publishedVersion: null });
    let list = await flowList();
    expect(list(flow.id)).toMatchObject({ ...summary, successRate: 0.5, publishedVersion: 3, pausedReason: null });
    expect(list(idle.id)).toMatchObject({ runCount: 0, lastRunStatus: null, lastRunAt: null, successRate: null });

    // AC5: removing the Slack connection pauses the flow that uses it, and its run summary stays the same.
    expect((await fetch(`${base}/api/connections/${connectionId}`, { method: "DELETE", headers })).status).toBe(200);
    v1 = await publicApi();
    expect(v1(flow.id)).toMatchObject({ ...summary, publishedVersion: 3, paused: true });
    list = await flowList();
    expect(list(flow.id)).toMatchObject({ ...summary, pausedReason: `connection:${connectionId}:removed` });
  },
);
