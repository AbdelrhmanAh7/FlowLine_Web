/**
 * Current, workspace-scoped cloud Copilot evaluation. Historical runner remains unchanged.
 * Defaults to metadata-only preflight; --execute explicitly permits the bounded provider calls.
 * No credentials in arguments/output. Use protected runtime configuration, then:
 *   tsx scripts/diag/copilot-benchmark-hub.mts --describe
 *   tsx scripts/diag/copilot-benchmark-hub.mts --workspace <id> --actor <id>
 *     --connection <id> --model <model-id> --checkpoint refs/checkpoints/<name> --database <dedicated-db>
 *     [--execute --max-generations <1..72>] [--runs <1|2>] [--out artifacts/beta-execution/<new-dir>]
 * Run only on the dedicated local staging DB/workspace after UI key onboarding.
 * Requires USD, hard monthly budget 0, FREE_ONLY, no unknown cost or alternative routes.
 * This freezes the historical 12 EN cases and scorers; AR evaluation remains NOT RUN.
 * Calls use the real hub and write its metering/attempt records; no proposals are saved,
 * published, or executed. External action results remain STATIC checks.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { applyPatch, previewGraph } from "@/server/copilot-patch";
import type { AiProvider, AiRequest } from "@/ai/provider";
import type { PriceSnapshot } from "@/ai/hub/pricing";

const EMPTY: FlowGraph = { nodes: [], edges: [] };
const LEAD = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!.graph;

type G = FlowGraph;
const cfg = (n: FlowNode | undefined) => (n?.data.config ?? {}) as Record<string, unknown>;
const byType = (g: G, t: string) => g.nodes.filter((n) => n.type === t);
const action = (g: G, id: string) => g.nodes.find((n) => n.type === "integration.action" && cfg(n).actionId === id);
const has = (g: G, t: string) => byType(g, t).length > 0;
/** True when some node matching `a` has a directed path to some node matching `b`. */
function before(g: G, a: (n: FlowNode) => boolean, b: (n: FlowNode) => boolean) {
  const next = new Map<string, string[]>();
  for (const e of g.edges) next.set(e.source, [...(next.get(e.source) ?? []), e.target]);
  for (const s of g.nodes.filter(a)) {
    const seen = new Set<string>([s.id]);
    const q = [s.id];
    while (q.length) {
      for (const t of next.get(q.shift()!) ?? []) {
        if (seen.has(t)) continue;
        seen.add(t);
        const tn = g.nodes.find((n) => n.id === t);
        if (tn && b(tn)) return true;
        q.push(t);
      }
    }
  }
  return false;
}
const T = (t: string) => (n: FlowNode) => n.type === t;
const A = (id: string) => (n: FlowNode) => n.type === "integration.action" && cfg(n).actionId === id;
const isTrigger = (n: FlowNode) => n.type.startsWith("trigger.");
const text = (v: unknown) => JSON.stringify(v ?? "").toLowerCase();

interface Case {
  id: string;
  category: string;
  request: string;
  base: G;
  refusal?: boolean;
  select?: (g: G) => boolean;
  order?: (g: G) => boolean;
  params?: (g: G) => boolean;
  /** Dry-run check (local graphs) — receives the engine output. */
  result?: (output: Record<string, unknown>) => boolean;
  /** Static result check for graphs with external steps. */
  staticResult?: (g: G) => boolean;
  /** Sample input for the dry run (overrides the trigger's sample payload). */
  sample?: unknown;
}

