// Issue #117: the flow list and the dashboard numbers summarise each flow's last run, success rate and publication
// (mirrors the hub's [fl-flows-list.3], which failed on main @ d211653). Request-level (no model).
// The stable-gate failure was NOT the run status: the row already had lastRunStatus "succeeded" (the issue text cut the
// message off mid-word). The mismatch was publishedVersion: 3, expected 1 — every manual run stored a "run" snapshot in
// flow_version and took a version number, so the first publication after two runs was v3. Run snapshots are now unnumbered.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD = "Army-Passw0rd!";
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

// Issue #375 (split from PR #362 finding r4337196672):
// In PR #362 (which branched off main to add n8n import), AC2 asserted "the flow list did not change" on invalid import
// relying solely on alert visibility without capturing flow count or IDs before/after.
//
// Why this API test is the canonical substitute:
// PR #362 was closed unmerged after 6 fix rounds. The n8n import feature was restarted in issue #368.
// Because the n8n import UI and route do not exist on main, an e2e test calling 'Import from n8n' cannot run on main.
// On main, 117-flows-list-dashboard.e2e.ts is the canonical test suite for `feat:fl-flows-list`. Flow creation occurs
// via POST /api/workspaces/:wid/flows (direct creation and templates). This test validates the flow list invariance
// contract across all refusal paths on main: unknown templates return 400 UNKNOWN_TEMPLATE, invalid payload types
// return 400 VALIDATION, and whitespace-only names return 400 VALIDATION. In all cases, flow count and IDs captured
// before and after match exactly. Route handler status codes and error responses are verified by unit tests in
// tests/unit/flows-list-ac2-guard.test.ts.
test(
  "@issue-375 AC1: invalid flow creation is rejected and flow count and IDs remain unchanged (supersedes part of #362)",
  { tags: ["feat:fl-flows-list", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const http = client(base, await signedIn(base, `army-375-${seeded(base, "army-375-owner")}@flowline-e2e.test`));
    const created = await http.post("/api/workspaces", { name: `Reject ${seeded(base, "army-375-ws", 6)}` });
    expect(created.status).toBe(201);
    const ws = (created.json as { workspace: { id: string } }).workspace;
    const w = `/api/workspaces/${ws.id}`;

    // Seed one valid flow so the initial list is non-empty.
    const initialFlow = await createFlow(http, ws.id, `Existing ${seeded(base, "army-375-init", 4)}`);
    expect(initialFlow.id).toBeTruthy();

    // Capture flow list (count and IDs) before the invalid creation attempt.
    const beforeRows = ((await http.get(`${w}/flows`)).json as { flows: FlowRow[] }).flows;
    const beforeIds = beforeRows.map((f) => f.id);
    expect(beforeRows).toHaveLength(1);
    expect(beforeIds).toContain(initialFlow.id);

    // Attempt invalid flow creation: unknown template ID.
    const invalidTemplateRes = await http.post(`${w}/flows`, { templateId: "non-existent-template-id" });
    expect(invalidTemplateRes.status).toBe(400);
    expect((invalidTemplateRes.json as { error?: { code?: string } }).error?.code).toBe("UNKNOWN_TEMPLATE");

    // Verify flow list did not change: flow count and IDs captured before and after match exactly.
    const afterInvalidTemplateRows = ((await http.get(`${w}/flows`)).json as { flows: FlowRow[] }).flows;
    const afterInvalidTemplateIds = afterInvalidTemplateRows.map((f) => f.id);
    expect(afterInvalidTemplateRows).toHaveLength(beforeRows.length);
    expect(afterInvalidTemplateIds).toEqual(beforeIds);

    // Attempt invalid flow creation: invalid malformed body types (e.g. numeric name).
    const invalidBodyRes = await http.post(`${w}/flows`, { name: 12345 });
    expect(invalidBodyRes.status).toBe(400);
    expect((invalidBodyRes.json as { error?: { code?: string } }).error?.code).toBe("VALIDATION");

    // Verify flow list did not change after second rejected attempt.
    const afterInvalidBodyRows = ((await http.get(`${w}/flows`)).json as { flows: FlowRow[] }).flows;
    const afterInvalidBodyIds = afterInvalidBodyRows.map((f) => f.id);
    expect(afterInvalidBodyRows).toHaveLength(beforeRows.length);
    expect(afterInvalidBodyIds).toEqual(beforeIds);

    // Attempt invalid flow creation: whitespace-only name rejected by schema.
    const invalidNameRes = await http.post(`${w}/flows`, { name: "   " });
    expect(invalidNameRes.status).toBe(400);
    expect((invalidNameRes.json as { error?: { code?: string } }).error?.code).toBe("VALIDATION");

    // Verify flow list did not change after third rejected attempt.
    const afterInvalidNameRows = ((await http.get(`${w}/flows`)).json as { flows: FlowRow[] }).flows;
    const afterInvalidNameIds = afterInvalidNameRows.map((f) => f.id);
    expect(afterInvalidNameRows).toHaveLength(beforeRows.length);
    expect(afterInvalidNameIds).toEqual(beforeIds);
  },
);

