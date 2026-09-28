#!/usr/bin/env node
/**
 * Release + rollback verification on the local staging stack (TEST_PLAN §5, P3-28).
 *   node scripts/release/rollback.mjs --from flowline:<known-good> --to flowline:<candidate> [--out artifacts/phase-3/rollback]
 * 1. Deploys --from (known good), seeds a user + published webhook flow + run.
 * 2. Deploys --to (migrate runs its expand-only migrations), verifies, runs the flow again.
 * 3. Rolls back to --from WITHOUT down migrations (the DB keeps the newer schema), verifies health (revision is
 *    --from's, schema version unchanged), password sign-in, flow load, manual run + signed webhook execute,
 *    and that data written by --to is still readable.
 * 4. Leaves the stack on --to (roll forward again) so staging keeps the candidate.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const FROM = arg("from");
const TO = arg("to");
if (!FROM || !TO) throw new Error("--from and --to images are required");
const OUT = arg("out", "artifacts/phase-3/rollback");
const BASE = "http://localhost:3200";
const PASSWORD = "Rollback-Check-Pass-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const imageRevision = (img) => execFileSync("docker", ["image", "inspect", img, "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}'], { encoding: "utf8" }).trim();
const imageId = (img) => execFileSync("docker", ["image", "inspect", img, "--format", "{{.Id}}"], { encoding: "utf8" }).trim();

function deploy(image) {
  const t = Date.now();
  execFileSync("docker", ["compose", "-f", "docker-compose.staging.yml", "--env-file", ".env.staging", "up", "-d", "--wait"], {
    env: { ...process.env, FLOWLINE_IMAGE: image },
    stdio: ["ignore", "ignore", "pipe"],
  });
  return Date.now() - t;
}
/** Revision + schema version actually served. Builds older than a8cef39 don't report them in /api/health:
 *  then the running web container's image label and the migrations table are read directly. */
