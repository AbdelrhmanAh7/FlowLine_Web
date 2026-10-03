/** Frozen 12-case Copilot evaluation. Credentials are read only by the workspace AI hub. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { CASES } from "./diag/copilot-benchmark-hub.mjs";
import { scoreCase, summarizeScores, type BenchmarkScores } from "./copilot-benchmark-score";
import { frame, parseJson } from "@/ai/provider";
import { executeAi } from "@/ai/hub/execute";
import { maxCostMicros, requestInputChars, type PriceSnapshot } from "@/ai/hub/pricing";
import { resolveRoute } from "@/ai/hub/routing";
import { db, pool, schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { requireWorkspace } from "@/server/access";
import { copilotInstructions, COPILOT_PROMPT_VERSION } from "@/server/copilot";
import { applyPatch, catalogFor, graphSummary, PATCH_JSON_SCHEMA, patchSchema, previewGraph } from "@/server/copilot-patch";

type Options = { workspace: string; actor: string; connection: string; provider: string; model: string; maxUsd: number; allowUnknownCost: boolean; out?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function parseOptions(argv: string[]): Options {
  const values = new Map<string, string>();
  let allowUnknownCost = false;
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === "--allow-unknown-cost") { if (allowUnknownCost) throw Error("DUPLICATE_FLAG"); allowUnknownCost = true; continue; }
    if (!name?.startsWith("--") || !["workspace", "actor", "connection", "provider", "model", "max-usd", "out"].includes(name.slice(2)) || values.has(name.slice(2))) throw Error("INVALID_ARGUMENT");
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw Error("MISSING_VALUE");
    values.set(name.slice(2), value);
  }
  const required = (key: string) => values.get(key) ?? (() => { throw Error(`MISSING_${key.toUpperCase().replaceAll("-", "_")}`); })();
  const maxUsdText = required("max-usd");
  const maxUsd = Number(maxUsdText);
  if (!/^\d+(?:\.\d{1,6})?$/.test(maxUsdText) || !Number.isSafeInteger(maxUsd * 1_000_000)) throw Error("INVALID_MAX_USD");
  const options = { workspace: required("workspace"), actor: required("actor"), connection: required("connection"), provider: required("provider"), model: required("model"), maxUsd, allowUnknownCost, out: values.get("out") };
  if (!uuid.test(options.workspace) || !uuid.test(options.connection) || !/^[A-Za-z0-9_-]{1,120}$/.test(options.actor) || !/^[a-z0-9-]{2,60}$/.test(options.provider) || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(options.model)) throw Error("INVALID_IDENTIFIER");
  if (options.out && !/^artifacts[\\/]copilot-benchmark[\\/][A-Za-z0-9T_-]+$/.test(options.out)) throw Error("INVALID_OUTPUT_PATH");
  return options;
}

async function frozenIdentity() {
  const old = (await readFile("scripts/diag/copilot-benchmark.mts", "utf8")).replace(/\r\n/g, "\n");
  const hub = (await readFile("scripts/diag/copilot-benchmark-hub.mts", "utf8")).replace(/\r\n/g, "\n");
  const slice = (source: string, end: string) => source.slice(source.indexOf("const EMPTY: FlowGraph"), source.indexOf(end));
  const source = slice(old, "const provider = getAiProvider();");
  if (source !== slice(hub, "type Score =") || CASES.length !== 12) throw Error("FROZEN_CASES_CHANGED");
  return sha(source);
}

export async function runBenchmark(options: Options) {
  const frozenSha256 = await frozenIdentity();
  // Local test override is valid only in FLOWLINE_ENV=test; it never permits a public URL.
  const override = process.env.FLOWLINE_AI_TEST_OVERRIDE;
  const testDouble = process.env.FLOWLINE_ENV === "test" && Boolean(override && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(override));
  if (override && !testDouble) throw Error("INVALID_TEST_OVERRIDE");
  const [actor] = await db.select({ id: schema.user.id, email: schema.user.email, name: schema.user.name, emailVerified: schema.user.emailVerified }).from(schema.user).where(eq(schema.user.id, options.actor));
  if (!actor?.emailVerified) throw Error("VERIFIED_ACTOR_REQUIRED");
  const { workspace } = await requireWorkspace(actor, options.workspace, "owner");
  if (workspace.currency !== "USD") throw Error("USD_WORKSPACE_REQUIRED");
  const ref = { connectionId: options.connection, modelId: options.model };
  const route = await resolveRoute(db, workspace, { pin: ref, pinSource: "copilot" });
  if (route.provider !== options.provider || route.connectionId !== options.connection || route.modelId !== options.model) throw Error("ROUTE_MISMATCH");
  if (route.unavailable) throw Error("MODEL_UNAVAILABLE");
  const conns: { id: string; provider: string; label: string; status: string }[] = [];
  const requests = CASES.filter((c) => !c.refusal).map((c) => {
    const instructions = copilotInstructions(c.request);
    const content = JSON.stringify({ catalog: catalogFor(conns), currentWorkflow: graphSummary(c.base) });
    const framed = frame({ instructions, content, schema: PATCH_JSON_SCHEMA });
    return { id: c.id, system: framed.system, user: framed.user };
  });
  const maximums = requests.map((r) => maxCostMicros(route.pricing as PriceSnapshot | null, requestInputChars({ system: r.system, messages: [{ role: "user", content: r.user }], maxTokens: 1500, schema: PATCH_JSON_SCHEMA }), 1500));
  const unknown = maximums.some((n) => n === null);
  // Unknown prices cannot be bounded in USD. Explicit opt-in is restricted to the local fake.
  if (unknown && (!options.allowUnknownCost || !testDouble)) throw Error("UNKNOWN_COST_REFUSED");
  const reservedMicros = maximums.reduce<number>((n, v) => n + (v ?? 0), 0);
  const capMicros = Math.round(options.maxUsd * 1_000_000);
  if (reservedMicros > capMicros) throw Error("AGGREGATE_BUDGET_EXCEEDED");
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const directory = resolve(options.out ?? `artifacts/copilot-benchmark/${runId}`);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  const rows: { case: string; category: string; correct: boolean; scores: BenchmarkScores; latencyMs: number; costMicros: number | null; inputTokens: number; outputTokens: number; errorCodes: string[]; check: string }[] = [];
  let spentMicros = 0;
  const started = Date.now();
  const writeReport = async () => {
    const summary = summarizeScores(rows);
    const verdict = rows.length < 12 ? "INCOMPLETE" : summary.targetMet ? "EN_TARGET_PASS_AR_NOT_RUN" : "EN_TARGET_FAIL";
    const report = { at: new Date().toISOString(), runId, frozenSha256, promptVersion: COPILOT_PROMPT_VERSION, scope: { workspaceId: options.workspace, connectionId: options.connection, provider: options.provider, model: options.model, testDouble }, safeguards: { maxUsd: options.maxUsd, maximumEstimatedMicros: unknown ? null : reservedMicros, unknownCostAllowed: unknown && options.allowUnknownCost, automaticRetries: 0, externalActions: "static only" }, summary: { ...summary, verdict, wallMs: Date.now() - started }, results: rows };
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2));
    const lines = [`# Copilot benchmark`, "", `Verdict: **${verdict}**`, `Correct: ${summary.correct}/${summary.total}; target: ≥10/12`, `Provider/model: ${options.provider}/${options.model}`, `Frozen cases SHA-256: ${frozenSha256}`, `Cost: ${summary.cost.totalMicros === null ? "unknown" : `$${(summary.cost.totalMicros / 1_000_000).toFixed(6)}`}; cap: $${options.maxUsd.toFixed(6)}`, `Latency: ${summary.latency.totalMs} ms`, "", "| Dimension | Passed | Applicable |", "|---|---:|---:|", ...Object.entries(summary.dimensions).map(([name, count]) => `| ${name} | ${count.passed} | ${count.applicable} |`), "", "| Case | Correct | Structure | Safe refusal | Latency ms | Cost µUSD |", "|---|---:|---:|---:|---:|---:|", ...rows.map((r) => `| ${r.case} | ${r.correct} | ${r.scores.structure ?? "n/a"} | ${r.scores.safeRefusal} | ${r.latencyMs} | ${r.costMicros ?? "unknown"} |`), "", "English frozen set only. Local fake results do not establish hosted-model quality."];
    await writeFile(resolve(directory, "report.md"), lines.join("\n") + "\n");
    return report;
  };
  try {
    for (const c of CASES) {
      const caseStart = Date.now();
      let costMicros: number | null = c.refusal ? 0 : null;
      let inputTokens = 0;
      let outputTokens = 0;
      const errorCodes: string[] = [];
      const scores: BenchmarkScores = { structure: null, nodeSelection: null, order: null, params: null, result: null, safeRefusal: false };
      try {
        if (c.refusal) {
          // Same server-side unsupported-integration refusal as Copilot; no provider call.
          const { unavailableAppsIn } = await import("@/server/copilot-apps");
          scores.safeRefusal = unavailableAppsIn(c.request).length > 0;
        } else {
          const request = requests.find((r) => r.id === c.id)!;
          const bound = maximums[requests.indexOf(request)]!;
          if (bound !== null && spentMicros + bound > capMicros) throw Error("AGGREGATE_BUDGET_EXCEEDED");
          const response = await executeAi(db, { workspace, actorUserId: actor.id, route, request: { system: request.system, messages: [{ role: "user", content: request.user }], maxTokens: 1500, schema: PATCH_JSON_SCHEMA, temperature: 0 }, purpose: "copilot", metering: "hub", requestId: `benchmark:${runId}:${c.id}`, signal: AbortSignal.timeout(120_000), maxAttempts: 1, policy: { mode: "MANUAL", allowUnknownCost: unknown && testDouble } });
          if (response.route.connectionId !== options.connection || response.route.modelId !== options.model || response.attempts !== 1) throw Error("ROUTE_OR_ATTEMPT_MISMATCH");
          costMicros = response.costMicros;
          if (costMicros !== null) spentMicros += costMicros;
          inputTokens = response.result.usage.inputTokens;
          outputTokens = response.result.usage.outputTokens;
          const parsed = patchSchema.safeParse(parseJson(response.result.text));
          if (!parsed.success) errorCodes.push("INVALID_PATCH");
          const base = structuredClone(c.base);
          const applied = parsed.success ? applyPatch(base, parsed.data, conns) : null;
          const errors = applied?.issues.filter((i) => i.severity === "error") ?? [];
          errorCodes.push(...errors.map((i) => i.code));
          const graph = applied?.graph ?? { nodes: [], edges: [] } satisfies FlowGraph;
          scores.structure = parsed.success && errors.length === 0;
          scores.nodeSelection = Boolean(c.select?.(graph));
          scores.order = Boolean(c.order?.(graph));
          scores.params = Boolean(c.params?.(graph));
          if (c.result) {
            if (scores.structure) {
              if (c.sample !== undefined) {
                const trigger = graph.nodes.find((n) => n.type.startsWith("trigger."));
                if (trigger) (trigger.data.config as unknown as Record<string, unknown>).samplePayload = JSON.stringify(c.sample);
              }
              const preview = await previewGraph(graph);
              scores.result = preview.preview.ran && preview.preview.status === "succeeded" && c.result((preview.preview.output ?? {}) as Record<string, unknown>);
            } else scores.result = false;
          } else scores.result = Boolean(scores.structure && c.staticResult?.(graph));
          scores.safeRefusal = true;
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? (error as Error).message;
        errorCodes.push(/^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : "BENCHMARK_ERROR");
      }
      rows.push({ case: c.id, category: c.category, correct: scoreCase(Boolean(c.refusal), scores), scores, latencyMs: Date.now() - caseStart, costMicros, inputTokens, outputTokens, errorCodes, check: c.result ? "dry-run" : c.refusal ? "refusal" : "static" });
      await writeReport();
      if (errorCodes.includes("AGGREGATE_BUDGET_EXCEEDED") || spentMicros > capMicros) break;
    }
  } finally { await writeReport(); }
  return { directory, report: await writeReport() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (async () => {
    try {
      const { directory, report } = await runBenchmark(parseOptions(process.argv.slice(2)));
      console.log(JSON.stringify({ directory, verdict: report.summary.verdict, correct: report.summary.correct, total: report.summary.total }));
      if (report.summary.verdict !== "EN_TARGET_PASS_AR_NOT_RUN") process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ code: /^[A-Z][A-Z0-9_]*$/.test((error as Error).message) ? (error as Error).message : "BENCHMARK_ERROR" }));
      process.exitCode = 1;
    } finally { await pool.end(); }
  })();
}
