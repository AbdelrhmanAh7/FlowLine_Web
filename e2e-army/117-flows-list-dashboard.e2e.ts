// Issue #117: the flow list and the dashboard numbers summarise each flow's last run, success rate and publication
// (mirrors the hub's [fl-flows-list.3], which failed on main @ d211653). Request-level (no model).
// The stable-gate failure was NOT the run status: the row already had lastRunStatus "succeeded" (the issue text cut the
// message off mid-word). The mismatch was publishedVersion: 3, expected 1 — every manual run stores a "run" snapshot in
// flow_version and takes a version number, so the first publication after two runs is v3. See AI_QUESTIONS.md.
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
interface Res { status: number; json: any }

/** A verified, signed-in account through the product's own endpoints (test stack outbox); returns its request headers. */
async function signedIn(base: string, email: string): Promise<Headers> {
  const h = { "content-type": "application/json", origin: new URL(base).origin, cookie: FIXED };
  // A re-run on the same stack finds the account already there; sign-in below still has to succeed.
  const up = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password: PASSWORD, name: "Army Bot" }) });
  if (up.ok) {
    let token: string | null = null;
    for (let i = 0; i < 24 && !token; i++) {
      const r = await fetch(`${base}/api/test/outbox?email=${encodeURIComponent(email)}`, { headers: h });
      const messages: { purpose?: string; link?: string }[] = (await r.json().catch(() => ({ messages: [] }))).messages ?? [];
      const link = messages.find((m) => m.purpose === "verify")?.link;
      token = link ? new URL(link).searchParams.get("token") : null;
      if (!token) await new Promise((r) => setTimeout(r, 500)); // the outbox is written after the sign-up response
    }
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
    let json: any = null;
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
  return r.json.flow as { id: string; revision: number };
}
async function newFlow(http: Http, workspaceId: string, name: string, graph: unknown) {
  const f = await createFlow(http, workspaceId, name);
  const r = await http.put(`/api/flows/${f.id}`, { baseRevision: f.revision, graph });
  expect(r.status).toBe(200);
  return r.json.flow as { id: string; revision: number };
}
/** Starts a manual run and waits until it is terminal (a failed run is a valid outcome here, not an error). */
async function runToEnd(http: Http, flowId: string) {
  const started = await http.post(`/api/flows/${flowId}/runs`);
  expect(started.status).toBe(202);
  const runId = started.json.run.id as string;
  await expect
    .poll(async () => (await http.get(`/api/runs/${runId}`)).json?.run?.status, { timeout: 60_000, interval: 500 })
    .toMatch(/^(succeeded|failed|cancelled)$/);
}

test(
  "@issue-117 AC1: the flow list and dashboard show each flow's last run, success rate and first published version (v1)",
  { tags: ["feat:fl-flows-list", "lvl:api"] },
  async ({ app }) => {
    const base = app.baseUrl!;
    const http = client(base, await signedIn(base, `army-117-${seeded(base, "army-117-owner")}@flowline-e2e.test`));
    const created = await http.post("/api/workspaces", { name: `List ${seeded(base, "army-117-ws", 6)}` });
    expect(created.status).toBe(201);
    const ws = created.json.workspace as { id: string };
    const w = `/api/workspaces/${ws.id}`;

    // Empty case: a new workspace lists no flows.
    expect(((await http.get(`${w}/flows`)).json.flows as unknown[]).length).toBe(0);

    const good = await newFlow(http, ws.id, `Listed good ${seeded(base, "army-117-good", 4)}`, chain({ n: 1 }, "$"));
    const bad = await newFlow(http, ws.id, `Listed bad ${seeded(base, "army-117-bad", 4)}`, chain({ n: 1 }, '$number("x")'));
    const draft = await createFlow(http, ws.id, `Listed draft ${seeded(base, "army-117-draft", 4)}`);
    for (const id of [good.id, good.id, bad.id]) await runToEnd(http, id);
    expect((await http.post(`/api/flows/${good.id}/publish`)).status).toBe(201);

    const rows = (await http.get(`${w}/flows`)).json.flows as any[];
    expect(rows).toHaveLength(3);
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(good.id)).toMatchObject({ runCount: 2, lastRunStatus: "succeeded", successRate: 1, publishedVersion: 1, nodeCount: 3, trigger: "trigger.manual" });
    expect(row(bad.id)).toMatchObject({ runCount: 1, lastRunStatus: "failed", successRate: 0, publishedVersion: null });
    expect(row(draft.id)).toMatchObject({ runCount: 0, lastRunStatus: null, successRate: null, nodeCount: 0, hasTrigger: false });
    expect(rows.map((r) => r.updatedAt)).toEqual([...rows.map((r) => r.updatedAt)].sort().reverse());

    const overview = (await http.get(`${w}/overview`)).json;
    expect(overview).toMatchObject({ flows: 3, flowsRun24h: 2, runs24h: 3, failed24h: 1, activeRuns: 0 });
    expect(overview.successRate24h).toBeCloseTo(2 / 3, 5);
    expect(overview.recent).toHaveLength(3);
  },
);
