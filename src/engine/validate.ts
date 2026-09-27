import { CronExpressionParser } from "cron-parser";
import { checkExpressionSyntax } from "./expression";
import { getNodeDefinition } from "./nodes";
import { TRIGGER_TYPES, type FlowEdge, type FlowGraph, type FlowNode, type ValidationIssue } from "./types";

export const MAX_NODES = 100;
export const MAX_EDGES = 200;
export const MAX_MERGE_INPUTS = 8;
export const MAX_LOOP_ITEMS = 500;
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
  const incoming = edges.filter((e) => e.target === c.target);
  if (tDef.inputs === 1 && incoming.length > 0) return `${target.data.label} already has an input — add a Merge node to join branches`;
  if (tDef.inputs === "many" && incoming.length >= MAX_MERGE_INPUTS) return `${target.data.label} accepts at most ${MAX_MERGE_INPUTS} inputs`;
  if (incoming.some((e) => e.source === c.source)) return "These nodes are already connected";
  // Reject cycles: is `source` reachable from `target`?
  const adjacency = new Map<string, string[]>();
  for (const e of edges) adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  const stack = [c.target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === c.source) return "That connection would create a loop — use a Loop node for repetition";
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(adjacency.get(id) ?? []));
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function checkExpr(push: (c: string, m: string) => void, label: string, expr: string, { optional = false } = {}) {
  if (expr.trim() === "") {
    if (!optional) push("EMPTY_EXPRESSION", `${label} is empty`);
    return;
  }
  const err = checkExpressionSyntax(expr);
  if (err) push("INVALID_EXPRESSION", `${label}: ${err}`);
}

