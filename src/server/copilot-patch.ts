import { z } from "zod";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { NODE_TYPES, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/engine/types";
import { executeGraph, sampleInputFor } from "@/engine/execute";
import { validateGraph } from "@/engine/validate";
import { getAction, listProviders } from "@/integrations/registry";

/**
 * Copilot's pure patch layer (no database): the patch schema, the catalog shown to the model, and applyPatch —
 * validation against the real node/action registries plus the deterministic repairs of common model mistakes.
 * Every repair is reported as a warning in the proposal; anything that can't be repaired safely is an error.
 */
export const patchSchema = z.object({
  summary: z.string().max(600).default(""),
  addNodes: z.array(z.object({ id: z.string().min(1).max(40), type: z.string(), label: z.string().max(80).default(""), config: z.record(z.string(), z.unknown()).default({}), after: z.string().nullable().optional() })).max(20).default([]),
  updateNodes: z.array(z.object({ id: z.string(), label: z.string().max(80).optional(), config: z.record(z.string(), z.unknown()).optional() })).max(40).default([]),
  removeNodes: z.array(z.string()).max(40).default([]),
  addEdges: z.array(z.object({ source: z.string(), target: z.string(), sourceHandle: z.string().nullable().optional() })).max(40).default([]),
  removeEdges: z.array(z.object({ source: z.string(), target: z.string() })).max(40).default([]),
});
export type CopilotPatch = z.infer<typeof patchSchema>;

/** JSON Schema handed to the model (structured output). */
export const PATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    addNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, label: { type: "string" }, config: { type: "object" }, after: { type: ["string", "null"] } }, required: ["id", "type", "label", "config"] } },
    updateNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, config: { type: "object" } }, required: ["id"] } },
    removeNodes: { type: "array", items: { type: "string" } },
    addEdges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, sourceHandle: { type: ["string", "null"] } }, required: ["source", "target"] } },
    removeEdges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" } }, required: ["source", "target"] } },
  },
  required: ["summary", "addNodes", "updateNodes", "removeNodes", "addEdges", "removeEdges"],
};

/** Parameters each node type accepts: exactly its registry config (plus documented optional keys). */
const EXTRA_KEYS: Partial<Record<NodeType, string[]>> = { "trigger.webhook": ["signatureScheme"], "ai.classify": ["maxTokens"] };
export function allowedKeys(type: NodeType) {
  return new Set([...Object.keys(NODE_DEFINITIONS[type].defaultConfig() as object), ...(EXTRA_KEYS[type] ?? [])]);
}

export interface Issue {
  code: string;
  message: string;
  severity: "error" | "warning";
  nodeId?: string;
}
export interface Diff {
  added: { id: string; type: string; label: string }[];
  changed: { id: string; label: string; fields: string[] }[];
  removed: { id: string; type: string; label: string }[];
  edgesAdded: number;
  edgesRemoved: number;
  /** Dry run of the proposed graph on its own sample input (local steps only) — shown before approval. */
  preview?: Preview;
}

export interface Preview {
  ran: boolean;
  reason?: string;
  status?: string;
  output?: unknown;
  error?: { code: string; message: string; nodeId?: string } | null;
}

export function catalogFor(connections: { id: string; provider: string; label: string; status: string }[]) {
  // Each node type with an example config: its exact keys AND value types (strings vs booleans vs numbers).
  const nodeTypes = NODE_TYPES.filter((t) => t !== "integration.action").map((t) => ({ type: t, description: NODE_DEFINITIONS[t].description, exampleConfig: NODE_DEFINITIONS[t].defaultConfig() }));
  const actions = listProviders().flatMap((p) =>
    p.actions.map((a) => ({ actionId: a.id, integration: p.name, provider: p.id, title: a.title, requiredInputs: inputFields(a.id) })),
  );
  return {
    nodeTypes,
    integrationAction: { type: "integration.action", exampleConfig: NODE_DEFINITIONS["integration.action"].defaultConfig(), actions },
    availableIntegrations: listProviders().map((p) => p.name),
    connections,
  };
}

function inputFields(actionId: string): string[] {
  const shape = (getAction(actionId)?.action.input as unknown as { shape?: Record<string, { safeParse?: (v: unknown) => { success: boolean } }> })?.shape;
  if (!shape) return [];
  // A field is required when `undefined` doesn't satisfy its schema.
  return Object.entries(shape)
    .filter(([, v]) => typeof v?.safeParse === "function" && !v.safeParse(undefined).success)
    .map(([k]) => k);
}

export function graphSummary(g: FlowGraph) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, config: n.data.config })),
    edges: g.edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

