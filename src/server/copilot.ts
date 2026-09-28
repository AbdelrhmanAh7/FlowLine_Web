import { and, desc, eq } from "drizzle-orm";
import { estimateTokens, getAiProvider } from "@/ai/provider";
import { db, schema } from "@/db";
import type { PriceTable } from "@/db/schema";
import type { FlowGraph } from "@/engine/types";
import type { CurrentUser } from "./access";
import { createFlow, saveFlow } from "./flows";
import { HttpError, notFound } from "./http";
import { availableIntegrationNames, unavailableAppsIn } from "./copilot-apps";
import { applyPatch, catalogFor, graphSummary, PATCH_JSON_SCHEMA, patchSchema, previewGraph, type CopilotPatch, type Diff, type Issue } from "./copilot-patch";
import { checkRunRate } from "./rate-limit";
import { aiCostMicros, BudgetExceededError, priceFor, releaseUsage, reserveUsage, settleUsage } from "./usage";

/**
 * Copilot: natural language → typed PATCH → server-side validation against the real node registry,
 * action registry and the workspace's connections → preview/diff → explicit user approval → saved as a
 * DRAFT revision (optimistic concurrency). It never runs anything and never publishes.
 * The model can't invent node types, tools/actions, parameters, credentials or integrations: any such
 * reference makes the proposal invalid (or, for a missing credential, "setup required").
 */
export const COPILOT_MARKER = "FLOWLINE_COPILOT";
/** Bumped whenever the instructions, catalog shape or repair rules change (recorded with benchmark results). */
export const COPILOT_PROMPT_VERSION = "p4-1";

const EXAMPLE_PATCH = {"summary": "Manual start, double n, output", "addNodes": [{"id": "n1", "type": "trigger.manual", "label": "Start", "config": {"samplePayload": "{ \"n\": 2 }"}}, {"id": "n2", "type": "transform.json", "label": "Double", "config": {"expression": "{ \"v\": n * 2 }"}}, {"id": "n3", "type": "output", "label": "Result", "config": {"key": "result", "expression": ""}}], "updateNodes": [], "removeNodes": [], "addEdges": [{"source": "n1", "target": "n2", "sourceHandle": null}, {"source": "n2", "target": "n3", "sourceHandle": null}], "removeEdges": []};

function copilotInstructions(text: string) {
  return [
    `${COPILOT_MARKER}. You edit Flowline workflows. Return ONLY a JSON patch that implements this request from the workflow's owner: "${text}".`,
    "Patch fields (use [] for any you don't need):",
    '- addNodes: NEW steps: { id (short, unique, e.g. "n1"), type (a catalog type), label, config }. config uses ONLY the keys of that type\'s exampleConfig, with the same value types.',
    "- updateNodes: change EXISTING steps of currentWorkflow only (by their id).",
    "- removeNodes: ids of EXISTING steps to delete — only if the request asks for it.",
    '- addEdges: { source: node id, target: node id, sourceHandle: "true"/"false" only when source is a logic.condition, otherwise null }. Edges use node ids, never types.',
    "- removeEdges: existing edges to delete. Output steps have no outgoing edges.",
    `Output steps END a workflow: to add something "at the end" or "after the last step", put it after the step that feeds the output(s) (use "after" with that step's id), so it runs just before them.`,
    `- To insert a new step into an EXISTING workflow, set its "after" to the id of the existing step it follows: Flowline rewires the connections itself (the new step takes over that step's next steps). Don't add edges for it then. Leave "after" null in a new workflow.`,
    "A new workflow needs exactly one trigger step first and usually an output step last, connected in order. Expressions are JSONata.",
    "Use ONLY node types, config keys, actions and connection ids from the catalog. Never invent credentials: leave connectionId empty when no matching connection is listed.",
    'If the request needs an app that is not in availableIntegrations, don\'t substitute another app or step for it: leave that part out and write "Not available: <app>" in summary.',
    `Example for an empty workflow ("start manually and output the doubled number"): ${JSON.stringify(EXAMPLE_PATCH)}`,
  ].join("\n");
}

/** Validation-feedback rounds: an invalid patch is sent back with Flowline's exact issues (the validator still decides). */
const REPAIR_ROUNDS = 2;

/**
 * Asks the model for a patch, validates it, and — when invalid — asks for a corrected patch with the issues, up to
 * REPAIR_ROUNDS times. Returns the last patch and its parse issues. Exported so real-model behaviour can be measured.
 */
