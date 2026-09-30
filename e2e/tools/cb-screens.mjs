// Evidence screenshots of the Company Builder screens (synthetic test user; no real data). Runs against the test stack
// (:3100) with Playwright's browsers:  node e2e/tools/cb-screens.mjs <outDir>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "test-results/cb-screens";
mkdirSync(out, { recursive: true });
const base = "http://localhost:3100";
const browser = await chromium.launch();
const req = await (await browser.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } })).request;
const email = `cb-shot-${Date.now()}@flowline-test.local`;
await req.post("/api/auth/sign-up/email", { data: { email, password: "e2e-Passw0rd!", name: "Screens" } });
const box = await (await req.get(`/api/test/outbox?email=${encodeURIComponent(email)}`)).json().catch(() => null);
const link = JSON.stringify(box ?? {}).match(/token=([A-Za-z0-9._-]+)/)?.[1];
await req.post("/api/email", { data: { action: "verify", token: link } });
await req.post("/api/auth/sign-in/email", { data: { email, password: "e2e-Passw0rd!" } });
const ws = (await (await req.post("/api/workspaces", { data: { name: "Screens Co" } })).json()).workspace;
await req.post("/api/onboarding", { data: { goal: "support", skipped: false } });
const cb = `/api/workspaces/${ws.id}/company-builder`;
const sid = (await (await req.post(`${cb}/sessions`, { data: {} })).json()).session.id;
const answers = [["situation", "improve"], ["offering", "شركة تنظيف مكاتب نرد على طلبات العملاء عبر البريد"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["team", "small"], ["tools", ["gmail"]], ["cust_next", "reply"], ["cust_info", "سعر الباقة الشهرية 300 ريال.\nتوصيل المستلزمات مجاني داخل الرياض."], ["other_areas", ["finance"]], ["fin_location", "email"], ["fin_currency", ["SAR"]], ["fin_reviewer", "owner"]];
let rev = 1;
const shots = async (name, path, locales = ["ar", "en"], widths = [1440, 375]) => {
  for (const loc of locales)
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, storageState: await req.storageState(), reducedMotion: "reduce" });
      await ctx.addCookies([{ name: "fl_locale", value: loc, domain: "localhost", path: "/" }]);
      const p = await ctx.newPage();
      await p.goto(`${base}${path}`);
      await p.waitForLoadState("networkidle");
      await p.screenshot({ path: `${out}/${name}-${loc}-${w}.png`, fullPage: true });
      await ctx.close();
    }
};
await shots("01-landing", `/w/${ws.slug}/company`);
for (const [q, v] of answers.slice(0, 3)) rev = (await (await req.post(`${cb}/sessions/${sid}/answer`, { data: { questionId: q, value: v, revision: rev } })).json()).session;
await shots("02-question", `/w/${ws.slug}/company/${sid}`);
for (const [q, v] of answers.slice(3)) rev = (await (await req.post(`${cb}/sessions/${sid}/answer`, { data: { questionId: q, value: v, revision: rev } })).json()).session;
const bid = (await (await req.post(`${cb}/sessions/${sid}/blueprint`, { data: {} })).json()).blueprintId;
await shots("03-plan", `/w/${ws.slug}/company/${sid}`);
await req.post(`${cb}/blueprints/${bid}/approve`, { data: {} });
const inst = await (await req.post(`${cb}/blueprints/${bid}/install`, { data: {} })).json();
const tr = await (await req.post(`${cb}/installations/${inst.installationId}/tasks/customer-triage/trial`, { data: { trialKey: `shot${Date.now()}` } })).json();
for (let i = 0; i < 40; i++) {
  const t = (await (await req.get(`${cb}/trials/${tr.trialId}`)).json()).trial;
  if (t.status === "completed") break;
  await new Promise((r) => setTimeout(r, 500));
}
await req.post(`${cb}/trials/${tr.trialId}/review`, { data: {} });
await shots("04-trial-and-inbox", `/w/${ws.slug}/company/${sid}`);
await browser.close();
console.log(`screens written to ${out}`);
