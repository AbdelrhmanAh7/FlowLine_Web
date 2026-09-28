#!/usr/bin/env node
/**
 * Release smoke suite (any environment): health, sign-up, workspace, template flow run, API key + /api/v1 run,
 * tenancy (a second user gets 404). Creates throwaway users (…@flowline-smoke.test).
 *   node scripts/release/smoke.mjs [--base http://localhost:3200] [--out artifacts/phase-4/smoke] [--invite <token>]
 * On an invitation-only beta, pass --invite with a beta access code for each sign-up (see PRIVATE_BETA_RUNBOOK.md).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200").replace(/\/+$/, "");
const OUT = arg("out", "artifacts/phase-4/smoke");
const INVITE = arg("invite");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

class Session {
  cookie = "";
  async req(path, init = {}) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { origin: BASE, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("better-auth.session_token=") || c.startsWith("__Secure-better-auth.session_token=")) this.cookie = c.split(";")[0];
    return res;
  }
  async ok(path, init) {
    const r = await this.req(path, init);
    if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

async function user(tag) {
  const s = new Session();
  const email = `${tag}-${randomUUID().slice(0, 8)}@flowline-smoke.test`;
  for (let attempt = 0; ; attempt++) {
    const r = await s.req("/api/auth/sign-up/email", { method: "POST", json: { email, password: "Smoke-Check-Pass-1", name: "Smoke", ...(INVITE ? { betaCode: INVITE } : {}) } });
    if (r.ok) break;
    if (r.status !== 429 || attempt > 10) throw new Error(`sign-up → ${r.status} ${(await r.text()).slice(0, 200)}`);
    await sleep(6000);
  }
  const { workspace } = await s.ok("/api/workspaces", { method: "POST", json: { name: `Smoke ${randomUUID().slice(0, 6)}` } });
  await s.ok("/api/onboarding", { method: "POST", json: { goal: "data", skipped: false } });
  return { s, email, workspace };
}

const report = { base: BASE, startedAt: new Date().toISOString() };
try {
  const hr = await fetch(`${BASE}/api/health?require=worker`);
  const h = await hr.json().catch(() => ({}));
  report.revision = h.revision;
  report.schemaVersion = h.schemaVersion;
  check("health: db and worker ok", hr.status === 200 && h.db === "ok" && h.worker === "ok", `rev ${String(h.revision).slice(0, 7)} schema ${h.schemaVersion}`);

  const a = await user("smoke-a");
  check("sign-up + workspace + onboarding", Boolean(a.workspace?.id));
  const { flow } = await a.s.ok(`/api/workspaces/${a.workspace.id}/flows`, { method: "POST", json: { templateId: "lead-qualifier" } });
  const { run } = await a.s.ok(`/api/flows/${flow.id}/runs`, { method: "POST", json: {} });
  let status = "queued";
  for (let i = 0; i < 30 && ["queued", "running"].includes(status); i++) {
    await sleep(1000);
    status = (await a.s.ok(`/api/runs/${run.id}`)).run.status;
  }
  check("template flow runs to success on the worker", status === "succeeded", status);

  const pub = await a.s.req(`/api/flows/${flow.id}/publish`, { method: "POST" });
  check("publish", pub.status === 201, `HTTP ${pub.status}`);
  const key = await a.s.ok(`/api/workspaces/${a.workspace.id}/api-keys`, { method: "POST", json: { name: "smoke", mode: "live", scopes: ["runs:write", "runs:read"] } });
  const apiRun = await fetch(`${BASE}/api/v1/flows/${flow.id}/runs`, { method: "POST", headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" }, body: JSON.stringify({ input: { company: "Acme", employees: 80 } }) });
  check("API key starts a run via /api/v1", apiRun.status === 202, `HTTP ${apiRun.status}`);
  await a.s.req(`/api/workspaces/${a.workspace.id}/api-keys/${key.apiKey.id}`, { method: "DELETE" });
  const revoked = await fetch(`${BASE}/api/v1/flows/${flow.id}/runs`, { method: "POST", headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" }, body: "{}" });
  check("revoked key refused", revoked.status === 401, `HTTP ${revoked.status}`);

  const b = await user("smoke-b");
  const cross = await b.s.req(`/api/flows/${flow.id}`);
  const crossWs = await b.s.req(`/api/workspaces/${a.workspace.id}/flows`);
  check("tenancy: another user gets 404 for the flow and workspace", cross.status === 404 && crossWs.status === 404, `${cross.status}/${crossWs.status}`);
  const anon = await fetch(`${BASE}/api/workspaces/${a.workspace.id}/flows`);
  check("unauthenticated API refused", anon.status === 401, `HTTP ${anon.status}`);
} catch (e) {
  check("smoke completed", false, String(e.message ?? e).slice(0, 300));
}
report.finishedAt = new Date().toISOString();
report.checks = checks;
report.pass = checks.every((c) => c.ok);
mkdirSync(OUT, { recursive: true });
const file = `${OUT}/smoke-${String(report.revision ?? "unknown").slice(0, 7)}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(report.pass ? "SMOKE PASS" : "SMOKE FAIL", "→", file);
process.exitCode = report.pass ? 0 : 1;
