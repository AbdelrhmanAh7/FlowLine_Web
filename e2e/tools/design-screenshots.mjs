// Visual evidence for the design-v2 colour/motion update: screenshots of the key screens at 1440 and 375,
// Arabic + English, per theme. Runs against the TEST stack on :3100 (start it with `pnpm dev:test`).
//
//   node e2e/tools/design-screenshots.mjs --out artifacts/design-v2/screenshots/after --themes dark,light
//   node e2e/tools/design-screenshots.mjs --out artifacts/design-v2/screenshots/before --themes default
//
// "default" sets no fl_theme cookie (the phase-4 code has no theme switch). Data is created through the public
// API with a fresh verified account; the "running" canvas uses the fake Sheets provider held open (timeout fault).
import { chromium, request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import testStackEnv from "../../scripts/test-stack.cjs";

// FLOWLINE_TEST_PORT / FLOWLINE_TEST_FAKE_PORT pick another test stack (scripts/test-stack.cjs).
const { baseUrl: BASE, fakeUrl: FAKE } = testStackEnv.testStack();
const PASSWORD = "e2e-Passw0rd!";
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const OUT = args.out ?? "artifacts/design-v2/screenshots/after";
const THEMES = (args.themes ?? "dark,light").split(",");
const ONLY = args.only ? args.only.split(",") : null;
mkdirSync(OUT, { recursive: true });

const ok = async (res, what) => {
  if (!res.ok()) throw new Error(`${what}: ${res.status()} ${await res.text()}`);
  return res.json();
};

async function setup() {
  const req = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
  const email = `shots-${randomUUID().slice(0, 8)}@flowline-e2e.test`;
  await ok(await req.post("/api/auth/sign-up/email", { data: { email, password: PASSWORD, name: "Layla Haddad" } }), "sign-up");
  let link;
  for (let i = 0; i < 40 && !link; i++) {
    const { messages } = await ok(await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`), "outbox");
    link = messages.find((m) => m.purpose === "verify")?.link;
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  await ok(await req.post("/api/email", { data: { action: "verify", token: new URL(link).searchParams.get("token") } }), "verify");
  await ok(await req.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } }), "sign-in");
  const { workspace } = await ok(await req.post("/api/workspaces", { data: { name: "Acme Workspace" } }), "workspace");
  await ok(await req.post("/api/onboarding", { data: { goal: "sales", skipped: false } }), "onboarding");

  const flow = async (data) => (await ok(await req.post(`/api/workspaces/${workspace.id}/flows`, { data }), "flow")).flow.id;
  const lead = await flow({ templateId: "lead-qualifier" });
  await flow({ templateId: "ticket-priority" });
  await flow({ templateId: "order-totals" });

  // A finished run for the inspector.
  const r1 = await ok(await req.post(`/api/flows/${lead}/runs`, { data: { clientRequestId: randomUUID().replace(/-/g, "") } }), "run");
  for (let i = 0; i < 60; i++) {
    const { run } = await ok(await req.get(`/api/runs/${r1.run.id}`), "run get");
    if (!["queued", "running"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  // A flow whose Sheets step never answers → stays "running".
  const conn = (await ok(await req.post(`/api/workspaces/${workspace.id}/connections`, { data: { provider: "google_sheets", label: "Sheets (demo)", fields: { token: "test-token" } } }), "conn")).connection.id;
  const sheetId = `sheet-shots-${randomUUID().slice(0, 8)}`;
  const slow = await flow({ name: "Lead enrichment" });
  const pos = (i, y = 120) => ({ x: 300 * i, y });
  await ok(
    await req.put(`/api/flows/${slow}`, {
      data: {
        baseRevision: 1,
        graph: {
          nodes: [
            { id: "t", type: "trigger.manual", position: pos(0), data: { label: "Start", config: { samplePayload: '{ "name": "Ada", "size": 80 }' } } },
            { id: "norm", type: "transform.json", position: pos(1), data: { label: "Normalise lead", config: { expression: '{ "name": name, "size": size }' } } },
            { id: "sheet", type: "integration.action", position: pos(2), data: { label: "Add row", config: { actionId: "google_sheets.append_row", connectionId: conn, inputMapping: `{ "spreadsheetId": "${sheetId}", "range": "A1", "row": [name] }`, requireApproval: false, retry: { maxAttempts: 5 } } } },
            { id: "o", type: "output", position: pos(3), data: { label: "Done", config: { key: "done", expression: "" } } },
          ],
          edges: [
            { id: "e0", source: "t", target: "norm", sourceHandle: null },
            { id: "e1", source: "norm", target: "sheet", sourceHandle: null },
            { id: "e2", source: "sheet", target: "o", sourceHandle: null },
          ],
        },
      },
    }),
    "graph",
  );
  await ok(await req.post(`${FAKE}/__fake/fault`, { data: { provider: "google_sheets", pathPattern: sheetId, mode: "timeout", times: 1000 } }), "fault");
  const state = await req.storageState();
  return { req, workspace, lead, slow, runId: r1.run.id, state };
}

async function ensureRunning(s) {
  const { runs } = await ok(await s.req.get(`/api/flows/${s.slow}/runs`), "runs");
  if (runs[0] && ["queued", "running"].includes(runs[0].status)) return;
  const r = await ok(await s.req.post(`/api/flows/${s.slow}/runs`, { data: { clientRequestId: randomUUID().replace(/-/g, "") } }), "run slow");
  for (let i = 0; i < 60; i++) {
    const { run } = await ok(await s.req.get(`/api/runs/${r.run.id}`), "run get");
    if (run.steps.some((st) => st.nodeId === "sheet" && st.status === "running")) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

const SCREENS = [
  { id: "landing", auth: false, path: () => "/" },
  { id: "sign-in", auth: false, path: () => "/sign-in" },
  { id: "flows", auth: true, path: (s) => `/w/${s.workspace.slug}/flows` },
  { id: "canvas-running", auth: true, path: (s) => `/w/${s.workspace.slug}/flows/${s.slow}`, running: true },
  { id: "run-inspector", auth: true, path: (s) => `/w/${s.workspace.slug}/runs?run=${s.runId}` },
  { id: "integrations", auth: true, path: (s) => `/w/${s.workspace.slug}/integrations` },
  { id: "settings", auth: true, path: (s) => `/w/${s.workspace.slug}/settings` },
  // design-v2 additions: the style guide and the ai-hub screens (settings deep-links + the admin gate).
  { id: "design-system", auth: false, path: () => "/design-system" },
  { id: "settings-ai", auth: true, path: (s) => `/w/${s.workspace.slug}/settings?tab=ai` },
  { id: "settings-oauth", auth: true, path: (s) => `/w/${s.workspace.slug}/settings?tab=oauthApps` },
  { id: "settings-general", auth: true, path: (s) => `/w/${s.workspace.slug}/settings?tab=general` },
  // The admin panel interior requires TOTP step-up (e2e/admin-panel.spec.ts runs with screenshots OFF by design); this captures its gate.
  { id: "admin", auth: false, path: () => "/admin" },
];

const s = await setup();
const browser = await chromium.launch();
const cookie = (name, value) => ({ name, value, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" });
let n = 0;
for (const theme of THEMES) {
  for (const locale of ["en", "ar"]) {
    for (const width of [1440, 375]) {
      const cookies = [cookie("fl_locale", locale), ...(theme === "default" ? [] : [cookie("fl_theme", theme)])];
      const authed = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 812 }, storageState: { cookies: [...s.state.cookies, ...cookies], origins: [] } });
      const anon = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 812 }, storageState: { cookies, origins: [] } });
      for (const sc of SCREENS) {
        if (ONLY && !ONLY.includes(sc.id)) continue;
        if (sc.running) await ensureRunning(s);
        const page = await (sc.auth ? authed : anon).newPage();
        await page.goto(BASE + sc.path(s), { waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(sc.running ? 1500 : 700);
        if (sc.running && width === 1440) {
          await page.keyboard.press("Control+j");
          await page.waitForTimeout(900);
        }
        const file = join(OUT, `${sc.id}_${locale}_${theme}_${width}.png`);
        await page.screenshot({ path: file, fullPage: false });
        await page.close();
        n++;
      }
      await authed.close();
      await anon.close();
    }
  }
}
await browser.close();
await s.req.dispose();
console.log(`${n} screenshots → ${OUT}`);
