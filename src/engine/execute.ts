import Papa from "papaparse";
import { evaluateExpression, ExpressionError, normalizeValue, VALUE_MAX_BYTES } from "./expression";
import { getNodeDefinition } from "./nodes";
import { descendants, topoOrder, validateGraph } from "./validate";
import { TRIGGER_TYPES, type FlowGraph, type FlowNode, type StepResult } from "./types";

export type Evaluate = (source: string, input: unknown, bindings?: Record<string, unknown>) => Promise<unknown>;

export interface ReusedStep {
  input: unknown;
  output: unknown;
}

/** A step already finished in THIS run (resume after approval / worker restart). */
export interface PriorStep {
  status: StepResult["status"];
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string } | null;
  skipReason?: string | null;
}

export interface NodeEnv {
  /** Evaluate JSONata with `$steps` bound to upstream outputs. */
  evaluate: (source: string, input: unknown) => Promise<unknown>;
  steps: Record<string, unknown>;
  signal: AbortSignal;
  log: (message: string) => void;
}

export type NodeOutcome =
  | { kind: "ok"; output: unknown; meta?: Record<string, unknown>; attempts?: number }
  /** Execution must stop at this node until a human acts (approval, or review of an uncertain outcome). */
  | { kind: "pause"; status: "waiting_approval" | "uncertain"; meta?: Record<string, unknown>; attempts?: number; message: string };

/** Handler for nodes that need I/O (HTTP, AI, integrations, code, files, store, subflows). Provided by the worker. */
export type HostHandler = (node: FlowNode, input: unknown, env: NodeEnv) => Promise<NodeOutcome>;

/** Error with a stable code (thrown by handlers). */
export class NodeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ExecuteOptions {
  /** Steps already completed in this run — they are not executed again. */
  prior?: Map<string, PriorStep>;
  /** Re-run from this node: steps outside its descendants reuse `reused` values. */
  fromNodeId?: string;
  reused?: Map<string, ReusedStep>;
  evaluate?: Evaluate;
  handler?: HostHandler;
  onStepStart?: (node: FlowNode, position: number) => Promise<void> | void;
  onStepDone?: (step: StepResult) => Promise<void> | void;
  /** Polled between steps; when true, pending steps are cancelled. */
  isCancelled?: () => boolean;
  signal?: AbortSignal;
  /** Max nodes executing at once (parallel branches). */
  concurrency?: number;
}

export type RunOutcome = "succeeded" | "failed" | "waiting_approval" | "cancelled";

export interface ExecuteResult {
  status: RunOutcome;
  steps: StepResult[];
  output: Record<string, unknown>;
  error: { code: string; message: string; nodeId?: string } | null;
}

const PASSING = new Set(["succeeded", "reused"]);
const PAUSED = new Set(["waiting_approval", "uncertain"]);
const TERMINAL = new Set(["succeeded", "reused", "failed", "skipped", "cancelled"]);

/** The value a step passes downstream. Conditions pass their input through. */
function forwarded(node: FlowNode, step: Pick<StepResult, "input" | "output">): unknown {
  return node.type === "logic.condition" ? step.input : step.output;
}

/**
 * Flowline's OWN database failing mid-step (an outage, not the node's fault). Integrations wrap their providers'
 * errors (e.g. the PostgreSQL app → ProviderError), so an unwrapped driver/ORM error can only be the platform's.
 * Its text (SQL, driver internals) must never reach the user.
 */
function isPlatformDbError(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 4; depth++, e = (e as { cause?: unknown }).cause) {
    const x = e as { name?: unknown; message?: unknown; code?: unknown; severity?: unknown };
    if (x.name === "DrizzleQueryError") return true;
    if (typeof x.message === "string" && x.message.startsWith("Failed query:")) return true;
    if (typeof x.severity === "string" && typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code)) return true; // pg DatabaseError (SQLSTATE)
    if (typeof x.message === "string" && /^(Connection terminated|Client has encountered a connection error|timeout exceeded when trying to connect)/i.test(x.message)) return true;
  }
  return false;
}

export const PLATFORM_UNAVAILABLE_MESSAGE = "This step was interrupted because Flowline's database was unavailable. Nothing is wrong with the step itself.";