/** Validates the patch against the registry and the workspace, applies it to a copy, and diffs. */
export function applyPatch(base: FlowGraph, input: CopilotPatch, conns: { id: string; provider: string; status: string }[]): { graph: FlowGraph; issues: Issue[]; diff: Diff } {
  const issues: Issue[] = [];
  const err = (code: string, message: string, nodeId?: string) => issues.push({ code, message, severity: "error", nodeId });
  const warn = (code: string, message: string, nodeId?: string) => issues.push({ code, message, severity: "warning", nodeId });
  const nodes = new Map(base.nodes.map((n) => [n.id, structuredClone(n)]));
  const existing = new Set(nodes.keys());
  let patch = input;

  const checkConfig = (id: string, type: NodeType, config: Record<string, unknown>) => {
    const allowed = allowedKeys(type);
    for (const k of Object.keys(config)) if (!allowed.has(k)) err("UNKNOWN_PARAMETER", `"${k}" isn't a parameter of ${NODE_DEFINITIONS[type].title}`, id);
    if (type === "integration.action") {
      const actionId = String(config.actionId ?? "");
      const found = getAction(actionId);
      if (!found) {
        const provider = actionId.split(".")[0] ?? "";
        const known = listProviders().some((p) => p.id === provider);
        err(known ? "UNKNOWN_ACTION" : "UNKNOWN_INTEGRATION", known ? `"${actionId}" isn't an action of this integration` : `"${provider || actionId}" isn't an available integration`, id);
        return;
      }
      const connectionId = String(config.connectionId ?? "");
      if (connectionId) {
        const c = conns.find((x) => x.id === connectionId);
        if (!c || c.provider !== found.provider.id) err("UNKNOWN_CONNECTION", `Copilot referenced a ${found.provider.name} connection that doesn't exist — it can't create credentials`, id);
        else if (c.status !== "active") warn("CONNECTION_UNHEALTHY", `The ${found.provider.name} connection is ${c.status}; reconnect it before running`, id);
      } else {
        const any = conns.some((x) => x.provider === found.provider.id);
        warn("MISSING_CREDENTIAL", any ? `Choose a ${found.provider.name} connection for this step` : `Connect ${found.provider.name} in Integrations, then choose the connection for this step`, id);
      }
      if (typeof config.inputMapping !== "string") err("INVALID_PARAMETER", "inputMapping must be a JSONata expression string", id);
    }
  };

  // Models often re-spell ids ("is_hot" for "is-hot"). A reference that matches exactly ONE existing step after
  // normalising separators/case is mapped to it, with a visible warning; anything else stays an error below.
  const norm = (x: string) => x.toLowerCase().replace(/[\s_-]+/g, "");
  const newIds = new Set(patch.addNodes.map((a) => a.id));
  const resolve = (ref: string) => {
    if (existing.has(ref) || newIds.has(ref)) return ref;
    const hits = [...existing, ...newIds].filter((id) => norm(id) === norm(ref));
    if (hits.length !== 1) return ref;
    warn("RESOLVED_REFERENCE", `Copilot referred to "${ref}"; matched the step "${hits[0]}"`);
    return hits[0]!;
  };
  patch = {
    ...patch,
    removeNodes: patch.removeNodes.map(resolve),
    updateNodes: patch.updateNodes.map((u) => ({ ...u, id: resolve(u.id) })),
    addNodes: patch.addNodes.map((a) => ({ ...a, after: a.after ? resolve(a.after) : a.after })),
    addEdges: patch.addEdges.map((e) => ({ ...e, source: resolve(e.source), target: resolve(e.target) })),
    removeEdges: patch.removeEdges.map((e) => ({ source: resolve(e.source), target: resolve(e.target) })),
  };
  // An edge from an existing OUTPUT to a NEW step means "put it at the end": treat it as "after" that output,
  // which is then placed just before the output (outputs end a workflow; see below).
  for (const e of [...patch.addEdges]) {
    const add = patch.addNodes.find((a) => a.id === e.target);
    if (!add || nodes.get(e.source)?.type !== "output") continue;
    if (!add.after) {
      add.after = e.source;
      patch.addEdges = patch.addEdges.filter((x) => x !== e && x.source !== add.id);
    } else {
      // A step can sit before only one output; say which connection was left out.
      warn("CONNECTION_DROPPED", `"${add.label || add.id}" can't also follow the output "${nodes.get(e.source)!.data.label}" — outputs end a workflow`, add.id);
      patch.addEdges = patch.addEdges.filter((x) => x !== e);
    }
  }
  for (const r of patch.removeNodes) {
    const n = nodes.get(r);
    if (!n) err("UNKNOWN_NODE", `Can't remove "${r}": no such step`);
    else nodes.delete(r);
  }
  for (const u of patch.updateNodes) {
    const n = nodes.get(u.id);
    if (!n) {
      err("UNKNOWN_NODE", `Can't update "${u.id}": no such step`);
      continue;
    }
    if (u.label !== undefined) n.data.label = u.label || n.data.label;
    if (u.config) {
      checkConfig(u.id, n.type, u.config);
      n.data.config = { ...(n.data.config as object), ...u.config } as never;
    }
  }
  const xs = base.nodes.map((n) => n.position.x);
  let x = (xs.length ? Math.max(...xs) : -260) + 260;
  for (const a of patch.addNodes) {
    // Models often use an action id as the step type ("slack.post_message"). When it names a REAL action, it becomes
    // that integration step (its config becomes the input mapping); invented actions stay errors below.
    if (!(NODE_TYPES as readonly string[]).includes(a.type) && getAction(a.type)) {
      const { connectionId, ...inputs } = a.config as Record<string, unknown>;
      warn("CONVERTED_TO_INTEGRATION", `"${a.label || a.id}" uses the ${getAction(a.type)!.provider.name} action ${a.type} as an integration step`, a.id);
      a.config = { actionId: a.type, connectionId: typeof connectionId === "string" ? connectionId : "", inputMapping: JSON.stringify(inputs) };
      a.type = "integration.action";
    }
    if (!(NODE_TYPES as readonly string[]).includes(a.type)) {
      err("UNKNOWN_NODE_TYPE", `"${a.type}" isn't a Flowline node type`, a.id);
      continue;
    }
    if (nodes.has(a.id) || existing.has(a.id)) {
      err("DUPLICATE_NODE_ID", `A step with id "${a.id}" already exists`, a.id);
      continue;
    }
    const type = a.type as NodeType;
    checkConfig(a.id, type, a.config);
    const config = { ...(NODE_DEFINITIONS[type].defaultConfig() as object), ...a.config };
    nodes.set(a.id, { id: a.id, type, position: { x, y: 120 }, data: { label: a.label || NODE_DEFINITIONS[type].title, config: config as never } } as FlowNode);
    x += 260;
  }
  const removed = new Set(patch.removeNodes);
  let edges: FlowEdge[] = base.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target));
  for (const r of patch.removeEdges) edges = edges.filter((e) => !(e.source === r.source && e.target === r.target));
  let i = 0;
  for (const e of patch.addEdges) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) {
      err("UNKNOWN_NODE", `An edge references a step that doesn't exist (${e.source} → ${e.target})`);
      continue;
    }
    if (edges.some((x) => x.source === e.source && x.target === e.target)) continue;
    // Only a condition's branches have handles; anything else from the model means "no handle" (for a condition the
    // engine then uses its first output, the true branch — the same rule as a connection drawn on the canvas).
    const isCondition = nodes.get(e.source)!.type === "logic.condition";
    const handle = isCondition && (e.sourceHandle === "true" || e.sourceHandle === "false") ? e.sourceHandle : null;
    edges.push({ id: `cp-${Date.now().toString(36)}-${i++}`, source: e.source, target: e.target, sourceHandle: handle });
  }
  // "after": insert a new step behind an existing one; it takes over that step's outgoing connections.
  for (const a of patch.addNodes) {
    if (!a.after || !nodes.has(a.id)) continue;
    let prev = nodes.get(a.after);
    if (!prev) {
      err("UNKNOWN_NODE", `"${a.label || a.id}" is placed after "${a.after}", which doesn't exist`, a.id);
      continue;
    }
    if (prev.type === "output") {
      // Outputs end a workflow: "after the output" can only mean "just before it" — say so in the proposal.
      const feeders = edges.filter((e) => e.target === prev!.id);
      if (feeders.length !== 1) {
        err("INVALID_AFTER", `"${a.label || a.id}" can't follow "${prev.data.label}": output steps end a workflow`, a.id);
        continue;
      }
      warn("PLACED_BEFORE_OUTPUT", `"${a.label || a.id}" was placed just before the output "${prev.data.label}" — outputs end a workflow`, a.id);
      a.after = feeders[0]!.source;
      prev = nodes.get(a.after)!;
    }
    const next = edges.filter((e) => e.source === a.after && e.target !== a.id);
    edges = edges.filter((e) => !(e.source === a.after && e.target !== a.id));
    const isCondition = nodes.get(a.id)!.type === "logic.condition";
    if (!edges.some((e) => e.source === a.after && e.target === a.id)) edges.push({ id: `cp-${Date.now().toString(36)}-${i++}`, source: a.after, target: a.id, sourceHandle: next[0]?.sourceHandle ?? null });
    for (const n of next) edges.push({ id: `cp-${Date.now().toString(36)}-${i++}`, source: a.id, target: n.target, sourceHandle: isCondition ? "true" : null });
  }
  const graph: FlowGraph = { nodes: [...nodes.values()], edges };
  // A workflow with no Output step and no action does nothing anyone can see (e.g. a transform merely labelled "Output").
  if (graph.nodes.length > 0 && !graph.nodes.some((n) => n.type === "output" || NODE_DEFINITIONS[n.type]?.sideEffect !== "none")) {
    err("NO_RESULT", "This workflow doesn't produce anything: it has no Output step and no action. Add an Output step to return results.");
  }
  for (const v of validateGraph(graph)) {
    // Missing setup is expected for a draft; structure problems make the proposal invalid.
    if (["SETUP_REQUIRED", "MISSING_CONNECTION", "NO_STEPS"].includes(v.code)) warn(v.code, v.message, v.nodeId);
    else err(v.code, v.message, v.nodeId);
  }
  const diff: Diff = {
    added: graph.nodes.filter((n) => !existing.has(n.id)).map((n) => ({ id: n.id, type: n.type, label: n.data.label })),
    changed: patch.updateNodes
      .filter((u) => nodes.has(u.id))
      .map((u) => ({ id: u.id, label: nodes.get(u.id)!.data.label, fields: [...(u.label !== undefined ? ["label"] : []), ...Object.keys(u.config ?? {})] })),
    removed: base.nodes.filter((n) => removed.has(n.id)).map((n) => ({ id: n.id, type: n.type, label: n.data.label })),
    edgesAdded: edges.filter((e) => !base.edges.some((b) => b.source === e.source && b.target === e.target)).length,
    edgesRemoved: base.edges.filter((b) => !edges.some((e) => e.source === b.source && e.target === b.target)).length,
  };
  return { graph, issues, diff };
}