export function isValidTimezone(tz: string) {
  if (tz === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validates the cron for a schedule; returns an error message or null. */
export function checkCron(cron: string, timezone: string): string | null {
  if (!isValidTimezone(timezone)) return `Unknown time zone "${timezone}"`;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return "Use a 5-field cron expression (minute hour day month weekday)";
  try {
    const it = CronExpressionParser.parse(cron, { tz: timezone });
    const a = it.next().getTime();
    const b = it.next().getTime();
    if (b - a < 5 * 60_000) return "Schedules can run at most every 5 minutes";
  } catch (e) {
    return `Invalid cron: ${(e as Error).message}`;
  }
  return null;
}

function validateConfig(node: FlowNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cfg = node.data.config as unknown as Record<string, unknown>;
  const push = (code: string, message: string) => issues.push({ code, message: `${node.data.label}: ${message}`, nodeId: node.id });
  switch (node.type) {
    case "trigger.manual":
    case "trigger.webhook": {
      const text = str(cfg.samplePayload);
      if (text.trim() === "") break;
      try {
        JSON.parse(text);
      } catch {
        push("INVALID_JSON", "sample payload is not valid JSON");
      }
      break;
    }
    case "trigger.schedule": {
      const err = checkCron(str(cfg.cron), str(cfg.timezone) || "UTC");
      if (err) push("INVALID_SCHEDULE", err);
      if (!["skip", "run_once", "run_all"].includes(str(cfg.missedPolicy))) push("INVALID_SCHEDULE", "choose a missed-run policy");
      break;
    }
    case "transform.json":
    case "logic.condition":
      checkExpr(push, "expression", str(cfg.expression));
      break;
    case "output": {
      const key = str(cfg.key).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) push("INVALID_OUTPUT_KEY", "output key must be letters, digits or _ (max 64)");
      else if (RESERVED_KEYS.has(key)) push("RESERVED_OUTPUT_KEY", `"${key}" is reserved — choose another output key`);
      checkExpr(push, "value", str(cfg.expression), { optional: true });
      break;
    }
    case "data.filter":
      checkExpr(push, "predicate", str(cfg.predicate));
      checkExpr(push, "source", str(cfg.source), { optional: true });
      break;
    case "data.map": {
      const fields = Array.isArray(cfg.fields) ? (cfg.fields as { key?: unknown; expression?: unknown }[]) : [];
      if (fields.length === 0) push("EMPTY_MAPPING", "add at least one field");
      if (fields.length > 50) push("TOO_MANY_FIELDS", "at most 50 fields");
      const seen = new Set<string>();
      for (const f of fields) {
        const k = str(f.key).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k) || RESERVED_KEYS.has(k)) push("INVALID_FIELD", `field name "${k}" is not allowed`);
        if (seen.has(k)) push("DUPLICATE_FIELD", `field "${k}" is mapped twice`);
        seen.add(k);
        checkExpr(push, `field "${k}"`, str(f.expression));
      }
      break;
    }
    case "data.merge":
      if (!["object", "array", "first"].includes(str(cfg.mode))) push("INVALID_CONFIG", "choose a merge mode");
      break;
    case "data.csv":
      if (!["parse", "build"].includes(str(cfg.mode))) push("INVALID_CONFIG", "choose parse or build");
      checkExpr(push, "source", str(cfg.source), { optional: true });
      if (str(cfg.delimiter).length !== 1) push("INVALID_CONFIG", "delimiter must be one character");
      break;
    case "data.file":
      if (!["upload", "input", "url"].includes(str(cfg.from))) push("INVALID_CONFIG", "choose where the file comes from");
      if (cfg.from === "upload" && !str(cfg.fileId)) push("MISSING_FILE", "choose an uploaded file");
      if (cfg.from !== "upload") checkExpr(push, "source", str(cfg.source));
      if (!["text", "json", "csv", "pdf_text"].includes(str(cfg.as))) push("INVALID_CONFIG", "choose how to read the file");
      break;
    case "data.store":
      if (!["get", "set"].includes(str(cfg.op))) push("INVALID_CONFIG", "choose get or set");
      if (!/^[a-z0-9_.-]{1,40}$/i.test(str(cfg.namespace))) push("INVALID_CONFIG", "namespace must be 1–40 letters, digits, _ . -");
      checkExpr(push, "key", str(cfg.key));
      if (cfg.op === "set") checkExpr(push, "value", str(cfg.value));
      break;
    case "logic.loop": {
      checkExpr(push, "items", str(cfg.items));
      if (!str(cfg.flowId)) push("MISSING_SUBFLOW", "choose the subflow to run per item");
      const max = Number(cfg.maxItems);
      if (!Number.isInteger(max) || max < 1 || max > MAX_LOOP_ITEMS) push("UNBOUNDED_LOOP", `max items must be 1–${MAX_LOOP_ITEMS}`);
      if (!Number.isInteger(Number(cfg.version)) || Number(cfg.version) < 1) push("MISSING_SUBFLOW", "pin a published subflow version");
      break;
    }
    case "flow.subflow":
      if (!str(cfg.flowId)) push("MISSING_SUBFLOW", "choose the subflow");
      if (!Number.isInteger(Number(cfg.version)) || Number(cfg.version) < 1) push("MISSING_SUBFLOW", "pin a published subflow version");
      checkExpr(push, "input", str(cfg.input), { optional: true });
      break;
    case "http.request": {
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(str(cfg.method))) push("INVALID_CONFIG", "choose an HTTP method");
      checkExpr(push, "URL", str(cfg.url));
      checkExpr(push, "headers", str(cfg.headers), { optional: true });
      checkExpr(push, "body", str(cfg.body), { optional: true });
      const t = Number(cfg.timeoutMs);
      if (!(t >= 1000 && t <= 60000)) push("INVALID_CONFIG", "timeout must be 1–60 seconds");
      break;
    }
    case "ai.generate":
    case "ai.extract":
    case "ai.classify": {
      if (!str(cfg.instructions).trim()) push("INVALID_CONFIG", "instructions are empty");
      if (str(cfg.instructions).length > 4000) push("INVALID_CONFIG", "instructions are longer than 4000 characters");
      checkExpr(push, "source", str(cfg.source));
      if (node.type === "ai.extract") {
        try {
          const schema = JSON.parse(str(cfg.schema));
          if (!schema || schema.type !== "object") push("INVALID_SCHEMA", "the output schema must be a JSON Schema with type \"object\"");
        } catch {
          push("INVALID_SCHEMA", "the output schema is not valid JSON");
        }
      }
      if (node.type === "ai.classify") {
        const labels = str(cfg.labels).split(",").map((l) => l.trim()).filter(Boolean);
        if (labels.length < 2 || labels.length > 20) push("INVALID_CONFIG", "give 2–20 comma-separated labels");
      }
      const mt = cfg.maxTokens === undefined ? 400 : Number(cfg.maxTokens);
      if (!(mt >= 16 && mt <= 4000)) push("INVALID_CONFIG", "max tokens must be 16–4000");
      break;
    }
    case "code.js": {
      const code = str(cfg.code);
      if (!code.trim()) push("INVALID_CONFIG", "code is empty");
      if (code.length > 20000) push("INVALID_CONFIG", "code is longer than 20,000 characters");
      const t = Number(cfg.timeoutMs);
      if (!(t >= 500 && t <= 30000)) push("INVALID_CONFIG", "timeout must be 0.5–30 seconds");
      break;
    }
    case "integration.action":
      if (!str(cfg.actionId)) push("MISSING_ACTION", "choose an app action");
      if (!str(cfg.connectionId)) push("MISSING_CONNECTION", "choose a connection");
      checkExpr(push, "input mapping", str(cfg.inputMapping));
      break;
  }
  return issues;
}

