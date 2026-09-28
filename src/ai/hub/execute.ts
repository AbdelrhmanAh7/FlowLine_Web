import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { planEntitlements } from "@/server/entitlements";
import { BudgetExceededError, releaseUsage, reserveUsage, settleUsage } from "@/server/usage";
import { loadCredentials } from "./credentials";
import { roleMayUse } from "./discovery";
import { costMicros, maxCostMicros, type PriceSnapshot } from "./pricing";
import { callChat } from "./protocols";
import { structuredOutputMode } from "./protocols/openai-chat";
import { getProviderDef } from "./registry";
import { routeSnapshot } from "./routing";
import { HubError, type HubChatRequest, type NormalisedResult, type ResolvedRoute } from "./types";

type Workspace = typeof schema.workspace.$inferSelect;

export const MAX_AI_ATTEMPTS = 3;

export interface ExecuteInput {
  workspace: Workspace;
  /** The user this call acts for; their permission is re-checked on EVERY attempt (mid-run changes apply). */
  actorUserId: string;
  route: ResolvedRoute;
  request: HubChatRequest;
  purpose: "node" | "agent" | "copilot" | "connection_test";
  /**
   * "hub": this function reserves / settles the budget ledger (usage_event) per attempt.
   * "caller": the caller keeps its own ledger entries (agents, Copilot in Wave A); only ai_attempt rows are written.
   */
  metering: "hub" | "caller";
  /** Stable id for this logical request; attempt n uses `${requestId}:${n}` as its ledger key. */
  requestId: string;
  runId?: string | null;
  agentRunId?: string | null;
  nodeId?: string | null;
  signal: AbortSignal;
  maxAttempts?: number;
  onRetry?: (info: { attempt: number; code: string; waitMs: number }) => void | Promise<void>;
}

export interface ExecuteResult {
  result: NormalisedResult;
  route: ReturnType<typeof routeSnapshot>;
  costMicros: number | null;
  costSource: "provider_reported" | "estimated" | "unknown";
  price: PriceSnapshot | null;
  attempts: number;
  structuredOutput: "native" | "prompted" | "none";
  usageKey: string | null;
}

async function hasHardCap(db: Db, workspace: Workspace) {
  if (workspace.monthlyBudgetMicros != null) return true;
  const ent = await planEntitlements(db, workspace.id);
  return ent?.monthlyUsageCapMicros != null;
}

function promptChars(req: HubChatRequest) {
  return req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0) + JSON.stringify(req.tools ?? []).length + JSON.stringify(req.schema ?? {}).length;
}