export async function generatePatch(
  provider: Awaited<ReturnType<typeof getAiProvider>>,
  text: string,
  base: FlowGraph,
  conns: { id: string; provider: string; label: string; status: string }[],
  /** Usage metering (every model call is reserved against the budget/plan cap, then settled with real tokens). */
  meter?: { workspaceId: string; key: string; prices: PriceTable },
): Promise<{ patch: CopilotPatch | null; issues: Issue[]; model: string; attempts: number; usage: { inputTokens: number; outputTokens: number } }> {
  // A request that needs an app Flowline can't connect to is refused up front — never substituted by the model.
  const missing = unavailableAppsIn(text);
  if (missing.length > 0) {
    const list = missing.map((m) => `"${m}"`).join(", ");
    return {
      patch: null,
      issues: [{ code: "UNKNOWN_INTEGRATION", message: `${list} ${missing.length > 1 ? "aren't available integrations" : "isn't an available integration"} in Flowline. Available: ${availableIntegrationNames().join(", ")}.`, severity: "error" }],
      model: provider.model,
      attempts: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
  const content = JSON.stringify({ catalog: catalogFor(conns), currentWorkflow: graphSummary(base) });
  let model = provider.model;
  let patch: CopilotPatch | null = null;
  let issues: Issue[] = [];
  let feedback = "";
  const usage = { inputTokens: 0, outputTokens: 0 };
  let attempts = 0;
  for (let round = 0; round <= REPAIR_ROUNDS; round++) {
    attempts++;
    issues = [];
    patch = null;
    const instructions = copilotInstructions(text) + feedback;
    const usageKey = meter ? `${meter.key}:${attempts}` : null;
    const price = meter ? priceFor(meter.prices, `ai:${provider.id}/${provider.model}`) : undefined;
    if (meter && usageKey) {
      const est = aiCostMicros(price, estimateTokens(instructions + content), 1500);
      try {
        await reserveUsage(db, { workspaceId: meter.workspaceId, runId: null, nodeId: null, kind: "ai", idempotencyKey: usageKey, estimatedMicros: est.cost, provider: provider.id, model: provider.model, unpriced: est.unpriced, retry: attempts > 1 });
      } catch (e) {
        if (e instanceof BudgetExceededError) issues.push({ code: "BUDGET_EXCEEDED", message: e.message, severity: "error" });
        else throw e;
        break;
      }
    }
    try {
      const r = await provider.generate({
        instructions,
        content,
        maxTokens: 1500,
        schema: PATCH_JSON_SCHEMA,
        signal: AbortSignal.timeout(120_000),
      });
      model = r.model;
      usage.inputTokens += r.usage.inputTokens;
      usage.outputTokens += r.usage.outputTokens;
      if (usageKey) {
        const cost = aiCostMicros(price, r.usage.inputTokens, r.usage.outputTokens);
        await settleUsage(db, usageKey, { costMicros: cost.cost, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, unpriced: cost.unpriced });
      }
      const parsed = patchSchema.safeParse(r.json);
      if (!parsed.success) issues.push({ code: "INVALID_PATCH", message: `The AI returned a patch Flowline can't read (${parsed.error.issues[0]?.message ?? "shape"})`, severity: "error" });
      else patch = parsed.data;
    } catch (e) {
      if (usageKey) await releaseUsage(db, usageKey).catch(() => {}); // nothing was consumed
      issues.push({ code: "AI_ERROR", message: (e as Error).message, severity: "error" });
      break; // provider failure: don't retry here
    }
    const problems = patch ? applyPatch(base, patch, conns).issues.filter((i) => i.severity === "error") : issues;
    if (problems.length === 0) break;
    feedback =
      `\nYour previous patch was rejected by Flowline's validator:\n${problems.map((p) => `- ${p.message}`).join("\n")}\n` +
      `Previous patch: ${JSON.stringify(patch ?? {})}\nReturn a corrected, complete patch.`;
  }
  return { patch, issues, model, attempts, usage };
}

export async function propose(user: CurrentUser, flowId: string, request: string) {
  const [flow] = await db.select().from(schema.flow).where(eq(schema.flow.id, flowId));
  if (!flow || flow.deletedAt) throw notFound("Flow not found");
  return proposeFor(user, flow.workspaceId, flow, request);
}

/** "Create with Copilot": a proposal for a NEW flow. Nothing is created until the proposal is approved. */
export async function proposeNewFlow(user: CurrentUser, workspaceId: string, request: string) {
  return proposeFor(user, workspaceId, null, request);
}

async function proposeFor(user: CurrentUser, workspaceId: string, flow: typeof schema.flow.$inferSelect | null, request: string) {
  const text = request.trim();
  if (!text) throw new HttpError(400, "VALIDATION", "Describe what the workflow should do");
  if (text.length > 2000) throw new HttpError(413, "INPUT_TOO_LARGE", "Keep the request under 2,000 characters");
  await checkRunRate(`copilot:${user.id}`);
  const conns = await db
    .select({ id: schema.connection.id, provider: schema.connection.provider, label: schema.connection.label, status: schema.connection.status })
    .from(schema.connection)
    .where(eq(schema.connection.workspaceId, workspaceId));
  const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  if (!ws) throw notFound("Workspace not found");
  // The workspace's authorised AI connection (default route), acting for this user. Never an environment key.
  const requestId = `copilot:${flow?.id ?? "new"}:${crypto.randomUUID()}`;
  const provider = await getAiProvider(db, ws, user.id, { requestId });
  if (!provider.available) throw new HttpError(503, provider.code ?? "AI_NOT_CONFIGURED", provider.reason ?? "No AI model is set up");
  const base: FlowGraph = flow ? (flow.graph as FlowGraph) : { nodes: [], edges: [] };
  const { patch, issues, model } = await generatePatch(provider, text, base, conns, { workspaceId, key: requestId, prices: ws.prices ?? {} });
  let proposedGraph: FlowGraph | null = null;
  let diff: Diff | null = null;
  if (patch) {
    const applied = applyPatch(base, patch, conns);
    issues.push(...applied.issues);
    proposedGraph = applied.graph;
    diff = applied.diff;
    if (!issues.some((i) => i.severity === "error")) {
      const pv = await previewGraph(applied.graph).catch((e: Error) => ({ preview: { ran: false, reason: `Not previewed: ${e.message}` }, issues: [] as Issue[] }));
      diff = { ...diff, preview: pv.preview };
      issues.push(...pv.issues);
    }
  }
  const status = issues.some((i) => i.severity === "error") || !patch ? "invalid" : "proposed";
  const [row] = await db
    .insert(schema.copilotProposal)
    .values({ workspaceId, flowId: flow?.id ?? null, baseRevision: flow?.revision ?? 0, request: text, patch, proposedGraph, diff, issues, status, provider: provider.id, model, createdBy: user.id })
    .returning();
  return publicProposal(row!);
}

export function publicProposal(p: typeof schema.copilotProposal.$inferSelect) {
  return { id: p.id, flowId: p.flowId, status: p.status, request: p.request, summary: (p.patch as CopilotPatch | null)?.summary ?? "", diff: p.diff as Diff | null, issues: p.issues, proposedGraph: p.proposedGraph, baseRevision: p.baseRevision, savedRevision: p.savedRevision, createdAt: p.createdAt, provider: p.provider, model: p.model };
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

/** Approve a new-flow proposal: creates the flow with the proposed graph as its first draft (never run or published). */
export async function decideNewFlowProposal(user: CurrentUser, workspaceId: string, proposalId: string, d: { decision: "approve" | "reject" }) {
  const [p] = await db
    .select()
    .from(schema.copilotProposal)
    .where(and(eq(schema.copilotProposal.id, proposalId), eq(schema.copilotProposal.workspaceId, workspaceId)));
  // Proposals for an existing flow are decided on that flow; an approved new-flow proposal now has its flow id.
  if (!p || (p.flowId && p.status === "proposed")) throw notFound("Proposal not found");
  if (p.status !== "proposed") throw new HttpError(409, "PROPOSAL_CLOSED", p.status === "invalid" ? "This proposal is invalid and can't be applied — revise the request" : `This proposal is already ${p.status}`);
  if (d.decision === "reject") {
    const [r] = await db.update(schema.copilotProposal).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.copilotProposal.id, p.id)).returning();
    return publicProposal(r!);
  }
  const summary = (p.patch as CopilotPatch | null)?.summary?.trim();
  const name = (summary || p.request).replace(/\s+/g, " ").slice(0, 60).trim() || "Untitled flow";
  const created = await createFlow(user, workspaceId, { name });
  try {
    const saved = await saveFlow(user, created.id, { baseRevision: created.revision, graph: p.proposedGraph as FlowGraph });
    const [r] = await db.update(schema.copilotProposal).set({ status: "approved", decidedAt: new Date(), flowId: created.id, savedRevision: saved.flow.revision }).where(eq(schema.copilotProposal.id, p.id)).returning();
    return publicProposal(r!);
  } catch (e) {
    await db.delete(schema.flow).where(eq(schema.flow.id, created.id)); // no half-made flow is left behind
    throw e;
  }
}

export async function listProposals(flowId: string) {
  const rows = await db.select().from(schema.copilotProposal).where(eq(schema.copilotProposal.flowId, flowId)).orderBy(desc(schema.copilotProposal.createdAt)).limit(20);
  return rows.map(publicProposal);
}

export { applyPatch, type CopilotPatch, type Diff, type Issue } from "./copilot-patch";
