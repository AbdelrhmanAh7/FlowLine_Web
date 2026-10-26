// Issue #117: the flow list and the dashboard numbers summarise each flow's last run, success rate and publication
// (mirrors the hub's [fl-flows-list.3], which failed on main @ d211653). Request-level (no model).
// The stable-gate failure was NOT the run status: the row already had lastRunStatus "succeeded" (the issue text cut the
// message off mid-word). The mismatch was publishedVersion: 3, expected 1 — every manual run stored a "run" snapshot in
// flow_version and took a version number, so the first publication after two runs was v3. Run snapshots are now unnumbered.
// Copied files may import only `e2e`, `@e2e-dev/web` and node built-ins, so the helpers live here.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const N8N_WORKFLOW = JSON.stringify({
  name: "Army lead intake",
  nodes: [
    { name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0], parameters: { path: "lead" } },
    { name: "Shape", type: "n8n-nodes-base.function", typeVersion: 1, position: [240, 0], parameters: { functionCode: "return items;" } },
    { name: "Notify", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [480, 0], parameters: { requestMethod: "POST", url: "https://example.invalid/hook" } },
    { name: "Filter", type: "n8n-nodes-base.set", typeVersion: 1, position: [720, 0], parameters: {} },
  ],
  connections: {
    Webhook: { main: [[{ node: "Shape", type: "main", index: 0 }]] },
    Shape: { main: [[{ node: "Notify", type: "main", index: 0 }]] },
    Notify: { main: [[{ node: "Filter", type: "main", index: 0 }]] },
  },
});

function createWorkflowFixture(name: string, content: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), `fl-army-295-${name}-`));
  const file = join(dir, "workflow.json");
  writeFileSync(file, content, { flag: "wx" });
  return { dir, file };
}

for (const locale of ["en", "ar"] as const) {
  test(`@issue-378 AC2: non-workflow JSON upload shows a localized error (${locale})`,
    { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
    async ({ app, agent, screen, browser }) => {
      await app.open(`/${locale}`);
      await agent.act(locale === "ar" ? "افتح صفحة مسارات العمل من التنقل" : "open the Flows page from the navigation");
      await agent.act(locale === "ar" ? "انقر على استيراد من n8n" : "click Import from n8n");
      const fixture = createWorkflowFixture("378-notworkflow", '{"foo":"bar"}');
      try {
        await screen.getByLabel(locale === "ar" ? "ملف مسار عمل n8n" : "n8n workflow file").setInputFiles(fixture.file);
        await agent.assert(locale === "ar" ? "تظهر رسالة خطأ بأن JSON ليس مسار عمل n8n" : "an error says this JSON is not an n8n workflow");
        await expect(screen.getByRole("alert").first()).toHaveText(locale === "ar"
          ? "هذا JSON صالح لكنه ليس مسار عمل n8n. الصق ملف مسار العمل كاملًا المُصدَّر من n8n."
          : "This is valid JSON but not an n8n workflow. Paste the whole workflow file exported from n8n.");
        expect(await browser.evaluate(() => document.documentElement.dir)).toBe(locale === "ar" ? "rtl" : "ltr");
      } finally {
        rmSync(fixture.dir, { recursive: true, force: true });
      }
    },
  );
}

test(
  "@issue-295 AC1: importing an n8n workflow creates an editable flow with a placeholder for the unsupported node",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("paste {json} into the n8n workflow box and click Import", { params: { json: N8N_WORKFLOW } });
    await agent.assert("the flow editor opens and shows the steps named Webhook, Shape and Notify");
    await expect(screen.getByLabel("Flow name")).toHaveValue("Army lead intake");
    await expect(screen.getByText("Webhook", { exact: true }).first()).toBeVisible();
    await expect(screen.getByText("Shape", { exact: true }).first()).toBeVisible();
    await expect(screen.getByText("Notify", { exact: true }).first()).toBeVisible();
    await agent.assert("a step labelled Unsupported n8n node: n8n-nodes-base.set is shown and says to replace it");
    await expect(screen.getByText("Unsupported n8n node: n8n-nodes-base.set — replace").first()).toBeVisible();
  },
);

test(
  "@issue-295 AC2: pasting text that is not JSON is refused and no flow is created",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.act("paste {text} into the n8n workflow box and click Import", { params: { text: "{ not json" } });
    await agent.assert("an error says the file is not a valid n8n workflow and the flow list did not change");
    await expect(screen.getByRole("alert").first()).toBeVisible();
  },
);

