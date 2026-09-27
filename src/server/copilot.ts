import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAiProvider } from "@/ai/provider";
import { db, schema } from "@/db";
import { NODE_DEFINITIONS } from "@/engine/nodes";
import { NODE_TYPES, type FlowEdge, type FlowGraph, type FlowNode, type NodeType } from "@/engine/types";
import { validateGraph } from "@/engine/validate";
import { getAction, listProviders } from "@/integrations/registry";
import type { CurrentUser } from "./access";
import { saveFlow } from "./flows";
import { HttpError, notFound } from "./http";
import { checkRunRate } from "./rate-limit";

/**
 * Copilot: natural language → typed PATCH → server-side validation against the real node registry,
 * action registry and the workspace's connections → preview/diff → explicit user approval → saved as a
 * DRAFT revision (optimistic concurrency). It never runs anything and never publishes.
 * The model can't invent node types, tools/actions, parameters, credentials or integrations: any such
 * reference makes the proposal invalid (or, for a missing credential, "setup required").
 */
export const COPILOT_MARKER = "FLOWLINE_COPILOT";

const patchSchema = z.object({
  summary: z.string().max(600).default(""),
  addNodes: z.array(z.object({ id: z.string().min(1).max(40), type: z.string(), label: z.string().max(80).default(""), config: z.record(z.string(), z.unknown()).default({}) })).max(20).default([]),
  updateNodes: z.array(z.object({ id: z.string(), label: z.string().max(80).optional(), config: z.record(z.string(), z.unknown()).optional() })).max(40).default([]),
  removeNodes: z.array(z.string()).max(40).default([]),
  addEdges: z.array(z.object({ source: z.string(), target: z.string(), sourceHandle: z.enum(["true", "false"]).nullable().optional() })).max(40).default([]),
  removeEdges: z.array(z.object({ source: z.string(), target: z.string() })).max(40).default([]),
});
export type CopilotPatch = z.infer<typeof patchSchema>;

/** JSON Schema handed to the model (structured output). */
const PATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    addNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, label: { type: "string" }, config: { type: "object" } }, required: ["id", "type", "label", "config"] } },
    updateNodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, config: { type: "object" } }, required: ["id"] } },
    removeNodes: { type: "array", items: { type: "string" } },
    addEdges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, sourceHandle: { type: ["string", "null"] } }, required: ["source", "target"] } },
    removeEdges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" } }, required: ["source", "target"] } },
  },
  required: ["summary", "addNodes", "updateNodes", "removeNodes", "addEdges", "removeEdges"],
};

/** Parameters each node type accepts: exactly its registry config (plus documented optional keys). */
const EXTRA_KEYS: Partial<Record<NodeType, string[]>> = { "trigger.webhook": ["signatureScheme"], "ai.classify": ["maxTokens"] };
function allowedKeys(type: NodeType) {
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
}

function catalogFor(connections: { id: string; provider: string; label: string; status: string }[]) {
  const nodeTypes = NODE_TYPES.filter((t) => t !== "integration.action").map((t) => ({ type: t, params: [...allowedKeys(t)], description: NODE_DEFINITIONS[t].description }));
  const actions = listProviders().flatMap((p) =>
    p.actions.map((a) => ({ actionId: a.id, integration: p.name, provider: p.id, title: a.title, requiredInputs: inputFields(a.id) })),
  );
  return { nodeTypes, integrationAction: { params: [...allowedKeys("integration.action")], actions }, connections };
}

function inputFields(actionId: string): string[] {
  const shape = (getAction(actionId)?.action.input as unknown as { shape?: Record<string, { safeParse?: (v: unknown) => { success: boolean } }> })?.shape;
  if (!shape) return [];
  // A field is required when `undefined` doesn't satisfy its schema.
  return Object.entries(shape)
    .filter(([, v]) => typeof v?.safeParse === "function" && !v.safeParse(undefined).success)
    .map(([k]) => k);
}

function graphSummary(g: FlowGraph) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, config: n.data.config })),
    edges: g.edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

/** Validates the patch against the registry and the workspace, applies it to a copy, and diffs. */
export function applyPatch(base: FlowGraph, patch: CopilotPatch, conns: { id: string; provider: string; status: string }[]): { graph: FlowGraph; issues: Issue[]; diff: Diff } {
  const issues: Issue[] = [];
  const err = (code: string, message: string, nodeId?: string) => issues.push({ code, message, severity: "error", nodeId });
  const warn = (code: string, message: string, nodeId?: string) => issues.push({ code, message, severity: "warning", nodeId });
  const nodes = new Map(base.nodes.map((n) => [n.id, structuredClone(n)]));
  const existing = new Set(nodes.keys());

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
    edges.push({ id: `cp-${Date.now().toString(36)}-${i++}`, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null });
  }
  const graph: FlowGraph = { nodes: [...nodes.values()], edges };
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