/** Collects `$steps.<id>` references from all expression-valued config fields. */
export function stepReferences(node: FlowNode): string[] {
  const text = JSON.stringify(node.data.config);
  const out = new Set<string>();
  for (const m of text.matchAll(/\$steps\.([A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(m[1]!);
  for (const m of text.matchAll(/\$steps\[\s*\\?["']([^"'\\]+)\\?["']\s*\]/g)) out.add(m[1]!);
  return [...out];
}

export function ancestors(graph: Pick<FlowGraph, "edges">, nodeId: string): Set<string> {
  const out = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of graph.edges) if (e.target === id && !out.has(e.source)) {
      out.add(e.source);
      stack.push(e.source);
    }
  }
  return out;
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

  const triggers = nodes.filter((n) => TRIGGER_TYPES.includes(n.type));
  if (triggers.length === 0) issues.push({ code: "NO_TRIGGER", message: "Add a trigger — every flow starts with one" });
  if (triggers.length > 1) issues.push({ code: "MULTIPLE_TRIGGERS", message: "Only one trigger per flow is supported" });
  if (nodes.length === triggers.length && triggers.length > 0) issues.push({ code: "NO_STEPS", message: "Add at least one step after the trigger" });

  // Re-check every edge with the same rules as the canvas.
  const accepted: FlowEdge[] = [];
  for (const e of edges) {
    const err = checkConnection({ nodes, edges: accepted }, e);
    if (err) issues.push({ code: "INVALID_EDGE", message: err, edgeId: e.id });
    else accepted.push(e);
  }

  // Output nodes writing the same key would silently overwrite each other.
  const keyOwners = new Map<string, FlowNode[]>();
  for (const n of nodes) {
    if (n.type !== "output") continue;
    const key = str((n.data.config as unknown as Record<string, unknown>).key).trim();
    if (key) keyOwners.set(key, [...(keyOwners.get(key) ?? []), n]);
  }
  for (const [key, owners] of keyOwners) {
    if (owners.length > 1) for (const n of owners) issues.push({ code: "DUPLICATE_OUTPUT_KEY", message: `${n.data.label}: output key "${key}" is used by ${owners.length} Output nodes`, nodeId: n.id });
  }

  const labelOf = new Map(nodes.map((n) => [n.id, n.data.label]));
  for (const n of nodes) {
    const def = getNodeDefinition(n.type);
    if (!def) continue;
    if (def.inputs !== 0 && !accepted.some((e) => e.target === n.id)) {
      issues.push({ code: "UNCONNECTED_INPUT", message: `${n.data.label} isn't connected to anything upstream`, nodeId: n.id });
    }
    if (def.inputs === "many" && accepted.filter((e) => e.target === n.id).length < 2) {
      issues.push({ code: "MERGE_NEEDS_INPUTS", message: `${n.data.label}: connect at least two branches to merge`, nodeId: n.id });
    }
    issues.push(...validateConfig(n));
    // Templates ship with REPLACE_WITH_… placeholders; running is blocked until they're filled in.
    const placeholders = [...new Set(JSON.stringify(n.data.config).match(/REPLACE_WITH_[A-Z0-9_]+/g) ?? [])];
    for (const ph of placeholders) issues.push({ code: "SETUP_REQUIRED", message: `${n.data.label}: finish setup — replace ${ph}`, nodeId: n.id });
    // References must point to steps that run before this one.
    const up = ancestors({ edges: accepted }, n.id);
    for (const ref of stepReferences(n)) {
      if (!ids.has(ref)) issues.push({ code: "UNKNOWN_REFERENCE", message: `${n.data.label}: $steps.${ref} doesn't exist`, nodeId: n.id });
      else if (!up.has(ref)) issues.push({ code: "REFERENCE_NOT_UPSTREAM", message: `${n.data.label}: $steps.${ref} (${labelOf.get(ref)}) doesn't run before this step`, nodeId: n.id });
    }
  }
  return issues;
}

/** Topological order (Kahn). Assumes an acyclic graph. */
export function topoOrder(graph: Pick<FlowGraph, "nodes" | "edges">): FlowNode[] {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
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
export function descendants(graph: Pick<FlowGraph, "edges">, nodeId: string): Set<string> {
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