test(
  "@issue-295 AC3: the import dialog renders correctly in Arabic (RTL)",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/ar");
    await agent.act("افتح صفحة مسارات العمل من التنقل");
    await agent.act("انقر على استيراد من n8n");
    await agent.assert("يظهر حوار الاستيراد بالعربية مع اتجاه RTL");
    await expect(screen.getByText("استيراد مسار عمل من n8n")).toBeVisible();
    await expect(screen.getByText("الصق JSON لمسار العمل المُصدَّر من n8n. تُستورد عقد الويب هوك والكود وطلب HTTP، وتصبح العقد الأخرى عناصر نائبة تستبدلها قبل تشغيل المسار.")).toBeVisible();
    await expect(screen.getByRole("button", { name: "رفع ملف .json" })).toBeVisible();
    const dir = await browser.evaluate(() => document.documentElement.dir);
    expect(dir).toBe("rtl");
  },
);

test(
  "@issue-295 AC4: the import dialog has a file upload button for .json files",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    await agent.assert("the dialog shows an Upload .json file button");
    await expect(screen.getByRole("button", { name: "Upload .json file" })).toBeVisible();
  },
);

test(
  "@issue-295 AC5: uploading a valid .json file parses and populates the workflow box",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    const fixture = createWorkflowFixture("valid", N8N_WORKFLOW);
    try {
      await screen.getByLabel("n8n workflow file").setInputFiles(fixture.file);
      const textarea = screen.getByRole("textbox", { name: "n8n workflow JSON" });
      await expect(textarea).toHaveValue(/Webhook/);
      await expect(textarea).toHaveValue(/Shape/);
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  },
);

test(
  "@issue-295 AC6: uploading an invalid .json file shows an error",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    const fixture = createWorkflowFixture("invalid", "{ not json");
    try {
      await screen.getByLabel("n8n workflow file").setInputFiles(fixture.file);
      await expect(screen.getByRole("alert").first()).toBeVisible();
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  },
);

test(
  "@issue-295 AC7: uploading a valid JSON that is not an n8n workflow shows an error",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    const fixture = createWorkflowFixture("notworkflow", '{"foo": "bar"}');
    try {
      await screen.getByLabel("n8n workflow file").setInputFiles(fixture.file);
      await expect(screen.getByRole("alert").first()).toBeVisible();
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  },
);

test(
  "@issue-378 AC1: uploading a file with non-workflow nodes JSON is rejected with an error alert",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/en");
    await agent.act("open the Flows page from the navigation");
    await agent.act("click Import from n8n");
    const fixture = createWorkflowFixture("invalidnodes", '{"nodes": [{}]}');
    try {
      await screen.getByLabel("n8n workflow file").setInputFiles(fixture.file);
      await expect(screen.getByRole("alert").first()).toBeVisible();
    } finally {
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  },
);

test(
  "@issue-295 AC8: an imported workflow with a placeholder cannot run until the placeholder is replaced",
  { tags: ["feat:fl-flow-validation", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, browser }) => {
    await app.open("/");
    const cookie = (await browser.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const origin = new URL(app.baseUrl).origin;
    const headers = { "content-type": "application/json", origin, cookie, "sec-fetch-site": "same-origin" };
    const list = await fetch(new URL("/api/workspaces", app.baseUrl), { headers });
    const { workspaces } = (await list.json()) as { workspaces: { id: string }[] };
    const created = await fetch(new URL(`/api/workspaces/${workspaces[0]!.id}/flows`, app.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ n8n: JSON.parse(N8N_WORKFLOW) }),
    });
    expect(created.status).toBe(201);
    const { flow } = (await created.json()) as { flow: { id: string } };
    try {
      const run = await fetch(new URL(`/api/flows/${flow.id}/runs`, app.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ input: {} }),
      });
      expect(run.status).toBe(422);
      const body = (await run.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("INVALID_FLOW");
    } finally {
      await fetch(new URL(`/api/flows/${flow.id}`, app.baseUrl), { method: "DELETE", headers });
    }
  },
);

test(
  "@issue-295 AC9: navigating to /w/{slug}/flows resolves to the user workspace flows page without 404",
  { tags: ["feat:fl-flows-list", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/w/%7Bslug%7D/flows");
    await agent.assert("the flows page loads without a 404 error and shows the Flows heading or import button");
    await expect(screen.getByText("We couldn't find that page")).not.toBeVisible();
    await expect(screen.getByRole("button", { name: "Import from n8n" })).toBeVisible();
  },
);