const outputValues = (o: Record<string, unknown>) => Object.values(o ?? {});
const CASES: Case[] = [
  {
    id: "schedule", category: "scheduled workflow",
    request: "Every Monday at 9am Cairo time, output a message that says it is time for the weekly review.",
    base: EMPTY,
    select: (g) => has(g, "trigger.schedule") && has(g, "output"),
    order: (g) => before(g, T("trigger.schedule"), T("output")),
    params: (g) => { const c = cfg(byType(g, "trigger.schedule")[0]); return /^0 9 \* \* (1|MON)$/i.test(String(c.cron).trim()) && String(c.timezone) === "Africa/Cairo"; },
    result: (o) => /weekly review/i.test(text(o)),
  },
  {
    id: "webhook", category: "webhook workflow",
    request: 'When an order webhook arrives with items [{"price":..,"qty":..}], output the order total as "total".',
    base: EMPTY,
    select: (g) => has(g, "trigger.webhook") && has(g, "output"),
    order: (g) => before(g, T("trigger.webhook"), T("output")),
    params: () => true,
    sample: { body: { items: [{ price: 10, qty: 2 }, { price: 5, qty: 3 }] } },
    result: (o) => outputValues(o).some((v) => v === 35 || text(v).includes("35")),
  },
  {
    id: "gmail", category: "Gmail workflow",
    request: "When a webhook with a customer email arrives, send them a thank-you email with Gmail.",
    base: EMPTY,
    select: (g) => has(g, "trigger.webhook") && Boolean(action(g, "gmail.send")),
    order: (g) => before(g, T("trigger.webhook"), A("gmail.send")),
    params: (g) => /email/i.test(String(cfg(action(g, "gmail.send")).inputMapping)),
    staticResult: (g) => /thank/i.test(String(cfg(action(g, "gmail.send")).inputMapping)),
  },
  {
    id: "sheets", category: "Google Sheets workflow",
    request: "When a lead webhook arrives with name and email, append a row with the name and email to Google Sheets.",
    base: EMPTY,
    select: (g) => has(g, "trigger.webhook") && Boolean(action(g, "google_sheets.append_row")),
    order: (g) => before(g, T("trigger.webhook"), A("google_sheets.append_row")),
    params: (g) => { const m = String(cfg(action(g, "google_sheets.append_row")).inputMapping); return /name/i.test(m) && /email/i.test(m); },
    staticResult: (g) => /name/i.test(String(cfg(action(g, "google_sheets.append_row")).inputMapping)),
  },
  {
    id: "slack", category: "Slack workflow",
    request: "Every weekday at 8am, post 'Good morning team' to the Slack channel #general.",
    base: EMPTY,
    select: (g) => has(g, "trigger.schedule") && Boolean(action(g, "slack.post_message")),
    order: (g) => before(g, T("trigger.schedule"), A("slack.post_message")),
    params: (g) => /1-5|MON-FRI/i.test(String(cfg(byType(g, "trigger.schedule")[0]).cron)) && /general/i.test(String(cfg(action(g, "slack.post_message")).inputMapping)),
    staticResult: (g) => /good morning/i.test(String(cfg(action(g, "slack.post_message")).inputMapping)),
  },
  {
    id: "github", category: "GitHub workflow",
    request: "When a pull request webhook arrives, list the files changed in the PR and post a comment on it with how many files changed.",
    base: EMPTY,
    select: (g) => Boolean(action(g, "github.list_pr_files")) && Boolean(action(g, "github.create_issue_comment")),
    order: (g) => before(g, isTrigger, A("github.list_pr_files")) && before(g, A("github.list_pr_files"), A("github.create_issue_comment")),
    params: (g) => /count|\$count|length|files/i.test(String(cfg(action(g, "github.create_issue_comment")).inputMapping)),
    staticResult: (g) => /\$count/i.test(String(cfg(action(g, "github.create_issue_comment")).inputMapping)),
  },
  {
    id: "transform", category: "data transform",
    request: 'Start manually with {"first":"Ada","last":"Lovelace","email":"ADA@EXAMPLE.COM"} and output fullName and the email in lowercase.',
    base: EMPTY,
    select: (g) => has(g, "trigger.manual") && has(g, "output"),
    order: (g) => before(g, T("trigger.manual"), T("output")),
    params: () => true,
    sample: { first: "Ada", last: "Lovelace", email: "ADA@EXAMPLE.COM" },
    // Case matters here: the raw (not lowercased) output must carry the lowercased email, and never the original.
    result: (o) => /ada lovelace/i.test(text(o)) && JSON.stringify(o ?? "").includes('"ada@example.com"') && !JSON.stringify(o ?? "").includes("ADA@EXAMPLE.COM"),
  },
  {
    id: "branch", category: "branch / condition",
    request: 'Start manually with an order amount. If the amount is over 100, output "big", otherwise output "small".',
    base: EMPTY,
    select: (g) => has(g, "logic.condition") && byType(g, "output").length >= 1,
    order: (g) => before(g, T("trigger.manual"), T("logic.condition")) && before(g, T("logic.condition"), T("output")),
    params: (g) => />\s*100/.test(String(cfg(byType(g, "logic.condition")[0]).expression)),
    sample: { amount: 150 },
    result: (o) => text(o).includes("big") && !text(o).includes("small"),
  },
  {
    id: "classify", category: "AI classification",
    request: "When a support ticket webhook arrives, use AI to classify its urgency as low, medium or high and output the label.",
    base: EMPTY,
    select: (g) => has(g, "trigger.webhook") && has(g, "ai.classify") && has(g, "output"),
    order: (g) => before(g, T("trigger.webhook"), T("ai.classify")) && before(g, T("ai.classify"), T("output")),
    params: (g) => { const l = String(cfg(byType(g, "ai.classify")[0]).labels).toLowerCase(); return ["low", "medium", "high"].every((x) => l.includes(x)); },
    staticResult: () => true,
  },
  {
    id: "multistep", category: "multi-step workflow",
    request: "On a signup webhook: normalize the email to lowercase, and if the company has more than 50 employees post the email to Slack #sales; always output the normalized email.",
    base: EMPTY,
    select: (g) => has(g, "trigger.webhook") && has(g, "logic.condition") && Boolean(action(g, "slack.post_message")) && has(g, "output"),
    order: (g) => before(g, T("trigger.webhook"), T("logic.condition")) && before(g, T("logic.condition"), A("slack.post_message")),
    params: (g) => />\s*50/.test(String(cfg(byType(g, "logic.condition")[0]).expression)) && /sales/i.test(String(cfg(action(g, "slack.post_message")).inputMapping)),
    staticResult: (g) => /lowercase/i.test(JSON.stringify(g.nodes.map((n) => n.data.config))),
  },
  {
    id: "missing", category: "missing integration request",
    request: "When a deal closes in Salesforce, create an invoice in QuickBooks.",
    base: EMPTY,
    refusal: true,
  },
  {
    id: "ambiguous", category: "ambiguous request (safe interpretation)",
    request: "Add a step that checks whether the lead is valid.",
    base: LEAD,
    // Safe interpretation: adds a condition (or transform) without removing the user's steps; no external actions invented.
    select: (g) => g.nodes.length > LEAD.nodes.length && !g.nodes.some((n) => n.type === "integration.action"),
    order: (g) => before(g, isTrigger, (n) => !LEAD.nodes.some((l) => l.id === n.id)),
    params: (g) => LEAD.nodes.every((l) => g.nodes.some((n) => n.id === l.id)),
    staticResult: () => true,
  },
];