export function errorOf(err: unknown): { code: string; message: string } {
  if (err instanceof ExpressionError || err instanceof NodeError) return { code: err.code, message: err.message };
  if (isPlatformDbError(err)) return { code: "PLATFORM_UNAVAILABLE", message: PLATFORM_UNAVAILABLE_MESSAGE };
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e?.code === "string" && typeof e?.message === "string") return { code: e.code, message: e.message };
  return { code: "NODE_ERROR", message: err instanceof Error ? err.message : String(err) };
}

export async function executeGraph(graph: FlowGraph, runInput: unknown, opts: ExecuteOptions = {}): Promise<ExecuteResult> {
  const issues = validateGraph(graph);
  if (issues.length > 0) {
    return { status: "failed", steps: [], output: {}, error: { code: "INVALID_FLOW", message: issues.map((i) => i.message).join("; ") } };
  }
  const evaluate = opts.evaluate ?? evaluateExpression;
  const signal = opts.signal ?? new AbortController().signal;
  const order = topoOrder(graph);
  const position = new Map(order.map((n, i) => [n.id, i]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const incoming = new Map(graph.nodes.map((n) => [n.id, graph.edges.filter((e) => e.target === n.id)]));
  const rerunSet = opts.fromNodeId ? descendants(graph, opts.fromNodeId) : null;
  const results = new Map<string, StepResult>();
  const output: Record<string, unknown> = Object.create(null);
  let firstError: ExecuteResult["error"] = null;

  const base = (node: FlowNode) => ({ nodeId: node.id, nodeType: node.type, nodeLabel: node.data.label, position: position.get(node.id)! });
  const stepsBinding = () => {
    const out: Record<string, unknown> = {};
    for (const [id, r] of results) if (PASSING.has(r.status)) out[id] = forwarded(nodeById.get(id)!, r);
    return out;
  };

  const finish = async (step: StepResult) => {
    results.set(step.nodeId, step);
    if (step.status === "failed") firstError ??= { ...(step.error ?? { code: "NODE_ERROR", message: "failed" }), nodeId: step.nodeId };
    if (PASSING.has(step.status) && nodeById.get(step.nodeId)!.type === "output") {
      output[(nodeById.get(step.nodeId)!.data.config as { key: string }).key] = step.output;
    }
    await opts.onStepDone?.(step);
  };

  // Seed steps already finished in this run.
  for (const [id, p] of opts.prior ?? []) {
    const node = nodeById.get(id);
    if (!node || !TERMINAL.has(p.status)) continue;
    const step: StepResult = { ...base(node), status: p.status, input: p.input, output: p.output, error: p.error ?? undefined, skipReason: p.skipReason ?? undefined };
    results.set(id, step);
    if (p.status === "failed") firstError ??= { ...(p.error ?? { code: "NODE_ERROR", message: "failed" }), nodeId: id };
    if (PASSING.has(p.status) && node.type === "output") output[(node.data.config as { key: string }).key] = p.output;
  }

  /** Decides the input of a node from its parents, or why it is skipped. null = not ready yet. */
  const resolveInput = (node: FlowNode): { ready: false } | { ready: true; skip?: string; input?: unknown } => {
    const edges = incoming.get(node.id)!;
    if (TRIGGER_TYPES.includes(node.type) || edges.length === 0) return { ready: true, input: runInput };
    const parents = edges.map((e) => ({ edge: e, node: nodeById.get(e.source)!, r: results.get(e.source) }));
    if (parents.some((p) => !p.r || !TERMINAL.has(p.r.status))) return { ready: false };
    const passing: { label: string; value: unknown }[] = [];
    for (const p of parents) {
      const r = p.r!;
      if (r.status === "failed") return { ready: true, skip: `Upstream step "${r.nodeLabel}" failed` };
      if (!PASSING.has(r.status)) continue;
      if (p.node.type === "logic.condition") {
        const branch = (r.output as { branch?: string } | null)?.branch;
        if (branch !== (p.edge.sourceHandle ?? "true")) continue;
      }
      passing.push({ label: p.node.data.label, value: forwarded(p.node, r) });
    }
    if (passing.length === 0) {
      const p = parents[0]!;
      const r = p.r!;
      if (p.node.type === "logic.condition" && PASSING.has(r.status)) {
        return { ready: true, skip: `Condition "${r.nodeLabel}" took the ${(r.output as { branch?: string }).branch} branch` };
      }
      return { ready: true, skip: `Upstream step "${r.nodeLabel}" was ${r.status === "cancelled" ? "cancelled" : "skipped"}` };
    }
    if (node.type !== "data.merge") return { ready: true, input: passing[0]!.value };
    const mode = (node.data.config as { mode: string }).mode;
    if (mode === "array") return { ready: true, input: passing.map((p) => p.value) };
    if (mode === "first") return { ready: true, input: passing[0]!.value };
    const obj: Record<string, unknown> = {};
    for (const p of passing) obj[p.label] = p.value;
    return { ready: true, input: obj };
  };

  const runOne = async (node: FlowNode, input: unknown) => {
    await opts.onStepStart?.(node, position.get(node.id)!);
    const startedAt = new Date();
    const t0 = performance.now();
    const log: string[] = [];
    const bindings = stepsBinding();
    const env: NodeEnv = {
      evaluate: (src, inp) => evaluate(src, inp, { steps: bindings }),
      steps: bindings,
      signal,
      log: (m) => log.length < 50 && log.push(m.slice(0, 500)),
    };
    let step: StepResult;
    try {
      const res = await runBuiltin(node, input, env, opts.handler);
      if (res.kind === "pause") {
        step = { ...base(node), status: res.status, input, meta: res.meta, attempts: res.attempts, error: { code: res.status === "uncertain" ? "OUTCOME_UNKNOWN" : "APPROVAL_REQUIRED", message: res.message } };
      } else {
        step = { ...base(node), status: "succeeded", input, output: res.output, meta: res.meta, attempts: res.attempts };
      }
    } catch (err) {
      step = { ...base(node), status: signal.aborted ? "cancelled" : "failed", input, error: errorOf(err) };
    }
    step.log = log.length ? log : undefined;
    step.startedAt = startedAt;
    step.finishedAt = new Date();
    step.durationMs = Math.max(0, Math.round(performance.now() - t0));
    await finish(step);
  };

  const concurrency = Math.max(1, opts.concurrency ?? 4);
  for (;;) {
    const cancelled = opts.isCancelled?.() || signal.aborted;
    const ready: { node: FlowNode; input: unknown }[] = [];
    let progressed = false;
    for (const node of order) {
      if (results.has(node.id)) continue;
      const r = resolveInput(node);
      if (!r.ready) continue;
      if (cancelled) {
        await finish({ ...base(node), status: "cancelled", skipReason: "Run was cancelled" });
        progressed = true;
        continue;
      }
      if (r.skip) {
        await finish({ ...base(node), status: "skipped", skipReason: r.skip });
        progressed = true;
        continue;
      }
      // Re-run: steps upstream of the chosen node keep their previous values.
      if (rerunSet && !rerunSet.has(node.id)) {
        const prev = opts.reused?.get(node.id);
        if (prev) {
          await finish({ ...base(node), status: "reused", input: prev.input, output: prev.output });
          progressed = true;
          continue;
        }
      }
      ready.push({ node, input: r.input });
    }
    if (ready.length === 0) {
      if (progressed) continue;
      break;
    }
    // Run the ready wave with bounded parallelism.
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, ready.length) }, async () => {
        while (i < ready.length) {
          const item = ready[i++]!;
          if (opts.isCancelled?.() || signal.aborted) {
            await finish({ ...base(item.node), status: "cancelled", skipReason: "Run was cancelled" });
            continue;
          }
          await runOne(item.node, item.input);
        }
      }),
    );
  }

  const steps = order.map((n) => results.get(n.id) ?? { ...base(n), status: "skipped" as const, skipReason: "Not reached" });
  // Nodes blocked behind a paused step are not "skipped" — they will run after the human decision.
  const anyPaused = steps.some((s) => PAUSED.has(s.status));
  const anyCancelled = steps.some((s) => s.status === "cancelled");
  let status: RunOutcome = "succeeded";
  if (firstError) status = "failed";
  else if (anyCancelled) status = "cancelled";
  else if (anyPaused) status = "waiting_approval";
  return {
    status,
    steps: steps.filter((s) => results.has(s.nodeId) || !anyPaused),
    output: { ...output },
    error: firstError,
  };
}

