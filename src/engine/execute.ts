import { evaluateExpression, ExpressionError, normalizeValue } from "./expression";
import { descendants, topoOrder, validateGraph } from "./validate";
import type { FlowGraph, FlowNode, StepResult } from "./types";

export interface ReusedStep {
  input: unknown;
  output: unknown;
}

export interface ExecuteOptions {
  /** Re-run from this node: upstream steps reuse `reused` values instead of re-executing. */
  fromNodeId?: string;
  reused?: Map<string, ReusedStep>;
  onStepStart?: (node: FlowNode, position: number) => Promise<void> | void;
  onStepDone?: (step: StepResult) => Promise<void> | void;
  /** Expression evaluator. The execution worker passes a thread-isolated one; default is in-process. */
  evaluate?: (source: string, input: unknown) => Promise<unknown>;
}

export interface ExecuteResult {
  status: "succeeded" | "failed";
  steps: StepResult[];
  output: Record<string, unknown>;
  error: { code: string; message: string; nodeId?: string } | null;
}

/** The value a step passes downstream. Conditions pass their input through. */
function forwardedValue(node: FlowNode, step: StepResult): unknown {
  return node.type === "logic.condition" ? step.input : step.output;
}

export async function executeGraph(graph: FlowGraph, runInput: unknown, opts: ExecuteOptions = {}): Promise<ExecuteResult> {
  const issues = validateGraph(graph);
  if (issues.length > 0) {
    return {
      status: "failed",
      steps: [],
      output: {},
      error: { code: "INVALID_FLOW", message: issues.map((i) => i.message).join("; ") },
    };
  }

  const order = topoOrder(graph);
  const rerunSet = opts.fromNodeId ? descendants(graph, opts.fromNodeId) : null;
  const results = new Map<string, StepResult>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  // Null-prototype map: an output key like "__proto__" is stored as data, never as a prototype.
  const output: Record<string, unknown> = Object.create(null);
  const evaluate = opts.evaluate ?? evaluateExpression;
  let firstError: ExecuteResult["error"] = null;

  for (const [position, node] of order.entries()) {
    const base = { nodeId: node.id, nodeType: node.type, nodeLabel: node.data.label, position };
    const incoming = graph.edges.find((e) => e.target === node.id);
    let input: unknown = runInput;

    if (incoming) {
      const parentNode = nodeById.get(incoming.source)!;
      const parent = results.get(incoming.source)!;
      if (parent.status === "failed" || parent.status === "skipped") {
        const step: StepResult = { ...base, status: "skipped", skipReason: `Upstream step "${parent.nodeLabel}" ${parent.status === "failed" ? "failed" : "was skipped"}` };
        results.set(node.id, step);
        await opts.onStepDone?.(step);
        continue;
      }
      if (parentNode.type === "logic.condition") {
        const branch = (parent.output as { branch?: string } | null)?.branch;
        const handle = incoming.sourceHandle ?? "true";
        if (branch !== handle) {
          const step: StepResult = { ...base, status: "skipped", skipReason: `Condition "${parent.nodeLabel}" took the ${branch} branch` };
          results.set(node.id, step);
          await opts.onStepDone?.(step);
          continue;
        }
      }
      input = forwardedValue(parentNode, parent);
    }

    // Re-run: steps upstream of the chosen node keep their previous values.
    if (rerunSet && !rerunSet.has(node.id)) {
      const prev = opts.reused?.get(node.id);
      if (prev) {
        const step: StepResult = { ...base, status: "reused", input: prev.input, output: prev.output };
        results.set(node.id, step);
        if (node.type === "output") output[(node.data.config as { key: string }).key] = prev.output;
        await opts.onStepDone?.(step);
        continue;
      }
    }

    await opts.onStepStart?.(node, position);
    const startedAt = new Date();
    const t0 = performance.now();
    let step: StepResult;
    try {
      const value = await runNode(node, input, evaluate);
      step = { ...base, status: "succeeded", input, output: value };
      if (node.type === "output") output[(node.data.config as { key: string }).key] = value;
    } catch (err) {
      const e = err instanceof ExpressionError ? { code: err.code, message: err.message } : { code: "NODE_ERROR", message: err instanceof Error ? err.message : String(err) };
      step = { ...base, status: "failed", input, error: e };
      firstError ??= { ...e, nodeId: node.id };
    }
    step.startedAt = startedAt;
    step.finishedAt = new Date();
    step.durationMs = Math.max(0, Math.round(performance.now() - t0));
    results.set(node.id, step);
    await opts.onStepDone?.(step);
  }

  const steps = order.map((n) => results.get(n.id)!);
  return { status: firstError ? "failed" : "succeeded", steps, output: { ...output }, error: firstError };
}

async function runNode(node: FlowNode, input: unknown, evaluate: (source: string, input: unknown) => Promise<unknown>): Promise<unknown> {
  const cfg = node.data.config as unknown as Record<string, string>;
  switch (node.type) {
    case "trigger.manual":
      return normalizeValue(input);
    case "transform.json":
      return evaluate(cfg.expression, input);
    case "logic.condition": {
      const result = await evaluate(cfg.expression, input);
      const passed = Boolean(result) && !(Array.isArray(result) && result.length === 0);
      return { result, branch: passed ? "true" : "false" };
    }
    case "output":
      return cfg.expression?.trim() ? evaluate(cfg.expression, input) : normalizeValue(input);
    default:
      throw new Error(`Unsupported node type ${node.type}`);
  }
}

/** Parse the trigger's sample payload into the run input. */
export function sampleInputFor(graph: FlowGraph): unknown {
  const trigger = graph.nodes.find((n) => n.type === "trigger.manual");
  const text = (trigger?.data.config as { samplePayload?: string } | undefined)?.samplePayload ?? "";
  if (!text.trim()) return {};
  return JSON.parse(text);
}