/* ───────── Dry-run preview ───────── */

/** Steps that are pure and local: a preview runs them without touching anything outside the engine. */
const PREVIEW_TYPES = new Set(["trigger.manual", "trigger.webhook", "trigger.schedule", "transform.json", "logic.condition", "output", "data.filter", "data.map", "data.merge", "data.csv"]);
/** Pattern matching can't be interrupted in-process (catastrophic backtracking): such proposals aren't previewed here. */
const REGEX_RISK = /\$(match|replace|split|contains)\s*\(|\/[^/\n]+\/[imx]*\s*[),]/;

const emptyish = (v: unknown): boolean =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.values(v as object).every(emptyish));

/**
 * Runs the proposed graph on its trigger's sample input when every step is local and pure, so the person approving
 * sees what it actually returns. Anything the preview reveals (a failure, an empty result) becomes a visible warning.
 */
export async function previewGraph(graph: FlowGraph): Promise<{ preview: Preview; issues: Issue[] }> {
  const blocked = graph.nodes.find((n) => !PREVIEW_TYPES.has(n.type));
  if (blocked) return { preview: { ran: false, reason: `Not previewed: "${blocked.data.label}" (${blocked.type}) runs outside Flowline — test it in the builder after approving.` }, issues: [] };
  if (graph.nodes.some((n) => REGEX_RISK.test(JSON.stringify(n.data.config)))) return { preview: { ran: false, reason: "Not previewed: an expression uses pattern matching — run it in the builder after approving." }, issues: [] };
  let input: unknown;
  try {
    input = sampleInputFor(graph);
  } catch {
    return { preview: { ran: false, reason: "Not previewed: the trigger's sample payload isn't valid JSON." }, issues: [{ code: "PREVIEW_FAILED", message: "The trigger's sample payload isn't valid JSON", severity: "warning" }] };
  }
  const res = await executeGraph(graph, input, { signal: AbortSignal.timeout(3_000) });
  const preview: Preview = { ran: true, status: res.status, output: res.output, error: res.error };
  const issues: Issue[] = [];
  if (res.status !== "succeeded") issues.push({ code: "PREVIEW_FAILED", message: `On its sample input this workflow ${res.status === "failed" ? `fails${res.error ? `: ${res.error.message}` : ""}` : `ends as ${res.status}`} — review the steps before approving.`, severity: "warning", nodeId: res.error?.nodeId });
  else if (emptyish(res.output)) issues.push({ code: "PREVIEW_EMPTY", message: `On its sample input this workflow returns no data (${JSON.stringify(res.output).slice(0, 120)}) — check the expressions before approving.`, severity: "warning" });
  return { preview, issues };
}
