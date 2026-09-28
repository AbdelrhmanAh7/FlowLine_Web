#!/usr/bin/env node
/**
 * P3-31 failure test: database outage against the RELEASE IMAGE on a throwaway stack (own PostgreSQL container,
 * web on :3202, worker) — staging is not touched.
 *   node scripts/release/db-outage.mjs --image flowline:<sha> [--out artifacts/phase-3/failure]
 * A. Stall (docker pause: the DB accepts nothing — like a hung network path / port proxy):
 *    health turns 503 fast, API calls fail fast with a clean error (no hang, no stack traces), and after unpause the
 *    SAME processes recover with no restart; a run started before the stall and one started after both finish once.
 * B. Hard outage (DB container stopped, then started): same checks.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const IMAGE = arg("image");
if (!IMAGE) throw new Error("--image is required");
const OUT = arg("out", "artifacts/phase-3/failure");
const BASE = "http://localhost:3202";
const PW = randomBytes(12).toString("hex");
const NAMES = { db: "flowline-outage-db", web: "flowline-outage-web", worker: "flowline-outage-worker", net: "flowline-outage-net" };
const env = Object.fromEntries(
  readFileSync(".env.staging", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (...a) => execFileSync("docker", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const cleanup = () => {
  for (const c of [NAMES.web, NAMES.worker, NAMES.db]) spawnSync("docker", ["rm", "-f", c], { stdio: "ignore" });
  spawnSync("docker", ["network", "rm", NAMES.net], { stdio: "ignore" });
};
async function timedFetch(path, init = {}, timeoutMs = 20_000) {
  const t = Date.now();
  try {
    const r = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await r.text();
    return { status: r.status, ms: Date.now() - t, text };
  } catch (e) {
    return { status: -1, ms: Date.now() - t, text: String(e.message) };
  }
}
async function waitFor(pred, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred()) return true;
    await sleep(1000);
  }
  return false;
}
class Session {
  cookie = "";
  async req(path, init = {}) {
    return fetch(BASE + path, {
      ...init,
      headers: { origin: BASE, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: AbortSignal.timeout(30_000),
    }).then((res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("better-auth.session_token=")) this.cookie = c.split(";")[0];
      return res;
    });
  }
  async ok(path, init) {
    const r = await this.req(path, init);
    if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

const report = { image: IMAGE, startedAt: new Date().toISOString(), scenarios: {} };
try {
  cleanup();
  docker("network", "create", NAMES.net);
  docker("run", "-d", "--name", NAMES.db, "--network", NAMES.net, "-e", "POSTGRES_USER=flowline", "-e", `POSTGRES_PASSWORD=${PW}`, "-e", "POSTGRES_DB=flowline", "--memory", "512m", "postgres:17.6-alpine");
  await waitFor(async () => spawnSync("docker", ["exec", NAMES.db, "pg_isready", "-U", "flowline", "-h", "127.0.0.1"], { stdio: "ignore" }).status === 0);
  await sleep(2000);
  const appEnv = [
    "--network", NAMES.net,
    "-e", `DATABASE_URL=postgres://flowline:${PW}@${NAMES.db}:5432/flowline`,
    "-e", `BETTER_AUTH_SECRET=${env.BETTER_AUTH_SECRET}`, "-e", `FLOWLINE_ENCRYPTION_KEY=${env.FLOWLINE_ENCRYPTION_KEY}`,
    "-e", `BETTER_AUTH_URL=${BASE}`, "-e", `FLOWLINE_PUBLIC_URL=${BASE}`,
  ];
  execFileSync("docker", ["run", "--rm", ...appEnv, IMAGE, "node_modules/.bin/tsx", "src/db/migrate.ts"], { stdio: "ignore" });
  docker("run", "-d", "--name", NAMES.web, ...appEnv, "-p", "127.0.0.1:3202:3000", "--memory", "1536m", IMAGE);
  docker("run", "-d", "--name", NAMES.worker, ...appEnv, "--memory", "768m", IMAGE, "node_modules/.bin/tsx", "worker/index.ts");
  check("stack up", await waitFor(async () => (await timedFetch("/api/health?require=worker", {}, 5000)).status === 200));
  const webId = docker("inspect", NAMES.web, "--format", "{{.State.StartedAt}}");
  const workerId = docker("inspect", NAMES.worker, "--format", "{{.State.StartedAt}}");

  const s = new Session();
  const email = `outage-${randomUUID().slice(0, 8)}@flowline-outage.test`;
  await s.ok("/api/auth/sign-up/email", { method: "POST", json: { email, password: "Outage-Check-Pass-1", name: "Outage" } });
  const { workspace } = await s.ok("/api/workspaces", { method: "POST", json: { name: "Outage" } });
  await s.ok("/api/onboarding", { method: "POST", json: { goal: "data", skipped: false } });
  const { flow } = await s.ok(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: { name: "Outage flow" } });
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
  await s.ok(`/api/flows/${flow.id}`, { method: "PUT", json: { baseRevision: 1, graph } });

  for (const [scenario, down, up] of [
    ["A-stall (docker pause)", () => docker("pause", NAMES.db), () => docker("unpause", NAMES.db)],
    ["B-hard outage (stop/start)", () => docker("stop", "-t", "2", NAMES.db), () => docker("start", NAMES.db)],
  ]) {
    console.log(`── ${scenario}`);
    const r = {};
    const before = await s.ok(`/api/flows/${flow.id}/runs`, { method: "POST", json: {} });
    down();
    const t0 = Date.now();
    await sleep(1000);
    const h = await timedFetch("/api/health", {}, 20_000);
    r.healthDuringOutage = { status: h.status, ms: h.ms, body: h.text.slice(0, 120) };
    check(`${scenario}: health reports the DB down quickly (503 ≤ 10 s)`, h.status === 503 && h.ms <= 10_000 && /"db":"down"/.test(h.text), `${h.status} in ${h.ms} ms`);
    const api = await timedFetch(`/api/workspaces/${workspace.id}/flows`, { headers: { cookie: s.cookie, origin: BASE } }, 40_000);
    r.apiDuringOutage = { status: api.status, ms: api.ms, body: api.text.slice(0, 160) };
    check(`${scenario}: an API call fails fast with a clean 5xx (≤ 35 s, no stack trace or connection string)`, api.status >= 500 && api.ms <= 35_000 && !/at \w+ \(|postgres:\/\/|password/i.test(api.text), `${api.status} in ${api.ms} ms`);
    const page = await timedFetch(`/sign-in`, {}, 40_000);
    check(`${scenario}: public pages still render`, page.status === 200, `${page.status} in ${page.ms} ms`);
    up();
    const recovered = await waitFor(async () => (await timedFetch("/api/health?require=worker", {}, 5000)).status === 200, 120_000);
    r.recoveryMs = Date.now() - t0;
    check(`${scenario}: recovers without restarting web or worker`, recovered && docker("inspect", NAMES.web, "--format", "{{.State.StartedAt}}") === webId && docker("inspect", NAMES.worker, "--format", "{{.State.StartedAt}}") === workerId, `healthy ${Math.round(r.recoveryMs / 1000)} s after the outage began`);
    const after = await s.ok(`/api/flows/${flow.id}/runs`, { method: "POST", json: {} });
    const done = await waitFor(async () => {
      const runs = (await s.ok(`/api/flows/${flow.id}/runs`)).runs;
      return [before.run.id, after.run.id].every((id) => runs.find((x) => x.id === id)?.status === "succeeded");
    }, 90_000);
    check(`${scenario}: the run started before the outage and one after both succeed`, done);
    const runs = (await s.ok(`/api/flows/${flow.id}/runs`)).runs;
    const detail = await s.ok(`/api/runs/${before.run.id}`);
    const steps = detail.steps ?? detail.run?.steps ?? [];
    const perNode = {};
    for (const st of steps) perNode[st.nodeId] = (perNode[st.nodeId] ?? 0) + 1;
    check(`${scenario}: no duplicated steps for the interrupted run`, Object.values(perNode).every((n) => n === 1), JSON.stringify(perNode));
    r.runsSoFar = runs.length;
    report.scenarios[scenario] = r;
  }
} catch (e) {
  check("script completed", false, String(e.message ?? e).slice(0, 300));
} finally {
  cleanup();
  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.pass = checks.every((c) => c.ok);
  mkdirSync(OUT, { recursive: true });
  const rev = IMAGE.split(":")[1] ?? "unknown";
  writeFileSync(`${OUT}/db-outage-${rev}.json`, JSON.stringify(report, null, 2));
  console.log(report.pass ? "DB OUTAGE PASS" : "DB OUTAGE FAIL", `→ ${OUT}/db-outage-${rev}.json`);
  process.exitCode = report.pass ? 0 : 1;
}