type Score = Record<string, boolean | "n/a" | "static">;
type CaseResult = {
  case: string; category: string; run: number; correct: boolean | null; score: Score;
  resultCheck: "dry-run" | "refusal" | "static"; generations: number; ms: number;
  errorCodes: string[]; warningCodes: string[]; blockedCode?: string;
};

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : "BENCHMARK_ERROR";
let inferenceStarted = false;
class SafetyStop extends Error {
  constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new SafetyStop(code); }
const frozenSource = (source: string, end: string) => {
  const normalized = source.replace(/\r\n/g, "\n");
  return normalized.slice(normalized.indexOf("const EMPTY: FlowGraph"), normalized.indexOf(end));
};
const SOURCE_FILES = [
  "scripts/diag/copilot-benchmark-hub.mts", "scripts/diag/copilot-benchmark.mts",
  "src/server/copilot.ts", "src/server/copilot-patch.ts", "src/ai/provider.ts",
  "src/ai/hub/execute.ts", "src/ai/hub/routing.ts", "src/ai/hub/pricing.ts",
  "src/ai/hub/registry.ts", "src/ai/hub/catalogue.ts", "src/ai/hub/credentials.ts",
  "src/ai/hub/protocols/openai-chat.ts", "src/server/usage.ts", "src/db/schema.ts",
] as const;

