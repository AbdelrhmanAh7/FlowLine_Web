#!/usr/bin/env node
/**
 * P4-20 private-beta load check against a running production build (the local staging stack).
 *   node scripts/load/beta.mjs [--base http://localhost:3200] [--env .env.staging] [--out artifacts/phase-4/load]
 *        [--invite <beta code>] [--users 5] [--flows-per-user 6] [--runs 30] [--concurrency 15] [--ai-runs 3]
 *        [--resets 3] [--page-rounds 3]
 *
 * Scenario (a small private beta, not a stress test):
 *   - --users verified users (scripts/release/lib/verified-user.mjs: real sign-up → verification email read from the
 *     staging DB's email_outbox → POST /api/email verify → sign-in), each in their own workspace; user 1 also owns a
 *     shared workspace and invites an editor who signs up, verifies and accepts the invitation.
 *   - Workflows created from the credential-free templates (lead-qualifier, ticket-priority, order-totals).
 *   - --runs manual runs submitted --concurrency at a time (the UI path, one clientRequestId per click), plus a few
 *     double-submits with the same clientRequestId (must yield ONE run).
 *   - --ai-runs runs of an AI · Generate workflow when the owner's workspace has a usable default AI model (AI hub:
 *     workspace connections, Settings → AI Providers); otherwise N/A. No server AI keys exist any more.
 *   - --resets password-reset requests (POST /api/email forgot); the reset emails are counted in email_outbox.
 *   - Page loads (HTML only, no assets) of /w/<slug>/flows, /runs, /integrations, /settings with the session cookie.
 *   - Users watch their runs list (GET /api/workspaces/<id>/runs) while the worker drains the queue.
 * Measured: p50/p95/p99 for API calls and page loads, run queue→finish time, success/failure counts, duplicate runs
 * and steps (DB), 5xx / network-error count, worker drain time. Targets are modest beta targets for one laptop;
 * the summary states measured values and labels pass/miss only against them. No SLA or capacity claim.
 *
 * Requirements: staging runs FLOWLINE_EMAIL_PROVIDER=outbox (verification + reset emails land in email_outbox) and its
 * PostgreSQL is reachable on 127.0.0.1:5434 (password STAGING_DB_PASSWORD from --env; never printed). On an
 * invitation-only beta (FLOWLINE_BETA_MODE=invite_only) pass --invite with a beta code valid for --users sign-ups
 * (the invited editor needs no code). Creates throwaway users …@flowline-beta-load.test.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { parseEnvFile } from "../release/lib/email-token.mjs";
import { verifiedUser } from "../release/lib/verified-user.mjs";
import { dockerStats, sleep, summary } from "./lib/common.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const num = (k, d) => {
  const v = Number(arg(k, d));
  if (!Number.isInteger(v) || v < 0) throw new Error(`--${k} must be a non-negative integer`);
  return v;
};
const BASE = arg("base", "http://localhost:3200").replace(/\/+$/, "");
const OUT = arg("out", "artifacts/phase-4/load");
const INVITE = arg("invite");
const USERS = Math.max(1, num("users", 5));
const FLOWS_PER_USER = num("flows-per-user", 6);
const RUNS = num("runs", 30);
const CONCURRENCY = Math.max(1, num("concurrency", 15));
const AI_RUNS = num("ai-runs", 3);
const RESETS = num("resets", 3);
const PAGE_ROUNDS = num("page-rounds", 3);
const envFile = parseEnvFile(readFileSync(arg("env", ".env.staging"), "utf8"));
if (!envFile.STAGING_DB_PASSWORD) throw new Error("STAGING_DB_PASSWORD missing from the env file (--env)");
const DB_URL = `postgres://flowline:${envFile.STAGING_DB_PASSWORD}@127.0.0.1:5434/flowline`;
const PASSWORD = "Beta-Load-Pass-1";
const TEMPLATES = ["lead-qualifier", "ticket-priority", "order-totals"];
const PAGES = ["flows", "runs", "integrations", "settings"];
const TARGETS = { fivexx: 0, duplicateRuns: 0, runTerminalMs: 120_000, apiP95Ms: 1500, pageP95Ms: 2500 };

// ───────────────────────────── measurement
/** Every measured HTTP call: { kind: "api" | "page" | "email", label, ms, status }. */
const samples = [];
class Session {
  cookie = "";
  async req(path, init = {}) {
    const res = await fetch(BASE + path, {
      method: init.method ?? "GET",
      redirect: init.redirect ?? "follow",
      headers: { origin: BASE, "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: AbortSignal.timeout(60_000),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) if (c.startsWith("better-auth.session_token=")) this.cookie = c.split(";")[0];
    return res;
  }
  /** Measured call: time until the body is fully read. Returns { status, ms, body } (body = parsed JSON or null). */
  async call(kind, label, path, init = {}) {
    const t = performance.now();
    let status = -1;
    let text = "";
    try {
      const r = await this.req(path, init);
      status = r.status;
      text = await r.text();
    } catch (e) {
      text = String(e.message ?? e);
    }
    const ms = performance.now() - t;
    samples.push({ kind, label, ms, status });
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    return { status, ms, body, text };
  }
  /** Measured API call that must succeed (setup steps). */
  async ok(label, path, init) {
    const r = await this.call("api", label, path, init);
    if (r.status < 200 || r.status >= 300) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${r.text.slice(0, 200)}`);
    return r.body;
  }
}
async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
/** p50/p95/p99/max of plain durations (no status histogram). */
const latency = (xs) => {
  const { statuses: _s, ...rest } = summary(xs, []);
  return rest;
};
const stats = (list) => summary(list.map((s) => s.ms), list.map((s) => s.status));
const byLabel = (list) => Object.fromEntries([...new Set(list.map((s) => s.label))].sort().map((l) => [l, stats(list.filter((s) => s.label === l))]));
const isServerError = (status) => status >= 500 || status < 0;
const verdict = (ok) => (ok ? "pass" : "miss");

async function newUser(tag, { betaCode = INVITE } = {}) {
  const s = new Session();
  const email = `${tag}-${randomUUID().slice(0, 8)}@flowline-beta-load.test`;
  await verifiedUser({
    base: BASE, session: s, email, password: PASSWORD, name: `Beta ${tag}`, betaCode, tokenSource: { dbUrl: DB_URL },
    onRateLimited: () => { report.setup.rateLimitedRetries++; },
  });
  return { s, email };
}
async function ownWorkspace(u, name, goal) {
  const { workspace } = await u.s.ok("workspace.create", "/api/workspaces", { method: "POST", json: { name } });
  if (goal) await u.s.ok("onboarding", "/api/onboarding", { method: "POST", json: { goal, skipped: false } });
  return workspace;
}

// ───────────────────────────── run
const report = {
  kind: "P4-20 private-beta load check",
  base: BASE,
  startedAt: new Date().toISOString(),
  params: { users: USERS, flowsPerUser: FLOWS_PER_USER, runs: RUNS, concurrency: CONCURRENCY, aiRuns: AI_RUNS, resets: RESETS, pageRounds: PAGE_ROUNDS, inviteOnlyCodeGiven: Boolean(INVITE) },
  targets: TARGETS,
  setup: { rateLimitedRetries: 0 },
  resources: [],
};
const health = await (await fetch(`${BASE}/api/health?require=worker`)).json().catch(() => ({}));
report.revision = health.revision ?? "unknown";
report.schemaVersion = health.schemaVersion;
console.log(`target ${BASE} revision ${report.revision} schema ${report.schemaVersion} (db ${health.db}, worker ${health.worker})`);
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
const t0 = new Date();
report.resources.push({ at: t0.toISOString(), containers: dockerStats() });
const resourceTick = setInterval(() => report.resources.push({ at: new Date().toISOString(), containers: dockerStats() }), 15_000);
const workspaceIds = [];
const submitted = []; // { runId, kind: "template" | "shared" | "ai" | "double", status, ms, clientRequestId, s }
let error = null;

try {
  // 1. users + workspaces
  console.log(`setup: ${USERS} verified users, own workspaces`);
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const u = await newUser(`beta${i + 1}`);
    u.workspace = await ownWorkspace(u, `Beta load ${i + 1} ${randomUUID().slice(0, 4)}`, ["sales", "data", "support"][i % 3]);
    workspaceIds.push(u.workspace.id);
    users.push(u);
  }
  console.log("setup: shared workspace + invited editor");
  const owner = users[0];
  const shared = await ownWorkspace(owner, `Beta shared ${randomUUID().slice(0, 4)}`);
  workspaceIds.push(shared.id);
  const inviteeEmail = `beta-editor-${randomUUID().slice(0, 8)}@flowline-beta-load.test`;
  const inv = await owner.s.ok("invite.create", `/api/workspaces/${shared.id}/invites`, { method: "POST", json: { email: inviteeEmail, role: "editor" } });
  const inviteToken = new URL(inv.url).pathname.split("/").filter(Boolean).at(-1);
  const editor = { s: new Session(), email: inviteeEmail };
  await verifiedUser({ base: BASE, session: editor.s, email: inviteeEmail, password: PASSWORD, name: "Beta editor", tokenSource: { dbUrl: DB_URL }, onRateLimited: () => { report.setup.rateLimitedRetries++; } });
  await editor.s.ok("invite.accept", `/api/invites/${inviteToken}`, { method: "POST" });
  const members = (await owner.s.ok("members.list", `/api/workspaces/${shared.id}/members`)).members ?? [];
  report.sharedWorkspace = { invitationEmailed: inv.emailed ?? null, members: members.length, editorJoined: members.some((m) => m.email?.toLowerCase() === inviteeEmail) };

  // 2. workflows from credential-free templates
  console.log(`workflows: ${USERS} × ${FLOWS_PER_USER} + 2 shared`);
  const flows = []; // { u, flowId, workspaceId, kind }
  await pool(users, CONCURRENCY, async (u, i) => {
    for (let k = 0; k < FLOWS_PER_USER; k++) {
      const { flow } = await u.s.ok("flow.createFromTemplate", `/api/workspaces/${u.workspace.id}/flows`, { method: "POST", json: { templateId: TEMPLATES[(i + k) % TEMPLATES.length] } });
      flows.push({ u, flowId: flow.id, kind: "template" });
    }
  });
  for (let k = 0; k < 2; k++) {
    const { flow } = await editor.s.ok("flow.createFromTemplate", `/api/workspaces/${shared.id}/flows`, { method: "POST", json: { templateId: TEMPLATES[k] } });
    flows.push({ u: editor, flowId: flow.id, kind: "shared" });
  }
  report.workflowsCreated = flows.length;
  for (const u of users) await u.s.ok("flows.list", `/api/workspaces/${u.workspace.id}/flows`);

  // 3. AI provider detection
  const prov = await owner.s.call("api", "ai.status", `/api/workspaces/${owner.workspace.id}/ai`);
  const st = prov.body?.status;
  const available = st?.defaultRoute && st.defaultUsable ? [{ id: st.defaultRoute.provider, model: st.defaultRoute.modelId }] : [];
  report.ai = { providersAvailable: available, requested: AI_RUNS };
  let aiFlowId = null;
  if (AI_RUNS > 0 && available.length) {
    const { flow } = await owner.s.ok("flow.create", `/api/workspaces/${owner.workspace.id}/flows`, { method: "POST", json: { name: "Beta load AI summary" } });
    const graph = {
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, data: { label: "Start", config: { samplePayload: JSON.stringify({ text: "Flowline beta load check. Summarize this sentence in five words." }) } } },
        { id: "a", type: "ai.generate", position: { x: 300, y: 0 }, data: { label: "Summarize", config: { instructions: "Summarize the input in one short sentence.", source: "$string(text)", maxTokens: 60, model: "" } } },
        { id: "o", type: "output", position: { x: 600, y: 0 }, data: { label: "Done", config: { key: "summary", expression: "" } } },
      ],
      edges: [
        { id: "e1", source: "t", target: "a", sourceHandle: null },
        { id: "e2", source: "a", target: "o", sourceHandle: null },
      ],
    };
    await owner.s.ok("flow.save", `/api/flows/${flow.id}`, { method: "PUT", json: { baseRevision: 1, graph } });
    aiFlowId = flow.id;
  } else {
    report.ai.status = AI_RUNS === 0 ? "N/A (--ai-runs 0)" : "N/A (no AI provider configured on this server)";
  }

  // 4. concurrent runs (the UI path: one clientRequestId per click)
  console.log(`runs: ${RUNS} submitted ${CONCURRENCY} at a time${aiFlowId ? ` + ${AI_RUNS} AI runs` : ""}`);
  const submit = async (f, kind, clientRequestId = randomUUID().replace(/-/g, "")) => {
    const r = await f.u.s.call("api", "run.submit", `/api/flows/${f.flowId}/runs`, { method: "POST", json: { clientRequestId } });
    const rec = { runId: r.body?.run?.id ?? null, kind, status: r.status, ms: r.ms, clientRequestId, s: f.u.s };
    submitted.push(rec);
    return rec;
  };
  const jobs = Array.from({ length: RUNS }, (_, i) => flows[i % flows.length]);
  const firstSubmitAt = Date.now();
  const aiJobs = aiFlowId ? Array.from({ length: AI_RUNS }, () => ({ u: owner, flowId: aiFlowId })) : [];
  await Promise.all([pool(jobs, CONCURRENCY, (f) => submit(f, f.kind)), pool(aiJobs, 1, (f) => submit(f, "ai"))]);
  // Double-submit probe: the same clientRequestId sent twice at once must give one run.
  const doubles = [];
  for (let i = 0; i < Math.min(3, flows.length); i++) {
    const id = randomUUID().replace(/-/g, "");
    const [a, b] = await Promise.all([submit(flows[i], "double", id), submit(flows[i], "double", id)]);
    doubles.push({ clientRequestId: id, sameRunReturned: Boolean(a.runId) && a.runId === b.runId });
  }
  const lastSubmitAt = Date.now();
  // A run can exist even when its response was not 2xx (e.g. the per-user run rate limit answers 429 after enqueueing a
  // click-identified run), so every submission is resolved to its run through the clientRequestId (trigger_ref).
  const refs = [...new Set(submitted.map((r) => `click:${r.clientRequestId}`))];
  const refRows = (await db.query("select id, trigger_ref from run where workspace_id = any($1::uuid[]) and trigger_ref = any($2::text[])", [workspaceIds, refs])).rows;
  const idByRef = new Map(refRows.map((r) => [r.trigger_ref, r.id]));
  for (const r of submitted) r.runId ??= idByRef.get(`click:${r.clientRequestId}`) ?? null;
  report.submission = { ...summary(submitted.map((r) => r.ms), submitted.map((r) => r.status)), wallMs: lastSubmitAt - firstSubmitAt, rateLimited: submitted.filter((r) => r.status === 429).length };

  // 5. email sends: password-reset requests (latency has a deliberate 500 ms floor — reported separately)
  const resetEmails = users.slice(0, RESETS).map((u) => u.email);
  await Promise.all(resetEmails.map((email) => new Session().call("email", "email.forgot", "/api/email", { method: "POST", json: { action: "forgot", email } })));

  // 6. page loads (HTML documents) + users watching their runs while the worker drains
  console.log(`pages: ${PAGE_ROUNDS} rounds × ${USERS} users × ${PAGES.length} screens; drain`);
  const pageRound = () =>
    Promise.all(users.map(async (u) => {
      for (const p of PAGES) await u.s.call("page", `page./${p}`, `/w/${u.workspace.slug}/${p}`, { redirect: "manual", headers: { accept: "text/html" } });
    }));
  const ourRuns = () => [...new Set(submitted.map((r) => r.runId).filter(Boolean))];
  const openCount = async () => (await db.query("select count(*)::int n from run where id = any($1::uuid[]) and status not in ('succeeded','failed','cancelled')", [ourRuns()])).rows[0].n;
  let drainedAt = null;
  const drainLimit = lastSubmitAt + 300_000;
  let round = 0;
  const checkDrained = async () => {
    if (drainedAt === null && (await openCount()) === 0) drainedAt = Date.now();
  };
  while (Date.now() < drainLimit) {
    await checkDrained();
    if (drainedAt !== null && round >= PAGE_ROUNDS) break;
    if (round < PAGE_ROUNDS) {
      await pageRound();
      round++;
    }
    await Promise.all(users.map((u) => u.s.call("api", "runs.list", `/api/workspaces/${u.workspace.id}/runs`)));
    await checkDrained();
    if (drainedAt === null) await sleep(1000);
  }
  report.drain = { drained: drainedAt !== null, msAfterLastSubmit: drainedAt ? drainedAt - lastSubmitAt : null, msFromFirstSubmit: drainedAt ? drainedAt - firstSubmitAt : null, openRunsAtEnd: await openCount() };
  report.drain.globalOpenRunsAtEnd = (await db.query("select count(*)::int n from run where status in ('queued','running')")).rows[0].n;
  // A sample of run detail reads (the run page's API).
  for (const r of submitted.filter((x) => x.runId).slice(0, 10)) await r.s.call("api", "run.detail", `/api/runs/${r.runId}`);

  // 7. DB checks: run outcomes, queue→finish, duplicates, emails
  const ids = ourRuns();
  const rows = (await db.query("select id, status, trigger_ref, error->>'code' as error_code, extract(epoch from (started_at - created_at)) * 1000 as queue_ms, extract(epoch from (finished_at - created_at)) * 1000 as total_ms from run where id = any($1::uuid[])", [ids])).rows;
  const kindOf = new Map(submitted.map((r) => [r.runId, r.kind]));
  const outcome = (list) => {
    const byStatus = {};
    const errors = {};
    for (const r of list) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.error_code) errors[r.error_code] = (errors[r.error_code] ?? 0) + 1;
    }
    const done = list.filter((r) => r.total_ms != null).map((r) => Number(r.total_ms));
    return { runs: list.length, byStatus, errorCodes: errors, queueToFinishMs: latency(done), queueWaitMs: latency(list.filter((r) => r.queue_ms != null).map((r) => Number(r.queue_ms))) };
  };
  report.runs = {
    all: outcome(rows),
    template: outcome(rows.filter((r) => ["template", "shared", "double"].includes(kindOf.get(r.id)))),
    ai: outcome(rows.filter((r) => kindOf.get(r.id) === "ai")),
  };
  if (aiFlowId) {
    const ai = report.runs.ai;
    const unavailable = ai.errorCodes.AI_UNAVAILABLE ?? 0;
    report.ai.status = ai.runs && unavailable === ai.runs ? "N/A (provider listed but refused: AI_UNAVAILABLE)" : `measured: ${ai.byStatus.succeeded ?? 0} succeeded, ${ai.byStatus.failed ?? 0} failed of ${ai.runs}`;
  }
  const expected = new Set(ids);
  // The workspaces and users are all new, so every run / email row found for them belongs to this check.
  const runsInOurWorkspaces = (await db.query("select count(*)::int n from run where workspace_id = any($1::uuid[])", [workspaceIds])).rows[0].n;
  const dupRef = (await db.query("select count(*)::int n from (select trigger_ref from run where workspace_id = any($1::uuid[]) and trigger_ref is not null group by flow_id, trigger_ref having count(*) > 1) d", [workspaceIds])).rows[0].n;
  const dupSteps = (await db.query("select count(*)::int n from (select run_id, node_id from run_step where run_id = any($1::uuid[]) group by run_id, node_id having count(*) > 1) d", [ids])).rows[0].n;
  const dupExec = (await db.query("select count(*)::int n from (select run_id from usage_event where run_id = any($1::uuid[]) and kind = 'execution' group by run_id having count(*) > 1) d", [ids])).rows[0].n;
  report.duplicates = {
    expectedRuns: expected.size,
    runsInDbForOurWorkspaces: runsInOurWorkspaces,
    extraRunRows: runsInOurWorkspaces - expected.size,
    sameClientRequestIdRunRows: dupRef,
    doubleSubmitProbe: doubles,
    duplicateStepRows: dupSteps,
    runsWithDuplicateExecutionEvents: dupExec,
  };
  await sleep(2000);
  const resetRows = (await db.query("select count(*)::int n from email_outbox where lower(recipient) = any($1::text[]) and tags->>'purpose' = 'reset'", [resetEmails.map((e) => e.toLowerCase())])).rows[0].n;
  report.email = { resetRequests: resetEmails.length, resetEmailsInOutbox: resetRows, verificationEmailsInOutbox: (await db.query("select count(*)::int n from email_outbox where lower(recipient) = any($1::text[]) and tags->>'purpose' = 'verify'", [[...users.map((u) => u.email), inviteeEmail].map((e) => e.toLowerCase())])).rows[0].n };
} catch (e) {
  error = String(e.message ?? e).slice(0, 400);
  console.error("FAILED:", error);
}
clearInterval(resourceTick);
report.resources.push({ at: new Date().toISOString(), containers: dockerStats() });
await db.end().catch(() => {});

// ───────────────────────────── results
const api = samples.filter((s) => s.kind === "api");
const pages = samples.filter((s) => s.kind === "page");
report.error = error;
report.http = {
  api: stats(api),
  apiByLabel: byLabel(api),
  pages: stats(pages),
  pagesByScreen: byLabel(pages),
  email: stats(samples.filter((s) => s.kind === "email")),
  serverErrors: samples.filter((s) => isServerError(s.status)).length,
  networkErrors: samples.filter((s) => s.status < 0).length,
  non2xxPages: pages.filter((s) => s.status !== 200).length,
};
const toMb = (m) => (m?.endsWith("GiB") ? parseFloat(m) * 1024 : parseFloat(m));
const peak = (name) => Math.max(0, ...report.resources.flatMap((r) => r.containers.filter((c) => c.name?.includes(name)).map((c) => toMb(c.mem) || 0)));
report.peakMemMb = { web: peak("-web-"), worker: peak("-worker-"), db: peak("-db-") };
const allRuns = report.runs?.all;
const allTerminal = Boolean(allRuns && report.drain?.openRunsAtEnd === 0 && allRuns.runs === report.duplicates?.expectedRuns);
report.verdicts = error
  ? { completed: "miss" }
  : {
      completed: "pass",
      zero5xx: verdict(report.http.serverErrors === 0),
      zeroDuplicateRuns: verdict(report.duplicates.extraRunRows === 0 && report.duplicates.sameClientRequestIdRunRows === 0 && report.duplicates.doubleSubmitProbe.every((d) => d.sameRunReturned) && report.duplicates.duplicateStepRows === 0 && report.duplicates.runsWithDuplicateExecutionEvents === 0),
      allRunsTerminalWithin120s: verdict(allTerminal && (allRuns.queueToFinishMs.max ?? Infinity) <= TARGETS.runTerminalMs),
      apiP95Under1500ms: verdict(report.http.api.p95 !== null && report.http.api.p95 < TARGETS.apiP95Ms),
      pageP95Under2500ms: verdict(report.http.pages.p95 !== null && report.http.pages.p95 < TARGETS.pageP95Ms && report.http.non2xxPages === 0),
    };
report.finishedAt = new Date().toISOString();

const rev = String(report.revision).slice(0, 7);
const stamp = Date.now();
mkdirSync(OUT, { recursive: true });
const jsonFile = `${OUT}/beta-load-${rev}-${stamp}.json`;
writeFileSync(jsonFile, JSON.stringify(report, null, 2));

const ms = (v) => (v == null ? "—" : `${v} ms`);
const line = (s) => `n=${s.n}, p50 ${ms(s.p50)}, p95 ${ms(s.p95)}, p99 ${ms(s.p99)}, max ${ms(s.max)}`;
const md = [
  `# P4-20 private-beta load check — ${rev}`,
  "",
  `Target ${BASE} (revision ${report.revision}, schema ${report.schemaVersion}), ${report.startedAt} → ${report.finishedAt}.`,
  "Local staging stack on one laptop (one web + one worker container). **No SLA or capacity claim.** These are measured values for a small private-beta scenario; pass/miss is only against the modest beta targets below.",
  "",
  error ? `**The run did not complete:** ${error}\n` : "",
  "## Scenario",
  `- ${USERS} email-verified users in their own workspaces; one shared workspace with an invited editor (${report.sharedWorkspace ? (report.sharedWorkspace.editorJoined ? "joined" : "NOT joined") : "not reached"}).`,
  `- ${report.workflowsCreated ?? 0} workflows from credential-free templates; ${RUNS} runs submitted ${CONCURRENCY} at a time + ${report.duplicates?.doubleSubmitProbe.length ?? 0} double-submit probes (${report.submission?.rateLimited ?? 0} submissions answered 429 by the per-user run rate limit).`,
  `- AI step runs: ${report.ai?.status ?? "not reached"}.`,
  `- Email: ${report.email ? `${report.email.resetRequests} password-reset requests → ${report.email.resetEmailsInOutbox} reset emails in email_outbox; ${report.email.verificationEmailsInOutbox} verification emails` : "not reached"}.`,
  `- Page loads: ${PAGES.map((p) => `/w/<slug>/${p}`).join(", ")} (HTML only, no static assets), ${PAGE_ROUNDS} rounds per user.`,
  "",
  "## Measured",
  `- API: ${line(report.http.api)}`,
  `- Pages: ${line(report.http.pages)}; non-200 responses: ${report.http.non2xxPages}`,
  `- Password-reset requests (deliberate 500 ms response floor, not in the API figures): ${line(report.http.email)}`,
  allRuns ? `- Runs: ${allRuns.runs} (${Object.entries(allRuns.byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}); queue→finish ${line(allRuns.queueToFinishMs)}; queue wait p95 ${ms(allRuns.queueWaitMs.p95)}` : "- Runs: not reached",
  report.drain ? `- Worker drain: ${report.drain.drained ? `${report.drain.msAfterLastSubmit} ms after the last submission (${report.drain.msFromFirstSubmit} ms from the first)` : "NOT drained within 300 s"}; open runs at end ${report.drain.openRunsAtEnd}` : "- Worker drain: not reached",
  report.duplicates ? `- Duplicates: extra run rows ${report.duplicates.extraRunRows}, repeated clientRequestId rows ${report.duplicates.sameClientRequestIdRunRows}, double-submit probes returning one run ${report.duplicates.doubleSubmitProbe.filter((d) => d.sameRunReturned).length}/${report.duplicates.doubleSubmitProbe.length}, duplicate step rows ${report.duplicates.duplicateStepRows}, runs with duplicate execution events ${report.duplicates.runsWithDuplicateExecutionEvents}` : "- Duplicates: not reached",
  `- 5xx / network errors: ${report.http.serverErrors} (of which network errors ${report.http.networkErrors})`,
  `- Peak memory (docker stats, MB): web ${report.peakMemMb.web}, worker ${report.peakMemMb.worker}, db ${report.peakMemMb.db}`,
  "",
  "## Against the beta targets",
  "| Target | Measured | Result |",
  "| --- | --- | --- |",
  `| 0 5xx | ${report.http.serverErrors} | ${report.verdicts.zero5xx ?? "miss"} |`,
  `| 0 duplicate runs | ${report.duplicates ? report.duplicates.extraRunRows + report.duplicates.sameClientRequestIdRunRows : "—"} extra / repeated | ${report.verdicts.zeroDuplicateRuns ?? "miss"} |`,
  `| all runs terminal within 120 s | max queue→finish ${ms(allRuns?.queueToFinishMs.max)} | ${report.verdicts.allRunsTerminalWithin120s ?? "miss"} |`,
  `| API p95 < 1500 ms | ${ms(report.http.api.p95)} | ${report.verdicts.apiP95Under1500ms ?? "miss"} |`,
  `| page p95 < 2500 ms | ${ms(report.http.pages.p95)} | ${report.verdicts.pageP95Under2500ms ?? "miss"} |`,
  "",
  "No SLA or capacity claim. Raw data: `" + jsonFile.split("/").at(-1) + "`.",
  "",
].join("\n");
const mdFile = jsonFile.replace(/\.json$/, ".md");
writeFileSync(mdFile, md);
console.log("verdicts", report.verdicts);
console.log("written", jsonFile, "and", mdFile);
process.exitCode = error || Object.values(report.verdicts).includes("miss") ? 1 : 0;
