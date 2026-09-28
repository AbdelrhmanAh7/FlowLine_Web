/**
 * Measures Copilot against a REAL model (no test double): the requests Codex used on staging (CX3Q-02/03), N times
 * each, recording valid/invalid and the issues. Run: node scripts/with-env.mjs .env npx tsx scripts/diag/copilot-real-model.mts [runs] [out.json]
 * Uses FLOWLINE_AI_PROVIDER / FLOWLINE_AI_MODEL / OLLAMA_BASE_URL from the env file. Touches no database.
 */
import { writeFileSync } from "node:fs";
import { getAiProvider } from "@/ai/provider";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import type { FlowGraph } from "@/engine/types";
import { applyPatch, generatePatch } from "@/server/copilot";

const runs = Number(process.argv[2] ?? 3);
const out = process.argv[3];
const empty: FlowGraph = { nodes: [], edges: [] };
const existing = LOCAL_TEMPLATES.find((t) => t.id === "lead-qualifier")!.graph;
const CASES = [
  { name: "new: order totals", base: empty, text: "Create a workflow that starts manually with a list of order items (qty, price) and outputs the order total." },
  { name: "edit: add JSON transform", base: existing, text: "Add a JSON transform step after the last step that adds a field processedAt with the current time." },
  { name: "edit: add condition", base: existing, text: "Only continue when the lead has an email address." },
  { name: "unavailable: Salesforce", expect: "refused", base: empty, text: "When a form is submitted via webhook, create a lead in Salesforce." },
];
// Held-out requests (not used while tuning the prompt/repairs) — measure generalisation separately.
const HELD_OUT = [
  { name: "held-out: AI triage", base: empty, text: "When a support email arrives by webhook, use AI to classify its urgency as low, normal or high and output the category." },
  { name: "held-out: schedule + Postgres", base: empty, text: "Every Monday at 9am, query our PostgreSQL database for last week's signups and output the count." },
  { name: "held-out: remove output", base: existing, text: "Remove the nurture output." },
  { name: "held-out: rename step", base: existing, text: "Rename the Normalise lead step to Clean lead." },
  { name: "held-out: Slack on hot branch", base: existing, text: "When the lead is hot, also post a message to Slack channel #sales." },
  { name: "held-out: webhook validate", base: empty, text: "Receive a webhook with an email field, check that the email contains an @, and output whether it is valid." },
];
if (process.argv.includes("--held-out")) CASES.splice(0, CASES.length, ...HELD_OUT);
const provider = getAiProvider();
const results: unknown[] = [];
let valid = 0;
let total = 0;
for (const c of CASES) {
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    const g = await generatePatch(provider, c.text, c.base, []);
    const applied = g.patch ? applyPatch(c.base, g.patch, []) : null;
    const issues = [...g.issues, ...(applied?.issues ?? [])];
    // Correct outcome: a valid proposal, or — for a request that needs an unavailable app — an honest refusal.
    const ok = (c as { expect?: string }).expect === "refused" ? issues.some((x) => x.code === "UNKNOWN_INTEGRATION") : Boolean(g.patch) && !issues.some((x) => x.severity === "error");
    total++;
    if (ok) valid++;
    results.push({ case: c.name, run: i + 1, ok, ms: Date.now() - t, errors: issues.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`), warnings: issues.filter((x) => x.severity === "warning").map((x) => x.code), added: applied?.diff.added.map((a) => a.type) });
    console.log(`${ok ? "CORRECT" : "WRONG  "} ${c.name} #${i + 1} ${Date.now() - t}ms ${issues.filter((x) => x.severity === "error").map((x) => x.message).join(" | ").slice(0, 200)}`);
  }
}
console.log(`correct ${valid}/${total} (${provider.id}/${provider.model})`);
if (out) writeFileSync(out, JSON.stringify({ provider: provider.id, model: provider.model, at: new Date().toISOString(), valid, total, results }, null, 2));
process.exit(0);