async function runBuiltin(node: FlowNode, input: unknown, env: NodeEnv, handler?: HostHandler): Promise<NodeOutcome> {
  const cfg = node.data.config as unknown as Record<string, unknown>;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : "");
  const ok = (output: unknown): NodeOutcome => ({ kind: "ok", output });
  switch (node.type) {
    case "trigger.manual":
    case "trigger.webhook":
    case "trigger.schedule":
      return ok(normalizeValue(input));
    case "transform.json":
      return ok(await env.evaluate(s("expression"), input));
    case "logic.condition": {
      const result = await env.evaluate(s("expression"), input);
      const passed = Boolean(result) && !(Array.isArray(result) && result.length === 0);
      return ok({ result, branch: passed ? "true" : "false" });
    }
    case "output":
      return ok(s("expression").trim() ? await env.evaluate(s("expression"), input) : normalizeValue(input));
    case "data.filter": {
      // One evaluation: `$item.(<predicate>)` scopes the predicate to each item.
      const src = s("source").trim() || "$";
      const expr = `$filter((${src}), function($item){ $boolean($item.(${s("predicate")})) })`;
      const res = await env.evaluate(expr, input);
      return ok(res == null ? [] : Array.isArray(res) ? res : [res]);
    }
    case "data.map": {
      const fields = (cfg.fields as { key: string; expression: string }[]) ?? [];
      const expr = `{ ${fields.map((f) => `${JSON.stringify(f.key)}: (${f.expression})`).join(", ")} }`;
      return ok(await env.evaluate(expr, input));
    }
    case "data.merge":
      return ok(normalizeValue(input));
    case "data.csv": {
      const src = s("source").trim() || "$";
      const value = await env.evaluate(src, input);
      const delimiter = s("delimiter") || ",";
      if (cfg.mode === "parse") {
        if (typeof value !== "string") throw new NodeError("INVALID_INPUT", "CSV source must be text");
        if (value.length > VALUE_MAX_BYTES) throw new NodeError("VALUE_TOO_LARGE", "CSV text is larger than 256KB");
        const parsed = Papa.parse<Record<string, string>>(value, { header: true, skipEmptyLines: true, delimiter });
        if (parsed.data.length > 5000) throw new NodeError("TOO_MANY_ROWS", "CSV has more than 5,000 rows");
        return { kind: "ok", output: { rows: parsed.data, rowCount: parsed.data.length, fields: parsed.meta.fields ?? [] }, meta: parsed.errors.length ? { parseErrors: parsed.errors.slice(0, 5).map((e) => e.message) } : undefined };
      }
      if (!Array.isArray(value)) throw new NodeError("INVALID_INPUT", "CSV build needs an array of rows");
      return ok({ csv: normalizeValue(Papa.unparse(value as object[], { delimiter })) });
    }
    default: {
      const def = getNodeDefinition(node.type);
      if (!handler) throw new NodeError("NOT_AVAILABLE", `${def?.title ?? node.type} can't run in this runtime`);
      return handler(node, input, env);
    }
  }
}

/** Input for a manual/test run: the trigger's sample payload (schedule triggers get a synthetic fire event). */
export function sampleInputFor(graph: FlowGraph, now = new Date()): unknown {
  const trigger = graph.nodes.find((n) => TRIGGER_TYPES.includes(n.type));
  if (!trigger) return {};
  if (trigger.type === "trigger.schedule") {
    const c = trigger.data.config as { timezone?: string };
    return { fired_at: now.toISOString(), scheduled_for: now.toISOString(), timezone: c.timezone ?? "UTC", test: true };
  }
  const text = (trigger.data.config as { samplePayload?: string }).samplePayload ?? "";
  if (!text.trim()) return {};
  return JSON.parse(text);
}