function waitMs(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs != null) return Math.min(retryAfterMs, 30_000);
  return Math.round(Math.random() * Math.min(8000, 500 * 2 ** (attempt - 1)));
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => (signal.removeEventListener("abort", onAbort), resolve()), ms);
    const onAbort = () => (clearTimeout(t), reject(signal.reason ?? new Error("aborted")));
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The single entry point for an AI call: permission → capability → budget (defensible max; unknown price under a
 * hard cap is refused unless the owner's policy allows it) → transport with bounded retries → normalise →
 * settle + ai_attempt. Every attempt re-reads the connection (rotation and revocation take effect immediately)
 * and the actor's membership (a mid-run permission change is honoured).
 */
export async function executeAi(db: Db, input: ExecuteInput): Promise<ExecuteResult> {
  const { route, workspace } = input;
  const def = getProviderDef(route.provider);
  if (!def) throw new HubError("AI_PROVIDER_NOT_AVAILABLE", `${route.provider} isn't available`);
  const max = Math.min(Math.max(1, input.maxAttempts ?? MAX_AI_ATTEMPTS), 5);
  const soMode = structuredOutputMode(route.capabilities, input.request.schema);
  const price = route.pricing as PriceSnapshot | null;

  const record = (a: Partial<typeof schema.aiAttempt.$inferInsert> & { attempt: number; outcome: string; costSource: string }) =>
    db.insert(schema.aiAttempt).values({
      workspaceId: workspace.id,
      requestId: input.requestId,
      runId: input.runId ?? null,
      agentRunId: input.agentRunId ?? null,
      nodeId: input.nodeId ?? null,
      purpose: input.purpose,
      provider: route.provider,
      connectionId: route.connectionId,
      modelId: route.modelId,
      protocol: route.protocol,
      policy: workspace.aiPolicy?.mode ?? "MANUAL",
      priceSnapshot: price,
      ...a,
    });

  for (let attempt = 1; ; attempt++) {
    // 1. Permission (live): member with ai.use AND listed in the connection's use_roles.
    const [conn] = await db.select().from(schema.aiConnection).where(and(eq(schema.aiConnection.id, route.connectionId), eq(schema.aiConnection.workspaceId, workspace.id)));
    if (!conn) throw new HubError("AI_CONNECTION_MISSING", "The AI connection this uses no longer exists in this workspace. Pick another model.");
    const [m] = await db
      .select({ role: schema.workspaceMember.role })
      .from(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, workspace.id), eq(schema.workspaceMember.userId, input.actorUserId)));
    if (conn.status !== "REVOKED" && !roleMayUse(m?.role, conn)) {
      await record({ attempt, outcome: "refused", errorCode: "AI_ROUTE_FORBIDDEN", costSource: "unknown" });
      throw new HubError("AI_ROUTE_FORBIDDEN", `The person this runs for isn't allowed to use the AI connection "${conn.label}". An owner can allow their role in Settings → AI Providers.`);
    }
    // 2. Credentials (decrypted per attempt; revoked → clear error, never a fallback).
    const creds = loadCredentials(conn);

    // 3. Budget: reserve a defensible maximum before sending anything.
    const maxCost = maxCostMicros(price, promptChars(input.request), input.request.maxTokens);
    if (maxCost == null && !workspace.aiPolicy?.allowUnknownCost && (await hasHardCap(db, workspace))) {
      await record({ attempt, outcome: "refused", errorCode: "AI_COST_UNKNOWN", costSource: "unknown" });
      throw new HubError(
        "AI_COST_UNKNOWN",
        `The price of ${route.modelId} is unknown and this workspace has a spending cap, so the call was not sent. Add its price in Settings → Usage (ai:${route.provider}/${route.modelId}) or allow unknown-cost calls.`,
      );
    }
    const usageKey = input.metering === "hub" ? `${input.requestId}:${attempt}` : null;
    if (usageKey) {
      try {
        await reserveUsage(db, { workspaceId: workspace.id, runId: input.runId ?? null, nodeId: input.nodeId ?? null, agentRunId: input.agentRunId ?? undefined, kind: "ai", idempotencyKey: usageKey, retry: attempt > 1, estimatedMicros: maxCost ?? 0, provider: route.provider, model: route.modelId, unpriced: maxCost == null });
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          await record({ attempt, outcome: "refused", errorCode: "BUDGET_EXCEEDED", costSource: "unknown", usageKey });
          throw new HubError("BUDGET_EXCEEDED", e.message);
        }
        throw e;
      }
    }

    // 4. Call.
    const started = Date.now();
    try {
      const result = await callChat(def, route.protocol, creds, route.modelId, input.request, route.capabilities, input.signal);
      const latencyMs = Date.now() - started;
      const estimated = costMicros(price, result.usage);
      const [cost, source] = result.providerCostMicros != null ? [result.providerCostMicros, "provider_reported" as const] : estimated != null ? [estimated, "estimated" as const] : [null, "unknown" as const];
      const u = result.usage;
      // Fencing: the connection must still be the one (same credential version, not revoked) that was read before
      // the call. The provider may have billed the call, so the ledger is settled either way; the RESULT is discarded.
      const [fresh] = await db.select({ status: schema.aiConnection.status, credVersion: schema.aiConnection.credVersion }).from(schema.aiConnection).where(eq(schema.aiConnection.id, conn.id));
      if (!fresh || fresh.status === "REVOKED" || fresh.credVersion !== conn.credVersion) {
        const revoked = !fresh || fresh.status === "REVOKED";
        if (usageKey) await settleUsage(db, usageKey, { costMicros: cost ?? 0, inputTokens: u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0), outputTokens: u.outputTokens + (u.reasoningTokens ?? 0), unpriced: cost == null });
        const code = revoked ? "AI_CONNECTION_REVOKED" : "AI_CONNECTION_CHANGED";
        await record({ attempt, outcome: "error", errorCode: code, latencyMs, httpStatus: 200, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens, reasoningTokens: u.reasoningTokens, costSource: source, costMicros: cost, usageKey });
        const err = revoked
          ? new HubError(code, `The AI connection "${conn.label}" was disconnected while this call was running. Its answer was discarded; nothing falls back to another key.`)
          : new HubError(code, `The key of "${conn.label}" was replaced while this call was running. Its answer was discarded.`, { retryable: true });
        // Already recorded and settled above: the catch below must not record it again.
        if (!err.retryable || input.signal.aborted || attempt >= max) throw Object.assign(err, { recorded: true });
        await input.onRetry?.({ attempt, code, waitMs: 0 });
        continue;
      }
      if (usageKey) {
        await settleUsage(db, usageKey, { costMicros: cost ?? 0, inputTokens: u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0), outputTokens: u.outputTokens + (u.reasoningTokens ?? 0), unpriced: cost == null });
      }
      await record({ attempt, outcome: "success", latencyMs, httpStatus: 200, inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens, reasoningTokens: u.reasoningTokens, costSource: source, costMicros: cost, usageKey });
      const now = new Date();
      await db.update(schema.aiConnection).set({ lastUsedAt: now, ...(conn.status === "DEGRADED" ? { status: "CONNECTED", lastError: null } : {}) }).where(eq(schema.aiConnection.id, conn.id));
      await db
        .update(schema.aiConnectionModel)
        .set({ accessConfirmedAt: now, lastError: null })
        .where(and(eq(schema.aiConnectionModel.connectionId, conn.id), eq(schema.aiConnectionModel.modelId, route.modelId)));
      return { result, route: routeSnapshot(route), costMicros: cost, costSource: source, price, attempts: attempt, structuredOutput: soMode, usageKey };
    } catch (e) {
      if ((e as { recorded?: boolean }).recorded) throw e;
      if (usageKey) await releaseUsage(db, usageKey);
      if (!(e instanceof HubError)) throw e; // cancellation or a programming error: surface as-is
      await record({ attempt, outcome: e.code === "AI_TIMEOUT" ? "timeout" : "error", errorCode: e.code, httpStatus: e.httpStatus ?? null, latencyMs: Date.now() - started, costSource: "unknown", usageKey });
      const at = new Date().toISOString();
      if (e.code === "AI_AUTH_FAILED" || e.code === "AI_FORBIDDEN") {
        await db.update(schema.aiConnection).set({ status: "DEGRADED", lastError: { code: e.code, message: e.message, at } }).where(eq(schema.aiConnection.id, conn.id));
      }
      if (e.code === "AI_MODEL_REMOVED") {
        await db
          .insert(schema.aiConnectionModel)
          .values({ connectionId: conn.id, workspaceId: workspace.id, modelId: route.modelId, listed: false, removedAt: new Date(), lastError: { code: e.code, message: e.message, at } })
          .onConflictDoUpdate({ target: [schema.aiConnectionModel.connectionId, schema.aiConnectionModel.modelId], set: { removedAt: new Date(), lastError: { code: e.code, message: e.message, at } } });
      }
      if (input.signal.aborted || !e.retryable || attempt >= max) throw e;
      const w = waitMs(attempt, e.retryAfterMs);
      await input.onRetry?.({ attempt, code: e.code, waitMs: w });
      await sleep(w, input.signal);
    }
  }
}