/** Preserve case prompts, predicates, helper code and order exactly, including static external result checks. */
function definition() {
  const old = frozenSource(readFileSync("scripts/diag/copilot-benchmark.mts", "utf8"), "const provider = getAiProvider();");
  const current = frozenSource(readFileSync("scripts/diag/copilot-benchmark-hub.mts", "utf8"), "type Score =");
  if (old !== current || CASES.length !== 12) fail("FROZEN_CASES_CHANGED");
  return { language: "en", count: CASES.length, ids: CASES.map((c) => c.id), frozenDefinitionSha256: digest(old), arabic: "NOT_RUN_NO_FROZEN_ARABIC_REQUEST_SET" };
}

function readArgs() {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowed = new Set(["workspace", "actor", "connection", "model", "checkpoint", "database", "max-generations", "runs", "out"]);
  for (let i = 2; i < process.argv.length; i++) {
    const name = process.argv[i].replace(/^--/, "");
    if (name === "describe" || name === "execute") {
      if (flags.has(name)) fail("DUPLICATE_ARGUMENT");
      flags.add(name);
    } else {
      if (!process.argv[i].startsWith("--") || !allowed.has(name) || values.has(name)) fail("INVALID_ARGUMENT");
      const value = process.argv[++i];
      if (!value || value.startsWith("--")) fail("MISSING_ARGUMENT_VALUE");
      values.set(name, value);
    }
  }
  if (flags.has("describe") && (flags.size !== 1 || values.size)) fail("DESCRIBE_MUST_BE_OFFLINE");
  return { values, flags };
}

function sourceIdentity(checkpoint: string) {
  if (!/^refs\/checkpoints\/[A-Za-z0-9_./-]+$/.test(checkpoint) || checkpoint.includes("..")) fail("INVALID_CHECKPOINT");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const commit = git("rev-parse", "--verify", `${checkpoint}^{commit}`);
    const tree = git("rev-parse", `${checkpoint}^{tree}`);
    const files = SOURCE_FILES.map((file) => {
      const workingBlob = git("hash-object", `--path=${file}`, file);
      const frozenBlob = git("rev-parse", "--verify", `${checkpoint}:${file}`);
      if (workingBlob !== frozenBlob) fail("SOURCE_DIFFERS_FROM_CHECKPOINT");
      return { file, blob: frozenBlob };
    });
    return { checkpoint, commit, tree, files, coverage: "listed execution files only; full candidate gates are separately required" };
  } catch (error) {
    if (error instanceof SafetyStop) throw error;
    fail("CHECKPOINT_NOT_READY");
  }
}

function outputLocation(raw: string | undefined, runId: string) {
  const root = realpathSync(resolve("artifacts/beta-execution"));
  const dest = resolve(raw ?? `artifacts/beta-execution/copilot-hub-${runId}`);
  const inside = (path: string) => {
    const rel = relative(root, path);
    return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
  };
  if (!inside(dest) || existsSync(dest)) fail("OUTPUT_MUST_BE_NEW_BETA_EVIDENCE_DIRECTORY");
  let ancestor = dirname(dest);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (realpathSync(ancestor) !== root && !inside(realpathSync(ancestor))) fail("OUTPUT_ESCAPE_REFUSED");
  mkdirSync(dest, { recursive: true });
  return resolve(dest, "benchmark.json");
}

