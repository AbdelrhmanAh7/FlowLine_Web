#!/usr/bin/env node
/**
 * Flowline load test (TEST_PLAN.md §3, L-1…L-6) against a running production build (the staging stack).
 *   node scripts/load/run.mjs [--base http://localhost:3200] [--env .env.staging] [--out artifacts/phase-3/load]
 * Creates its own users/workspaces (…@flowline-load.test). Reads DB counts directly (staging DB on 127.0.0.1:5434)
 * for the drain/duplicate checks; the DB password is read from the env file and never printed.
 * Targets are fixed in TEST_PLAN.md; this script only measures and reports pass/miss against them.
 *
 * Email verification (Phase 4): every user is verified through the real endpoint (scripts/release/lib/verified-user.mjs);
 * the token comes from the staging DB's email_outbox table, so staging must run FLOWLINE_EMAIL_PROVIDER=outbox.
 *   [--invite <code>]   beta access code (multi-use) when staging runs FLOWLINE_BETA_MODE=invite_only
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { parseEnvFile } from "../release/lib/email-token.mjs";
import { verifiedUser } from "../release/lib/verified-user.mjs";
import { dockerStats, sleep, summary, timed } from "./lib/common.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200");
const OUT = arg("out", "artifacts/phase-3/load");
const envFile = parseEnvFile(readFileSync(arg("env", ".env.staging"), "utf8"));
const INVITE = arg("invite");
const DB_URL = `postgres://flowline:${envFile.STAGING_DB_PASSWORD}@127.0.0.1:5434/flowline`;
const PASSWORD = "Load-Test-Pass-1";

// ───────────────────────────── helpers

class Session {
  constructor() {
    this.cookie = "";
  }
  async req(path, init = {}) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { origin: BASE, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const pair = c.split(";")[0];
      if (pair.startsWith("better-auth.session_token=")) this.cookie = pair;
    }
    return res;
  }
  async ok(path, init) {
    const r = await this.req(path, init);
    if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

const graph = {
  nodes: [
    { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: '{ "n": 1 }' } } },
    { id: "x", type: "transform.json", position: { x: 300, y: 0 }, data: { label: "Double", config: { expression: '{ "v": n * 2 }' } } },
    { id: "o", type: "output", position: { x: 600, y: 0 }, data: { label: "Done", config: { key: "r", expression: "" } } },
  ],
  edges: [
    { id: "e1", source: "t", target: "x", sourceHandle: null },
    { id: "e2", source: "x", target: "o", sourceHandle: null },
  ],
};

async function newUser(tag) {
  const s = new Session();
  // Setup only (not measured): sign-up / sign-in are rate limited per IP in production builds; the helper backs off.
  const email = `${tag}-${randomUUID().slice(0, 8)}@flowline-load.test`;
  await verifiedUser({
    base: BASE, session: s, email, password: PASSWORD, name: "Load", betaCode: INVITE, tokenSource: { dbUrl: DB_URL },
    onRateLimited: () => { report.signUpRateLimited = (report.signUpRateLimited ?? 0) + 1; },
  });
  const { workspace } = await s.ok("/api/workspaces", { method: "POST", json: { name: `Load ${randomUUID().slice(0, 6)}` } });
  await s.ok("/api/onboarding", { method: "POST", json: { goal: "sales", skipped: false } });
  const { flow } = await s.ok(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: { name: "Load doubler" } });
  await s.ok(`/api/flows/${flow.id}`, { method: "PUT", json: { baseRevision: 1, graph } });
  await s.ok(`/api/flows/${flow.id}/publish`, { method: "POST" });
  return { s, workspace, flow };
}

async function closedLoop(concurrency, durationMs, fn) {
  const lat = [];
  const st = [];
  const end = Date.now() + durationMs;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      while (Date.now() < end) {
        const r = await fn(w);
        lat.push(r.ms);
        st.push(r.status);
      }
    }),
  );
  return summary(lat, st);
}


// ───────────────────────────── run
const report = { base: BASE, startedAt: new Date().toISOString(), scenarios: {}, resources: [] };
const health = await (await fetch(`${BASE}/api/health`)).json();
report.revision = health.revision;
report.schemaVersion = health.schemaVersion;
console.log(`target ${BASE} revision ${health.revision} schema ${health.schemaVersion}`);
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const sampleDb = async () => (await db.query("select count(*)::int as n from pg_stat_activity where datname = 'flowline'")).rows[0].n;
let peakConns = 0;
const monitor = setInterval(async () => {
  peakConns = Math.max(peakConns, await sampleDb().catch(() => 0));
}, 1000);
const resourceTick = setInterval(() => report.resources.push({ at: new Date().toISOString(), containers: dockerStats() }), 10_000);

// L-1 health
console.log("L-1 health: 20 concurrent, 30s");
report.scenarios["L-1"] = await closedLoop(20, 30_000, () => timed(() => fetch(`${BASE}/api/health`)));
console.log(report.scenarios["L-1"]);

// L-2 authenticated reads, 10 users
console.log("L-2 setup: 10 users");
const users = [];
for (let i = 0; i < 10; i++) users.push(await newUser("reader"));
console.log("L-2 reads: 10 concurrent, 60s");
const readPaths = (u) => [`/api/workspaces/${u.workspace.id}/flows`, `/api/workspaces/${u.workspace.id}/runs`, `/api/flows/${u.flow.id}`];
let rr = 0;
report.scenarios["L-2"] = await closedLoop(10, 60_000, (w) => {
  const u = users[w];
  const p = readPaths(u)[rr++ % 3];
  return timed(() => u.s.req(p));
});
console.log(report.scenarios["L-2"]);

// L-3 / L-4 run submission + drain
console.log("L-3 setup: 1 workspace, 11 live API keys");
const owner = await newUser("submitter");
await owner.s.ok(`/api/workspaces/${owner.workspace.id}`, { method: "PATCH", json: { maxQueuedRuns: 1000 } });
const keys = [];
for (let i = 0; i < 11; i++) {
  const k = await owner.s.ok(`/api/workspaces/${owner.workspace.id}/api-keys`, { method: "POST", json: { name: `load-${i}`, mode: "live", scopes: ["runs:write", "runs:read"] } });
  keys.push(k.key ?? k.apiKey?.key ?? k.secret);
}
if (keys.some((k) => !k)) throw new Error("API key response shape changed — no key in the response");
const submit = (key, n) =>
  timed(() => fetch(`${BASE}/api/v1/flows/${owner.flow.id}/runs`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ input: { n } }) }));
console.log("L-3 submit: 10 keys × 25 runs, 10 concurrent");
const l3start = Date.now();
const l3 = await Promise.all(
  keys.slice(0, 10).map(async (key, w) => {
    const out = [];
    for (let i = 0; i < 25; i++) out.push(await submit(key, w * 100 + i));
    return out;
  }),
);
const flat = l3.flat();
report.scenarios["L-3"] = { ...summary(flat.map((r) => r.ms), flat.map((r) => r.status)), wallMs: Date.now() - l3start };
console.log(report.scenarios["L-3"]);
const accepted = flat.filter((r) => r.status === 202).length;

console.log("L-4 drain");
const drainStart = Date.now();
let states;
for (;;) {
  states = Object.fromEntries((await db.query("select status, count(*)::int n from run where flow_id = $1 group by status", [owner.flow.id])).rows.map((r) => [r.status, r.n]));
  const open = (states.queued ?? 0) + (states.running ?? 0);
  if (open === 0 || Date.now() - drainStart > 300_000) break;
  await sleep(1000);
}
const drainMs = Date.now() - drainStart;
const dupSteps = (await db.query("select count(*)::int n from (select run_id, node_id, count(*) c from run_step s join run r on r.id = s.run_id where r.flow_id = $1 group by run_id, node_id having count(*) > 1) d", [owner.flow.id])).rows[0].n;
const dupExec = (await db.query("select count(*)::int n from (select run_id from usage_event u join run r on r.id = u.run_id where r.flow_id = $1 and u.kind = 'execution' group by run_id having count(*) > 1) d", [owner.flow.id])).rows[0].n;
const execEvents = (await db.query("select count(*)::int n from usage_event u join run r on r.id = u.run_id where r.flow_id = $1 and u.kind = 'execution'", [owner.flow.id])).rows[0].n;
const totalRuns = Object.values(states).reduce((a, b) => a + b, 0);
report.scenarios["L-4"] = { accepted, runsInDb: totalRuns, states, drainMsAfterSubmit: drainMs, totalMsFromFirstSubmit: Date.now() - l3start, duplicateStepRows: dupSteps, runsWithDuplicateExecutionEvents: dupExec, executionEvents: execEvents };
console.log(report.scenarios["L-4"]);

// L-5 rate limit with one fresh key
console.log("L-5 rate limit: 1 key, 60 submissions");
const l5 = [];
const l5start = Date.now();
await Promise.all(Array.from({ length: 6 }, async (_, w) => { for (let i = 0; i < 10; i++) l5.push(await submit(keys[10], 9000 + w * 10 + i)); }));
report.scenarios["L-5"] = { ...summary(l5.map((r) => r.ms), l5.map((r) => r.status)), wallMs: Date.now() - l5start };
console.log(report.scenarios["L-5"]);

clearInterval(monitor);
clearInterval(resourceTick);
report.resources.push({ at: new Date().toISOString(), containers: dockerStats() });
report.peakDbConnections = peakConns;
await db.end();

// ───────────────────────────── verdicts vs TEST_PLAN targets (fixed before the run)
const s = report.scenarios;
const toMb = (m) => (m?.endsWith("GiB") ? parseFloat(m) * 1024 : parseFloat(m));
const peak = (name) => Math.max(...report.resources.flatMap((r) => r.containers.filter((c) => c.name?.includes(name)).map((c) => toMb(c.mem))));
report.peakMemMb = { web: peak("-web-"), worker: peak("-worker-"), db: peak("-db-") };
const count = (sc, code) => sc.statuses[code] ?? 0;
const fivexx = (sc) => Object.entries(sc.statuses).filter(([k]) => Number(k) >= 500 || Number(k) < 0).reduce((a, [, v]) => a + v, 0);
report.verdicts = {
  "L-1": s["L-1"].p95 < 150 && fivexx(s["L-1"]) === 0 && count(s["L-1"], 200) === s["L-1"].n,
  "L-2": s["L-2"].p95 < 400 && s["L-2"].p99 < 1000 && fivexx(s["L-2"]) === 0,
  "L-3": fivexx(s["L-3"]) === 0 && count(s["L-3"], 202) + count(s["L-3"], 429) === s["L-3"].n && s["L-3"].p95 < 500,
  "L-4": s["L-4"].runsInDb === accepted && (s["L-4"].states.queued ?? 0) + (s["L-4"].states.running ?? 0) === 0 && s["L-4"].totalMsFromFirstSubmit <= 180_000 && s["L-4"].duplicateStepRows === 0 && s["L-4"].runsWithDuplicateExecutionEvents === 0,
  "L-5": count(s["L-5"], 202) === 30 && count(s["L-5"], 429) === 30 && fivexx(s["L-5"]) === 0,
  "L-6": report.peakMemMb.web < 1229 && report.peakMemMb.worker < 600 && peakConns < 40,
};
report.finishedAt = new Date().toISOString();
mkdirSync(OUT, { recursive: true });
const file = `${OUT}/load-${health.revision.slice(0, 7)}-${Date.now()}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log("verdicts", report.verdicts, "peakMemMb", report.peakMemMb, "peakDbConnections", peakConns);
console.log("written", file);