export async function propose(user: CurrentUser, flowId: string, request: string) {
  const text = request.trim();
  if (!text) throw new HttpError(400, "VALIDATION", "Describe what the workflow should do");
  if (text.length > 2000) throw new HttpError(413, "INPUT_TOO_LARGE", "Keep the request under 2,000 characters");
  checkRunRate(`copilot:${user.id}`);
  const [flow] = await db.select().from(schema.flow).where(eq(schema.flow.id, flowId));
  if (!flow || flow.deletedAt) throw notFound("Flow not found");
  const conns = await db
    .select({ id: schema.connection.id, provider: schema.connection.provider, label: schema.connection.label, status: schema.connection.status })
    .from(schema.connection)
    .where(eq(schema.connection.workspaceId, flow.workspaceId));
  const provider = getAiProvider();
  if (!provider.available) throw new HttpError(503, "AI_UNAVAILABLE", provider.reason ?? "No AI provider is configured");
  const base = flow.graph as FlowGraph;

  let patch: CopilotPatch | null = null;
  const issues: Issue[] = [];
  let model = provider.model;
  try {
    const r = await provider.generate({
      instructions:
        `${COPILOT_MARKER}. You edit Flowline workflows. Return ONLY a patch (JSON) that implements this request from the workflow's owner: "${text}". ` +
        "Use ONLY node types, parameters, actions and connection ids that appear in the catalog in the data. Never invent credentials: leave connectionId empty when no matching connection is listed. " +
        "Keep existing steps unless the request asks to remove them. New node ids must be short and unique.",
      content: JSON.stringify({ catalog: catalogFor(conns), currentWorkflow: graphSummary(base) }),
      maxTokens: 1500,
      schema: PATCH_JSON_SCHEMA,
      signal: AbortSignal.timeout(120_000),
    });
    model = r.model;
    const parsed = patchSchema.safeParse(r.json);
    if (!parsed.success) issues.push({ code: "INVALID_PATCH", message: `The AI returned a patch Flowline can't read (${parsed.error.issues[0]?.message ?? "shape"})`, severity: "error" });
    else patch = parsed.data;
  } catch (e) {
    issues.push({ code: "AI_ERROR", message: (e as Error).message, severity: "error" });
  }
  let proposedGraph: FlowGraph | null = null;
  let diff: Diff | null = null;
  if (patch) {
    const applied = applyPatch(base, patch, conns);
    issues.push(...applied.issues);
    proposedGraph = applied.graph;
    diff = applied.diff;
  }
  const status = issues.some((i) => i.severity === "error") || !patch ? "invalid" : "proposed";
  const [row] = await db
    .insert(schema.copilotProposal)
    .values({ workspaceId: flow.workspaceId, flowId, baseRevision: flow.revision, request: text, patch, proposedGraph, diff, issues, status, provider: provider.id, model, createdBy: user.id })
    .returning();
  return publicProposal(row!);
}

export function publicProposal(p: typeof schema.copilotProposal.$inferSelect) {
  return { id: p.id, status: p.status, request: p.request, summary: (p.patch as CopilotPatch | null)?.summary ?? "", diff: p.diff as Diff | null, issues: p.issues, proposedGraph: p.proposedGraph, baseRevision: p.baseRevision, savedRevision: p.savedRevision, createdAt: p.createdAt, provider: p.provider, model: p.model };
}

/** Approve → saved as a draft revision (never run or published). Removals need explicit confirmation. */
export async function decideProposal(user: CurrentUser, flowId: string, proposalId: string, d: { decision: "approve" | "reject"; confirmRemovals?: boolean }) {
  const [p] = await db.select().from(schema.copilotProposal).where(and(eq(schema.copilotProposal.id, proposalId), eq(schema.copilotProposal.flowId, flowId)));
  if (!p) throw notFound("Proposal not found");
  if (p.status !== "proposed") throw new HttpError(409, "PROPOSAL_CLOSED", p.status === "invalid" ? "This proposal is invalid and can't be applied — revise the request" : `This proposal is already ${p.status}`);
  if (d.decision === "reject") {
    const [r] = await db.update(schema.copilotProposal).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.copilotProposal.id, p.id)).returning();
    return publicProposal(r!);
  }
  const removed = (p.diff as Diff | null)?.removed ?? [];
  if (removed.length > 0 && !d.confirmRemovals) throw new HttpError(409, "CONFIRM_REMOVALS", `This change removes ${removed.length} existing step(s): ${removed.map((r) => r.label).join(", ")}. Confirm to apply it.`);
  try {
    const saved = await saveFlow(user, flowId, { baseRevision: p.baseRevision, graph: p.proposedGraph as FlowGraph });
    const [r] = await db.update(schema.copilotProposal).set({ status: "approved", decidedAt: new Date(), savedRevision: saved.flow.revision }).where(eq(schema.copilotProposal.id, p.id)).returning();
    return publicProposal(r!);
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {
      await db.update(schema.copilotProposal).set({ status: "stale", decidedAt: new Date() }).where(eq(schema.copilotProposal.id, p.id));
      throw new HttpError(409, "PROPOSAL_STALE", "The workflow changed since this proposal was made — nothing was overwritten. Ask Copilot again.");
    }
    throw e;
  }
}

export async function listProposals(flowId: string) {
  const rows = await db.select().from(schema.copilotProposal).where(eq(schema.copilotProposal.flowId, flowId)).orderBy(desc(schema.copilotProposal.createdAt)).limit(20);
  return rows.map(publicProposal);
}