async function main() {
  const { values: args, flags } = readArgs();
  const frozen = definition();
  if (flags.has("describe")) {
    console.log(JSON.stringify({ mode: "offline_definition", ...frozen, calls: 0 }));
    return;
  }
  const required = (name: string) => args.get(name) ?? fail("MISSING_REQUIRED_ARGUMENT");
  const workspaceId = required("workspace");
  const actorId = required("actor");
  const connectionId = required("connection");
  const modelId = required("model");
  const expectedDatabase = required("database");
  const checkpoint = required("checkpoint");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(workspaceId) || !uuid.test(connectionId) || !/^[A-Za-z0-9_-]{1,120}$/.test(actorId)) fail("INVALID_PUBLIC_IDENTIFIER");
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(modelId)) fail("INVALID_MODEL_IDENTIFIER");
  if (!/^flowline_[a-z0-9_]{1,55}$/.test(expectedDatabase) || /^flowline_test(?:_|$)/.test(expectedDatabase) || expectedDatabase === "flowline_staging") fail("DEDICATED_STAGING_DATABASE_REQUIRED");
  const runs = Number(args.get("runs") ?? "1");
  if (runs !== 1 && runs !== 2) fail("RUNS_MUST_BE_ONE_OR_TWO");
  const maxGenerations = Number(args.get("max-generations") ?? "0");
  if (flags.has("execute") && (!Number.isInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 72)) fail("EXPLICIT_GENERATION_CAP_REQUIRED");
  if (process.env.FLOWLINE_ENV !== "staging") fail("LOCAL_STAGING_ONLY");
  if (process.env.FLOWLINE_AI_TEST_OVERRIDE || process.env.FLOWLINE_PROVIDER_OVERRIDE) fail("TEST_DOUBLE_OVERRIDE_REFUSED");
  // Compare the DB target in memory. Never print its URL, username, password or other secret configuration.
  let databaseUrl: URL;
  try { databaseUrl = new URL(process.env.DATABASE_URL ?? ""); } catch { fail("DATABASE_CONFIGURATION_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) fail("LOCAL_DATABASE_ONLY");
  if (decodeURIComponent(databaseUrl.pathname.slice(1)) !== expectedDatabase) fail("DATABASE_TARGET_MISMATCH");
  const source = sourceIdentity(checkpoint);
  const runId = `${new Date().toISOString().replace(/[^0-9TZ]/g, "")}-${randomUUID()}`;
  const output = outputLocation(args.get("out"), runId);
  const { db, schema, pool } = await import("@/db");
  try {
    const { requireWorkspace } = await import("@/server/access");
    const { getAiProvider } = await import("@/ai/provider");
    const { resolveRoute, planRoutes } = await import("@/ai/hub/routing");
    const { isVerifiedZeroPrice } = await import("@/ai/hub/pricing");
    const { getProviderDef } = await import("@/ai/hub/registry");
    const { COPILOT_PROMPT_VERSION, generatePatch } = await import("@/server/copilot");
    const [actor] = await db.select({ id: schema.user.id, email: schema.user.email, name: schema.user.name, emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, actorId));
    if (!actor?.emailVerified) fail("VERIFIED_OWNER_ACTOR_REQUIRED");
    const ref = { connectionId, modelId };
    const workspace = async () => {
      const { workspace: ws } = await requireWorkspace(actor, workspaceId, "owner");
      if (ws.currency !== "USD" || ws.monthlyBudgetMicros !== 0) fail("ZERO_USD_BUDGET_REQUIRED");
      if (ws.aiPolicy?.mode !== "FREE_ONLY" || ws.aiPolicy.allowUnknownCost !== false) fail("STRICT_FREE_ONLY_REQUIRED");
      if (ws.aiPolicy.fallbackRoutes?.length || ws.aiPolicy.lowCostPool?.length) fail("ALTERNATIVE_ROUTES_REFUSED");
      const route = await resolveRoute(db, ws, { pin: ref, pinSource: "copilot" });
      if (route.pricing?.source !== "catalogue" || !isVerifiedZeroPrice(route.pricing as PriceSnapshot)) fail("VERIFIED_ZERO_CATALOGUE_PRICE_REQUIRED");
      const def = getProviderDef(route.provider);
      if (!def || def.transport !== "https") fail("CLOUD_HTTPS_ROUTE_REQUIRED");
      const planned = await planRoutes(db, ws, route, { system: "Preflight", messages: [{ role: "user", content: "Synthetic evaluation." }], maxTokens: 1500 });
      if (planned.plan.length !== 1 || planned.plan[0].route.connectionId !== connectionId || planned.plan[0].route.modelId !== modelId) fail("PINNED_SINGLE_ROUTE_REQUIRED");
      return { ws, route, routeKind: def.routeKind };
    };
    const first = await workspace();
    const baseRecord = {
      runId, at: new Date().toISOString(), source, definition: frozen,
      scope: { workspaceId, actorId, database: expectedDatabase, provider: first.route.provider, connectionId, modelId, routeKind: first.routeKind },
      safeguards: { budgetMicros: 0, currency: "USD", policy: "FREE_ONLY", allowUnknownCost: false, alternatives: 0, externalActions: "STATIC_ONLY", liveProduction: false },
      limits: { runs, maxGenerations: flags.has("execute") ? maxGenerations : 0, maximumHttpAttempts: flags.has("execute") ? maxGenerations * 3 : 0 },
      promptVersion: COPILOT_PROMPT_VERSION,
    };
    if (!flags.has("execute")) {
      writeFileSync(output, JSON.stringify({ ...baseRecord, mode: "preflight", calls: 0, verdict: "NOT_RUN" }, null, 2), { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ mode: "preflight", calls: 0, verdict: "NOT_RUN", output }));
      return;
    }
    let generations = 0;
    let stopCode: string | undefined;
    let reportedCostMicros: number | null = 0;
    const results: CaseResult[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    const startedAll = Date.now();
    const provider: AiProvider = {
      id: first.route.provider, model: modelId, available: true,
      async generate(req: AiRequest) {
        if (generations >= maxGenerations || stopCode) { stopCode ??= "GENERATION_CAP_REACHED"; fail(stopCode); }
        try {
          const { ws } = await workspace();
          const current = await getAiProvider(db, ws, actorId, { requestId: `benchmark:${runId}:${generations + 1}`, pin: ref, pinSource: "copilot" });
          if (!current.available) fail(safeCode(current.code));
          generations++;
          inferenceStarted = true;
          const response = await current.generate(req);
          reportedCostMicros = response.costMicros == null || reportedCostMicros == null ? null : reportedCostMicros + response.costMicros;
          if (response.costMicros !== 0 || response.routing.connectionId !== connectionId || response.routing.fallbackFrom.length) fail("COST_OR_ROUTE_SAFETY_STOP");
          return response;
        } catch (error) {
          // Fail fast on transport/quota/policy errors. Keep only a stable code, never provider text or raw responses.
          stopCode = error instanceof SafetyStop ? error.code : safeCode((error as { code?: unknown })?.code);
          throw new SafetyStop(stopCode);
        }
      },
    };
    for (const c of CASES) {
      for (let r = 0; r < runs; r++) {
        if (stopCode) break;
        const started = Date.now();
        // Clone the base: preview sample injection must never modify frozen fixtures or a later stability run.
        const caseBase = structuredClone(c.base);
        const g = await generatePatch(provider, c.request, caseBase, []);
        inputTokens += g.usage.inputTokens;
        outputTokens += g.usage.outputTokens;
        const applied = g.patch ? applyPatch(caseBase, g.patch, []) : null;
        const issues = [...g.issues, ...(applied?.issues ?? [])];
        const errors = issues.filter((i) => i.severity === "error");
        const score: Score = {};
        if (c.refusal) {
          score.safeRefusal = issues.some((i) => i.code === "UNKNOWN_INTEGRATION");
        } else {
          const graph = applied?.graph ?? EMPTY;
          score.structure = Boolean(g.patch) && errors.length === 0;
          score.nodeSelection = Boolean(c.select?.(graph));
          score.order = Boolean(c.order?.(graph));
          score.params = Boolean(c.params?.(graph));
          if (c.result) {
            let ok = false;
            if (score.structure) {
              if (c.sample !== undefined) {
                const trig = graph.nodes.find(isTrigger);
                if (trig) (trig.data.config as unknown as Record<string, unknown>).samplePayload = JSON.stringify(c.sample);
              }
              const pv = await previewGraph(graph);
              ok = pv.preview.ran && pv.preview.status === "succeeded" && c.result((pv.preview.output ?? {}) as Record<string, unknown>);
            }
            score.result = ok;
          } else score.result = Boolean(score.structure && c.staticResult?.(graph));
          score.safeRefusal = !issues.some((i) => i.code === "UNKNOWN_INTEGRATION");
        }
        const ok = Object.values(score).every((v) => v === true);
        results.push({ case: c.id, category: c.category, run: r + 1, correct: stopCode ? null : ok, score, resultCheck: c.result ? "dry-run" : c.refusal ? "refusal" : "static", generations: g.attempts, ms: Date.now() - started, errorCodes: errors.map((e) => safeCode(e.code)).slice(0, 4), warningCodes: issues.filter((i) => i.severity === "warning").map((i) => safeCode(i.code)), ...(stopCode ? { blockedCode: stopCode } : {}) });
        // Persist after each case; no generated prompts, patches, graph data, raw provider text or secrets.
        const complete = results.filter((r) => r.correct != null);
        const byRun = Array.from({ length: runs }, (_, i) => ({ run: i + 1, correct: complete.filter((r) => r.run === i + 1 && r.correct).length, total: complete.filter((r) => r.run === i + 1).length }));
        const dims = ["structure", "nodeSelection", "order", "params", "result", "safeRefusal"];
        const perDimension = Object.fromEntries(dims.map((d) => [d, { correct: complete.filter((r) => r.score[d] === true).length, total: complete.filter((r) => r.score[d] !== undefined).length }]));
        const completeRun = !stopCode && byRun.every((r) => r.total === 12);
        const verdict = stopCode ? "BLOCKED" : completeRun ? byRun.every((r) => r.correct >= 10) ? "EN_TARGET_PASS_AR_NOT_RUN" : "EN_TARGET_FAIL" : "IN_PROGRESS";
        writeFileSync(output, JSON.stringify({ ...baseRecord, mode: "execute", results, summary: { generations, byRun, perDimension, tokens: { input: inputTokens, output: outputTokens }, observedCostMicros: reportedCostMicros, wallMs: Date.now() - startedAll, target: ">=10/12 on every complete run", verdict, ...(stopCode ? { blockedCode: stopCode } : {}) } }, null, 2), { mode: 0o600 });
        console.log(JSON.stringify({ case: c.id, run: r + 1, correct: stopCode ? null : ok, generations, verdict }));
      }
      if (stopCode) break;
    }
    const perRun = Array.from({ length: runs }, (_, i) => results.filter((r) => r.run === i + 1 && r.correct === true).length);
    console.log(JSON.stringify({ output, generations, verdict: stopCode ? "BLOCKED" : perRun.every((n) => n >= 10) ? "EN_TARGET_PASS_AR_NOT_RUN" : "EN_TARGET_FAIL", arabic: "NOT_RUN" }));
    if (stopCode || perRun.some((n) => n < 10)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  // No arbitrary exception messages, stacks, URLs, keys, emails or raw responses in evidence.
  console.error(JSON.stringify({ verdict: "BLOCKED", code: error instanceof SafetyStop ? error.code : "BENCHMARK_ERROR", callsMayHaveOccurred: inferenceStarted }));
  process.exitCode = 1;
});
