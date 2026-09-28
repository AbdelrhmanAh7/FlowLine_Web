#!/usr/bin/env node
/**
 * Backup → restore into a CLEAN environment → verify (TEST_PLAN §5, P3-27).
 *   node scripts/release/backup-restore.mjs --image flowline:<sha> [--out artifacts/phase-3/backup-restore]
 * Source: the running staging stack (web :3200, db container flowline-staging-db-1).
 * 1. Seeds known data through the public API (user, workspace, member invite, webhook flow + run, agent,
 *    knowledge source, API key) and records per-table row counts + id digests.
 * 2. pg_dump (custom format) → a new, empty PostgreSQL container → pg_restore.
 * 3. Compares every table's row count and id digest.
 * 4. Starts the SAME image (web + worker) against the restored DB with the same secrets, then: health
 *    (revision, schema version), password sign-in, flows/runs/agent/knowledge visible, API key still
 *    authenticates, and a SIGNED webhook delivery is accepted and executed (proves the encrypted webhook
 *    secret decrypts with the recovered key).
 * 5. Negative: the restored DB with a DIFFERENT encryption key refuses that delivery (key recovery matters).
 * The dump contains test data and encrypted secrets: it stays in the OS temp dir and is deleted afterwards.
 * Evidence (counts, digests, checks — no secrets) goes to --out.
 *
 * Email verification (Phase 4): the seeded user is verified through the real endpoint (scripts/release/lib/verified-user.mjs),
 * with the token read from the staging DB's email_outbox table — staging must run FLOWLINE_EMAIL_PROVIDER=outbox.
 *   [--invite <code>]   beta access code when staging runs FLOWLINE_BETA_MODE=invite_only
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { parseEnvFile } from "./lib/email-token.mjs";
import { verifiedUser } from "./lib/verified-user.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const IMAGE = arg("image");
if (!IMAGE) throw new Error("--image flowline:<sha> is required");
const OUT = arg("out", "artifacts/phase-3/backup-restore");
const SRC = "http://localhost:3200";
const DST = "http://localhost:3201";
const ENV_FILE = ".env.staging";
const env = parseEnvFile(readFileSync(ENV_FILE, "utf8"));
const INVITE = arg("invite");
const SRC_DB = `postgres://flowline:${env.STAGING_DB_PASSWORD}@127.0.0.1:5434/flowline`;
const RESTORE_PW = randomBytes(12).toString("hex");
const DST_DB = `postgres://flowline:${RESTORE_PW}@127.0.0.1:5435/flowline`;
const PASSWORD = "Restore-Check-Pass-1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (...a) => execFileSync("docker", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

class Session {
  constructor(base) {
    this.base = base;
    this.cookie = "";
  }
  async req(path, init = {}) {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { origin: this.base, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
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
const signed = (secret, body, eventId) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${eventId}.${body}`).digest("hex")}`;
};
async function waitHealthy(base, ms = 120_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${base}/api/health?require=worker`);
      if (r.ok) return r.json();
    } catch {}
    await sleep(2000);
  }
  throw new Error(`${base} not healthy`);
}
async function tableSnapshot(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const tables = (await c.query("select table_schema, table_name from information_schema.tables where table_schema in ('public','drizzle') and table_type = 'BASE TABLE' order by 1, 2")).rows;
  const out = {};
  for (const { table_schema: s, table_name: t } of tables) {
    const cols = (await c.query("select column_name from information_schema.columns where table_schema = $1 and table_name = $2", [s, t])).rows.map((r) => r.column_name);
    const key = cols.includes("id") ? '"id"::text' : `md5(row(t.*)::text)`;
    const r = await c.query(`select count(*)::int n, coalesce(md5(string_agg(${key}, ',' order by ${key})), '') d from "${s}"."${t}" t`);
    out[`${s}.${t}`] = { rows: r.rows[0].n, digest: r.rows[0].d };
  }
  await c.end();
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), "flowline-backup-"));
const dump = join(tmp, "flowline.dump");
const containers = ["flowline-restore-db", "flowline-restore-web", "flowline-restore-worker", "flowline-restore-wrongkey"];
const cleanup = () => {
  for (const c of containers) spawnSync("docker", ["rm", "-f", c], { stdio: "ignore" });
  rmSync(tmp, { recursive: true, force: true });
};
const report = { image: IMAGE, startedAt: new Date().toISOString() };

try {
  cleanup();
  mkdirSync(tmp, { recursive: true });
  // ── 1. seed known data on the source
  const src = await waitHealthy(SRC);
  report.sourceRevision = src.revision;
  report.sourceSchemaVersion = src.schemaVersion;
  const email = `restore-${randomUUID().slice(0, 8)}@flowline-restore.test`;
  const s = new Session(SRC);
  report.seedUser = await verifiedUser({ base: SRC, session: s, email, password: PASSWORD, name: "Restore Check", betaCode: INVITE, tokenSource: { dbUrl: SRC_DB } });
  const { workspace } = await s.ok("/api/workspaces", { method: "POST", json: { name: `Restore ${randomUUID().slice(0, 6)}` } });
  await s.ok("/api/onboarding", { method: "POST", json: { goal: "data", skipped: false } });
  await s.ok(`/api/workspaces/${workspace.id}/invites`, { method: "POST", json: { email: `invitee-${randomUUID().slice(0, 6)}@flowline-restore.test`, role: "editor" } });
  const { flow } = await s.ok(`/api/workspaces/${workspace.id}/flows`, { method: "POST", json: { name: "Restore webhook flow" } });
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
  const hookPath = new URL(pub.webhook.url).pathname;
  const secret = pub.webhook.secret;
  if (!secret) throw new Error("publish didn't reveal the webhook secret");
  const body1 = JSON.stringify({ n: 21 });
  const r1 = await fetch(SRC + hookPath, { method: "POST", headers: { "content-type": "application/json", "x-flowline-event-id": "pre-backup-1", "x-flowline-signature": signed(secret, body1, "pre-backup-1") }, body: body1 });
  check("source: signed webhook accepted before backup", r1.status === 202 || r1.status === 200, `HTTP ${r1.status}`);
  await s.ok(`/api/workspaces/${workspace.id}/knowledge`, { method: "POST", json: { name: "Restore policy", text: "Backups are restored into a clean environment and verified." } });
  const agent = await s.ok(`/api/workspaces/${workspace.id}/agents`, { method: "POST", json: { name: "Restore agent", instructions: "Answer from knowledge.", tools: [{ tool: "run_workflow", flowId: flow.id, permission: "ask" }] } });
  const key = await s.ok(`/api/workspaces/${workspace.id}/api-keys`, { method: "POST", json: { name: "restore", mode: "live", scopes: ["flows:read", "runs:read"] } });
  // wait for the pre-backup run and knowledge indexing
  for (let i = 0; i < 30; i++) {
    const runs = (await s.ok(`/api/flows/${flow.id}/runs`)).runs;
    const srcs = (await s.ok(`/api/workspaces/${workspace.id}/knowledge`)).sources;
    if (runs[0]?.status === "succeeded" && srcs[0]?.status === "ready") break;
    await sleep(1000);
  }
  const srcRuns = (await s.ok(`/api/flows/${flow.id}/runs`)).runs;
  check("source: pre-backup run succeeded", srcRuns[0]?.status === "succeeded", srcRuns[0]?.status);

  // ── 2. backup
  const before = await tableSnapshot(SRC_DB);
  const t0 = Date.now();
  const dumpBuf = execFileSync("docker", ["exec", "flowline-staging-db-1", "pg_dump", "-U", "flowline", "-Fc", "flowline"], { maxBuffer: 1024 * 1024 * 1024 });
  writeFileSync(dump, dumpBuf);
  report.backup = { format: "pg_dump custom (-Fc)", bytes: dumpBuf.length, ms: Date.now() - t0 };
  check("backup: pg_dump completed", dumpBuf.length > 0, `${dumpBuf.length} bytes`);

  // ── 3. restore into a brand-new, empty PostgreSQL container
  docker("run", "-d", "--name", "flowline-restore-db", "-e", "POSTGRES_USER=flowline", "-e", `POSTGRES_PASSWORD=${RESTORE_PW}`, "-e", "POSTGRES_DB=flowline", "-p", "127.0.0.1:5435:5432", "--memory", "512m", "postgres:17.6-alpine");
  for (let i = 0; i < 60; i++) {
    if (spawnSync("docker", ["exec", "flowline-restore-db", "pg_isready", "-U", "flowline", "-d", "flowline", "-h", "127.0.0.1"], { stdio: "ignore" }).status === 0) break;
    await sleep(1000);
  }
  await sleep(2000);
  const emptyTables = (await tableSnapshot(DST_DB));
  check("restore target is empty before restore", Object.keys(emptyTables).length === 0, `${Object.keys(emptyTables).length} tables`);
  const t1 = Date.now();
  const restore = spawnSync("docker", ["exec", "-i", "flowline-restore-db", "pg_restore", "-U", "flowline", "-d", "flowline", "--no-owner", "--exit-on-error"], { input: dumpBuf, maxBuffer: 64 * 1024 * 1024 });
  report.restore = { ms: Date.now() - t1, exitCode: restore.status };
  check("restore: pg_restore exit 0", restore.status === 0, restore.stderr?.toString().slice(0, 300));
  const after = await tableSnapshot(DST_DB);
  const mismatches = Object.keys(before).filter((t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
  const pick = ["public.user", "public.workspace", "public.workspace_member", "public.workspace_invite", "public.flow", "public.flow_version", "public.run", "public.run_step", "public.agent", "public.agent_version", "public.knowledge_source", "public.knowledge_chunk", "public.api_key", "public.webhook_endpoint", "public.connection", "public.billing_account", "public.audit_event", "drizzle.__drizzle_migrations"];
  report.tables = Object.fromEntries(pick.filter((t) => before[t]).map((t) => [t, { source: before[t].rows, restored: after[t]?.rows, digestMatch: before[t].digest === after[t]?.digest }]));
  report.tableCount = Object.keys(before).length;
  check("restore: every table's row count and id digest match", mismatches.length === 0 && Object.keys(after).length === Object.keys(before).length, mismatches.length ? `mismatch: ${mismatches.join(", ")}` : `${Object.keys(before).length} tables`);

  // ── 4. the same image against the restored DB, same secrets (key recovery)
  const appEnv = (key) => [
    "--env-file", ENV_FILE,
    "-e", `DATABASE_URL=postgres://flowline:${RESTORE_PW}@host.docker.internal:5435/flowline`,
    "-e", `BETTER_AUTH_URL=${DST}`, "-e", `FLOWLINE_PUBLIC_URL=${DST}`,
    ...(key ? ["-e", `FLOWLINE_ENCRYPTION_KEY=${key}`] : []),
    "--add-host", "host.docker.internal:host-gateway",
  ];
  docker("run", "-d", "--name", "flowline-restore-web", ...appEnv(), "-p", "127.0.0.1:3201:3000", "--memory", "1536m", IMAGE);
  docker("run", "-d", "--name", "flowline-restore-worker", ...appEnv(), "--memory", "768m", IMAGE, "node_modules/.bin/tsx", "worker/index.ts");
  const dst = await waitHealthy(DST);
  check("restored: health ok, same revision and schema version", dst.db === "ok" && dst.revision === src.revision && dst.schemaVersion === src.schemaVersion, `rev ${dst.revision.slice(0, 7)} schema ${dst.schemaVersion}`);
  const d = new Session(DST);
  const signIn = await d.req("/api/auth/sign-in/email", { method: "POST", json: { email, password: PASSWORD } });
  check("restored: password sign-in works", signIn.ok, `HTTP ${signIn.status}`);
  const flows = (await d.ok(`/api/workspaces/${workspace.id}/flows`)).flows;
  check("restored: workflow and published version present", flows.some((f) => f.id === flow.id && f.publishedVersion));
  const runs = (await d.ok(`/api/flows/${flow.id}/runs`)).runs;
  check("restored: run history present", runs.some((r) => r.id === srcRuns[0].id && r.status === "succeeded"));
  const agents = (await d.ok(`/api/workspaces/${workspace.id}/agents`)).agents;
  check("restored: agent present", agents.some((a) => a.id === (agent.agent?.id ?? agent.id)));
  const ks = (await d.ok(`/api/workspaces/${workspace.id}/knowledge/search?q=${encodeURIComponent("restored clean environment")}`)).hits ?? [];
  check("restored: knowledge metadata + index searchable", ks.length > 0);
  const members = (await d.ok(`/api/workspaces/${workspace.id}/members`)).members ?? [];
  const invites = (await d.ok(`/api/workspaces/${workspace.id}/invites`)).invites ?? [];
  check("restored: membership + pending invite present", members.length >= 1 && invites.length >= 1, `${members.length} member(s), ${invites.length} invite(s)`);
  const apiList = await fetch(`${DST}/api/v1/flows`, { headers: { authorization: `Bearer ${key.key}` } });
  check("restored: API key (hashed) still authenticates", apiList.status === 200, `HTTP ${apiList.status}`);
  const body2 = JSON.stringify({ n: 50 });
  const r2 = await fetch(DST + hookPath, { method: "POST", headers: { "content-type": "application/json", "x-flowline-event-id": "post-restore-1", "x-flowline-signature": signed(secret, body2, "post-restore-1") }, body: body2 });
  check("restored: signed webhook accepted (encrypted secret decrypts with the recovered key)", r2.status === 202, `HTTP ${r2.status}`);
  let executed = null;
  for (let i = 0; i < 30 && !executed; i++) {
    const rs = (await d.ok(`/api/flows/${flow.id}/runs`)).runs;
    executed = rs.find((r) => r.status === "succeeded" && r.id !== srcRuns[0].id) ?? null;
    if (!executed) await sleep(1000);
  }
  check("restored: webhook run executed by the restored worker", Boolean(executed));

  // ── 5. negative: wrong encryption key can't use restored encrypted secrets
  spawnSync("docker", ["rm", "-f", "flowline-restore-web", "flowline-restore-worker"], { stdio: "ignore" });
  docker("run", "-d", "--name", "flowline-restore-wrongkey", ...appEnv(randomBytes(32).toString("base64")), "-p", "127.0.0.1:3201:3000", "--memory", "1536m", IMAGE);
  await sleep(3000);
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${DST}/api/health`)).status) break;
    } catch {}
    await sleep(1000);
  }
  const body3 = JSON.stringify({ n: 7 });
  const r3 = await fetch(DST + hookPath, { method: "POST", headers: { "content-type": "application/json", "x-flowline-event-id": "wrong-key-1", "x-flowline-signature": signed(secret, body3, "wrong-key-1") }, body: body3 });
  check("negative: with a different encryption key the restored secret is unusable (delivery refused, 503)", r3.status === 503, `HTTP ${r3.status}`);
} catch (e) {
  check("script completed", false, String(e.message ?? e).slice(0, 300));
} finally {
  cleanup();
  report.finishedAt = new Date().toISOString();
  report.checks = checks;
  report.pass = checks.every((c) => c.ok);
  mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/backup-restore-${(report.sourceRevision ?? "unknown").slice(0, 7)}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(report.pass ? "BACKUP/RESTORE PASS" : "BACKUP/RESTORE FAIL", "→", file);
  process.exitCode = report.pass ? 0 : 1;
}
