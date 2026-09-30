/**
 * Copilot benchmark (P4-02): 12 FIXED held-out requests, scored separately on
 *   structure (valid patch, no errors) · node selection · graph order · parameter mapping · requested result · safe refusal.
 * "Requested result": local graphs are dry-run with the engine and their output is checked; graphs with external steps get a
 * static check of the configured mapping (labelled "static" — nothing external is called).
 * A case is CORRECT only if every applicable dimension passes ("ran without errors" is never enough).
 *
 * Provider/model come from the environment through the normal provider abstraction (FLOWLINE_AI_PROVIDER / _MODEL,
 * ANTHROPIC_API_KEY or OLLAMA_BASE_URL) — nothing is hard-coded. Touches no database.
 *   node scripts/with-env.mjs .env npx tsx scripts/diag/copilot-benchmark.mts [--runs 1] [--out artifacts/phase-4/copilot-benchmark]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getAiProvider } from "@/ai/provider";
import type { FlowGraph, FlowNode } from "@/engine/types";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { applyPatch, previewGraph } from "@/server/copilot-patch";
import { COPILOT_PROMPT_VERSION, generatePatch } from "@/server/copilot";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const RUNS = Number(arg("runs", "1"));
const OUT = arg("out", "artifacts/phase-4/copilot-benchmark")!;
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

const provider = getAiProvider();
const results: Record<string, unknown>[] = [];
let correct = 0;
let total = 0;
let inTok = 0;
let outTok = 0;
const t0 = Date.now();
for (const c of CASES) {
  for (let r = 0; r < RUNS; r++) {
    const started = Date.now();
    const g = await generatePatch(provider, c.request, c.base, []);
    inTok += g.usage.inputTokens;
    outTok += g.usage.outputTokens;
    const applied = g.patch ? applyPatch(c.base, g.patch, []) : null;
    const issues = [...g.issues, ...(applied?.issues ?? [])];
    const errors = issues.filter((i) => i.severity === "error");
    const score: Record<string, boolean | "n/a" | "static"> = {};
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
            if (trig) (trig.data.config as Record<string, unknown>).samplePayload = JSON.stringify(c.sample);
          }
          const pv = await previewGraph(graph);
          ok = pv.preview.ran && pv.preview.status === "succeeded" && c.result((pv.preview.output ?? {}) as Record<string, unknown>);
        }
        score.result = ok;
      } else score.result = Boolean(score.structure && c.staticResult?.(graph));
      score.safeRefusal = !issues.some((i) => i.code === "UNKNOWN_INTEGRATION"); // didn't refuse a supported request
    }
    const ok = Object.values(score).every((v) => v === true);
    total++;
    if (ok) correct++;
    results.push({ case: c.id, category: c.category, run: r + 1, correct: ok, score, resultCheck: c.result ? "dry-run" : c.refusal ? "refusal" : "static", attempts: g.attempts, ms: Date.now() - started, errors: errors.map((e) => `${e.code}: ${e.message}`).slice(0, 4), warnings: issues.filter((i) => i.severity === "warning").map((i) => i.code) });
    console.log(`${ok ? "CORRECT" : "WRONG  "} ${c.id.padEnd(10)} ${JSON.stringify(score)} ${Date.now() - started}ms`);
  }
}
const dims = ["structure", "nodeSelection", "order", "params", "result", "safeRefusal"];
const perDim = Object.fromEntries(dims.map((d) => [d, results.filter((r) => (r.score as Record<string, unknown>)[d] !== undefined).reduce((a, r) => a + ((r.score as Record<string, unknown>)[d] === true ? 1 : 0), 0) + "/" + results.filter((r) => (r.score as Record<string, unknown>)[d] !== undefined).length]));
const summary = { provider: provider.id, model: provider.model, promptVersion: COPILOT_PROMPT_VERSION, runs: RUNS, correct, total, perDimension: perDim, tokens: { input: inTok, output: outTok }, wallMs: Date.now() - t0, avgMsPerCase: Math.round((Date.now() - t0) / total), at: new Date().toISOString(), target: "≥10/12 correct-or-safe-refusal" };
console.log(JSON.stringify(summary));
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/benchmark-${provider.id}-${(provider.model || "default").replace(/[^a-z0-9.-]+/gi, "_")}-${Date.now()}.json`, JSON.stringify({ summary, results }, null, 2));
process.exit(0);
