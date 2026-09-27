import { checkExpressionSyntax } from "./expression";
import { getNodeDefinition } from "./nodes";
import type { FlowEdge, FlowGraph, FlowNode, ValidationIssue } from "./types";

export const MAX_NODES = 100;
export const MAX_EDGES = 200;

export interface ConnectionCandidate {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Checks a proposed edge against the current graph. Used by the canvas
 * (isValidConnection) and by full-graph validation, so the rules match.
 */
export function checkConnection(graph: Pick<FlowGraph, "nodes" | "edges">, c: ConnectionCandidate, ignoreEdgeId?: string): string | null {
  if (c.source === c.target) return "A node can't connect to itself";
  const source = graph.nodes.find((n) => n.id === c.source);
  const target = graph.nodes.find((n) => n.id === c.target);
  if (!source || !target) return "Both ends must be nodes on the canvas";
  const sDef = getNodeDefinition(source.type);
  const tDef = getNodeDefinition(target.type);
  if (!sDef || !tDef) return "Unknown node type";
  if (sDef.outputs.length === 0) return `${sDef.title} nodes have no outputs`;
  if (tDef.inputs === 0) return `${tDef.title} nodes can't receive input`;
  const handle = c.sourceHandle ?? sDef.outputs[0];
  if (!sDef.outputs.includes(handle)) return `Unknown output "${handle}"`;

  const edges = graph.edges.filter((e) => e.id !== ignoreEdgeId);
  if (edges.some((e) => e.target === c.target)) return `${target.data.label} already has an input`;
  if (edges.some((e) => e.source === c.source && (e.sourceHandle ?? sDef.outputs[0]) === handle && e.target === c.target)) {
    return "These nodes are already connected";
  }
  // Reject cycles: is `source` reachable from `target`?
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  const stack = [c.target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === c.source) return "That connection would create a loop";
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(adjacency.get(id) ?? []));
  }
  return null;
}

function validateConfig(node: FlowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cfg = node.data.config as unknown as Record<string, unknown>;
  const push = (code: string, message: string) => issues.push({ code, message: `${node.data.label}: ${message}`, nodeId: node.id });
  switch (node.type) {
    case "trigger.manual": {
      const text = typeof cfg.samplePayload === "string" ? cfg.samplePayload : "";
      if (text.trim() === "") break;
      try {
        JSON.parse(text);
      } catch {
        push("INVALID_JSON", "sample payload is not valid JSON");
      }
      break;
    }
    case "transform.json":
    case "logic.condition": {
      const expr = typeof cfg.expression === "string" ? cfg.expression : "";
      if (expr.trim() === "") {
        push("EMPTY_EXPRESSION", "expression is empty");
        break;
      }
      const err = checkExpressionSyntax(expr);
      if (err) push("INVALID_EXPRESSION", err);
      break;
    }
    case "output": {
      const key = typeof cfg.key === "string" ? cfg.key.trim() : "";
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) push("INVALID_OUTPUT_KEY", "output key must be letters, digits or _ (max 64)");
      const expr = typeof cfg.expression === "string" ? cfg.expression : "";
      if (expr.trim() !== "") {
        const err = checkExpressionSyntax(expr);
        if (err) push("INVALID_EXPRESSION", err);
      }
      break;
    }
  }
  return issues;
}

/** Structural + config validation. An empty result means the flow can run. */
export function validateGraph(graph: FlowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, edges } = graph;
  if (nodes.length === 0) return [{ code: "EMPTY_FLOW", message: "Add a trigger to start your flow" }];
  if (nodes.length > MAX_NODES) issues.push({ code: "TOO_MANY_NODES", message: `Flows are limited to ${MAX_NODES} nodes` });
  if (edges.length > MAX_EDGES) issues.push({ code: "TOO_MANY_EDGES", message: `Flows are limited to ${MAX_EDGES} connections` });

  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) issues.push({ code: "DUPLICATE_NODE_ID", message: `Duplicate node id ${n.id}`, nodeId: n.id });
    ids.add(n.id);
    if (!getNodeDefinition(n.type)) issues.push({ code: "UNKNOWN_NODE", message: `Unknown node type ${n.type}`, nodeId: n.id });
  }

  const triggers = nodes.filter((n) => n.type === "trigger.manual");
  if (triggers.length === 0) issues.push({ code: "NO_TRIGGER", message: "Add a trigger — every flow starts with one" });
  if (triggers.length > 1) issues.push({ code: "MULTIPLE_TRIGGERS", message: "Only one trigger per flow is supported" });
  if (!nodes.some((n) => n.type === "output")) issues.push({ code: "NO_OUTPUT", message: "Add an Output node so the run has a result" });

  // Re-check every edge with the same rules as the canvas.
  const accepted: FlowEdge[] = [];
  for (const e of edges) {
    const err = checkConnection({ nodes, edges: accepted }, e);
    if (err) issues.push({ code: "INVALID_EDGE", message: err, edgeId: e.id });
    else accepted.push(e);
  }

  for (const n of nodes) {
    const def = getNodeDefinition(n.type);
    if (!def) continue;
    if (def.inputs > 0 && !accepted.some((e) => e.target === n.id)) {
      issues.push({ code: "UNCONNECTED_INPUT", message: `${n.data.label} isn't connected to anything upstream`, nodeId: n.id });
    }
    issues.push(...validateConfig(n));
  }
  return issues;
}

/** Topological order (Kahn). Assumes an acyclic graph. */
export function topoOrder(graph: FlowGraph): FlowNode[] {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // Stable: seed in visual order (left→right, top→bottom).
  const sortPos = (a: FlowNode, b: FlowNode) => a.position.x - b.position.x || a.position.y - b.position.y;
  const queue = graph.nodes.filter((n) => indeg.get(n.id) === 0).sort(sortPos);
  const out: FlowNode[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    out.push(n);
    const next = graph.edges
      .filter((e) => e.source === n.id)
      .map((e) => byId.get(e.target)!)
      .filter(Boolean)
      .sort(sortPos);
    for (const t of next) {
      indeg.set(t.id, indeg.get(t.id)! - 1);
      if (indeg.get(t.id) === 0) queue.push(t);
    }
  }
  return out;
}

/** All nodes reachable downstream of `nodeId`, including itself. */
export function descendants(graph: FlowGraph, nodeId: string): Set<string> {
  const out = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const e of graph.edges) if (e.source === id) stack.push(e.target);
  }
  return out;
}