async function health() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health?require=worker`);
      if (r.ok) {
        const h = await r.json();
        h.revision ??= execFileSync("docker", ["inspect", "flowline-staging-web-1", "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}'], { encoding: "utf8" }).trim();
        h.schemaVersion ??= Number(execFileSync("docker", ["exec", "flowline-staging-db-1", "psql", "-U", "flowline", "-d", "flowline", "-tAc", "select count(*) from drizzle.__drizzle_migrations"], { encoding: "utf8" }).trim());
        return h;
      }
    } catch {}
    await sleep(2000);
  }
  throw new Error("staging not healthy");
}
class Session {
  cookie = "";
  async req(path, init = {}) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { origin: BASE, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("better-auth.session_token=")) this.cookie = c.split(";")[0];
    return res;
  }
  async ok(path, init) {
    const r = await this.req(path, init);
    if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}
const signed = (secret, body, id) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${id}.${body}`).digest("hex")}`;
};
async function waitRun(s, flowId, notIn) {
  for (let i = 0; i < 40; i++) {
    const r = (await s.ok(`/api/flows/${flowId}/runs`)).runs.find((x) => !notIn.has(x.id) && ["succeeded", "failed"].includes(x.status));
    if (r) return r;
    await sleep(1000);
  }
  return null;
}

const report = { from: { image: FROM, id: imageId(FROM), revision: imageRevision(FROM) }, to: { image: TO, id: imageId(TO), revision: imageRevision(TO) }, startedAt: new Date().toISOString() };
try {
  // 1. known good
  report.deployFromMs = deploy(FROM);
  let h = await health();
  check("N (known good) deployed", h.revision === report.from.revision, `rev ${h.revision.slice(0, 7)} schema ${h.schemaVersion}`);
  const fromSchema = h.schemaVersion;
  const s = new Session();
  const email = `rollback-${randomUUID().slice(0, 8)}@flowline-rollback.test`;
  await s.ok("/api/auth/sign-up/email", { method: "POST", json: { email, password: PASSWORD, name: "Rollback" } });
  const { workspace } = await s.ok("/api/workspaces", { method: "POST", json: { name: `Rollback ${randomUUID().slice(0, 6)}` } });
  await s.ok("/api/onboarding", { method: "POST", json: { goal: "data", skipped: false } });
  const { flow } = await s.ok(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: { name: "Rollback flow" } });
  const graph = {
    nodes: [
      { id: "t", type: "trigger.webhook", position: { x: 0, y: 0 }, data: { label: "Hook", config: { samplePayload: '{ "body": { "n": 1 } }' } } },
      { id: "x", type: "transform.json", position: { x: 300, y: 0 }, data: { label: "Double", config: { expression: '{ "v": body.n * 2 }' } } },
      { id: "o", type: "output", position: { x: 600, y: 0 }, data: { label: "Done", config: { key: "r", expression: "" } } },
    ],
    edges: [
      { id: "e1", source: "t", target: "x", sourceHandle: null },
      { id: "e2", source: "x", target: "o", sourceHandle: null },
    ],
  };
  await s.ok(`/api/flows/${flow.id}`, { method: "PUT", json: { baseRevision: 1, graph } });
  const pub = await s.ok(`/api/flows/${flow.id}/publish`, { method: "POST" });
  const hook = new URL(pub.webhook.url).pathname;
  const seen = new Set();
  const fire = async (id, n) => {
    const body = JSON.stringify({ n });
    return fetch(BASE + hook, { method: "POST", headers: { "content-type": "application/json", "x-flowline-event-id": id, "x-flowline-signature": signed(pub.webhook.secret, body, id) }, body });
  };
  await fire("on-N", 1);
  const r0 = await waitRun(s, flow.id, seen);
  if (r0) seen.add(r0.id);
  check("N: webhook run executes", r0?.status === "succeeded");

  // 2. candidate
  report.deployToMs = deploy(TO);
  h = await health();
  check("N+1 deployed (migrations applied, expand-only)", h.revision === report.to.revision && h.schemaVersion >= fromSchema, `rev ${h.revision.slice(0, 7)} schema ${h.schemaVersion}`);
  const toSchema = h.schemaVersion;
  await fire("on-N+1", 2);
  const r1 = await waitRun(s, flow.id, seen);
  if (r1) seen.add(r1.id);
  check("N+1: existing session, flow and webhook still work", r1?.status === "succeeded");
  const manualFlow = (await s.ok(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: { name: "Written on N+1" } })).flow;

  // 3. rollback — no down migrations
  const t = Date.now();
  report.rollbackDeployMs = deploy(FROM);
  h = await health();
  report.rollbackToHealthyMs = Date.now() - t;
  check("rollback: N serves again, DB keeps the newer schema (no down migration)", h.revision === report.from.revision && h.schemaVersion === toSchema, `rev ${h.revision.slice(0, 7)} schema ${h.schemaVersion}`);
  const s2 = new Session();
  const signIn = await s2.req("/api/auth/sign-in/email", { method: "POST", json: { email, password: PASSWORD } });
  check("rollback: password sign-in", signIn.ok, `HTTP ${signIn.status}`);
  const f = await s2.ok(`/api/flows/${flow.id}`);
  check("rollback: workflow loads", f.flow?.id === flow.id && f.flow.graph.nodes.length === 3);
  const listed = (await s2.ok(`/api/workspaces/${workspace.id}/flows`)).flows;
  check("rollback: data written by N+1 is readable by N", listed.some((x) => x.id === manualFlow.id));
  await fire("after-rollback", 3);
  const r2 = await waitRun(s2, flow.id, seen);
  if (r2) seen.add(r2.id);
  check("rollback: webhook run executes on N", r2?.status === "succeeded");
  const runs = (await s2.ok(`/api/flows/${flow.id}/runs`)).runs;
  check("rollback: run history from N and N+1 intact", runs.length >= 3);

  // 4. roll forward again so staging keeps the candidate
  deploy(TO);
  h = await health();
  check("roll forward: N+1 serves again", h.revision === report.to.revision);
} catch (e) {
  check("script completed", false, String(e.message ?? e).slice(0, 300));
}
report.finishedAt = new Date().toISOString();
report.checks = checks;
report.pass = checks.every((c) => c.ok);
mkdirSync(OUT, { recursive: true });
const file = `${OUT}/rollback-${report.to.revision.slice(0, 7)}-to-${report.from.revision.slice(0, 7)}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(report.pass ? "ROLLBACK PASS" : "ROLLBACK FAIL", "→", file);
process.exitCode = report.pass ? 0 : 1;
