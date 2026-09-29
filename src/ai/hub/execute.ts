import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiPolicy } from "@/db/schema";
import { planEntitlements } from "@/server/entitlements";
import { BudgetExceededError, releaseUsage, reserveUsage, settleUsage } from "@/server/usage";
import { loadCredentials } from "./credentials";
import { roleMayUse } from "./discovery";
import { costMicros, maxCostMicros, type PriceSnapshot } from "./pricing";
import { callChat } from "./protocols";
import { structuredOutputMode } from "./protocols/shared";
import { getProviderDef } from "./registry";
import { mayFallback, planRoutes, routeSnapshot, type RoutePlan } from "./routing";
import { HubError, type HubChatRequest, type NormalisedResult, type ResolvedRoute, type StreamEvent } from "./types";

type Workspace = typeof schema.workspace.$inferSelect;

export const MAX_AI_ATTEMPTS = 3;
/** A Retry-After longer than this is not waited for: the route counts as exhausted (a policy may move on). */
export const MAX_RETRY_WAIT_MS = 30_000;
/** Circuit breaker per connection: `threshold` consecutive transient failures within `windowMs` open it for `coolDownMs`. */
export const BREAKER = { windowMs: 60_000, threshold: 3, coolDownMs: 30_000 };
const TRANSIENT = ["AI_RATE_LIMITED", "AI_PROVIDER_ERROR", "AI_TIMEOUT", "AI_UNAVAILABLE", "AI_OVERLOADED", "AI_STREAM_INTERRUPTED", "AI_BAD_RESPONSE"];

export interface ExecuteInput {
  workspace: Workspace;
  /** The user this call acts for; their permission is re-checked on EVERY attempt (mid-run changes apply). */
  actorUserId: string;
  /** The resolved route (pin or default). The workspace policy decides whether and in which order it is used. */
  route: ResolvedRoute;
  request: HubChatRequest;
  purpose: "node" | "agent" | "copilot" | "connection_test";
  /**
   * "hub": this function reserves / settles the budget ledger (usage_event) per attempt.
   * "caller": the caller keeps its own ledger entries; only ai_attempt rows are written.
   */
  metering: "hub" | "caller";
  /** Stable id for this logical request; attempt n uses `${requestId}:${n}` as its ledger key. */
  requestId: string;
  runId?: string | null;
  agentRunId?: string | null;
  nodeId?: string | null;
  signal: AbortSignal;
  /** Attempts per route (bounded retries). */
  maxAttempts?: number;
  /** Override the workspace policy (connection tests use MANUAL). */
  policy?: AiPolicy;
  /** Stream the answer; deltas and discards are delivered to `onStream`. */
  stream?: boolean;
  onStream?: (e: StreamEvent) => void;
  onRetry?: (info: { attempt: number; code: string; waitMs: number }) => void | Promise<void>;
  onFallback?: (info: { from: ReturnType<typeof routeSnapshot>; to: ReturnType<typeof routeSnapshot>; code: string }) => void | Promise<void>;
}

export interface RoutingInfo {
  policy: AiPolicy["mode"];
  /** Why the route that answered was used. */
  reason: string;
  /** Routes tried before it, with the error that moved the call on. */
  fallbackFrom: { provider: string; connectionId: string; modelId: string; code: string }[];
  /** Listed routes the policy refused (privacy, price, capability, unresolvable). */
  skipped: { connectionId: string; modelId: string; code: string }[];
}

export interface ExecuteResult {
  result: NormalisedResult;
  /** The route that actually answered (may differ from the input route under FALLBACK / LOW_COST / FREE_ONLY). */
  route: ReturnType<typeof routeSnapshot>;
  costMicros: number | null;
  costSource: "provider_reported" | "estimated" | "unknown";
  price: PriceSnapshot | null;
  attempts: number;
  structuredOutput: "native" | "prompted" | "none";
  usageKey: string | null;
  routing: RoutingInfo;
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
  if (retryAfterMs != null) return Math.min(retryAfterMs, MAX_RETRY_WAIT_MS);
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

/** Open when the last `threshold` attempts on the connection (within the window) were all transient failures and the latest is recent. */
export async function circuitOpen(db: Db, connectionId: string, now = Date.now()): Promise<boolean> {
  const rows = await db
    .select({ outcome: schema.aiAttempt.outcome, code: schema.aiAttempt.errorCode, at: schema.aiAttempt.createdAt })
    .from(schema.aiAttempt)
    .where(and(eq(schema.aiAttempt.connectionId, connectionId), gt(schema.aiAttempt.createdAt, new Date(now - BREAKER.windowMs)), inArray(schema.aiAttempt.outcome, ["success", "error", "timeout", "interrupted"])))
    .orderBy(desc(schema.aiAttempt.createdAt), desc(schema.aiAttempt.id))
    .limit(BREAKER.threshold);
  if (rows.length < BREAKER.threshold) return false;
  if (!rows.every((r) => r.outcome !== "success" && TRANSIENT.includes(r.code ?? ""))) return false;
  return rows[0]!.at.getTime() > now - BREAKER.coolDownMs;
}

/**
 * The single entry point for an AI call: policy plan (MANUAL / FALLBACK / FREE_ONLY / LOW_COST, privacy) → per route:
 * permission → circuit breaker → budget (defensible max; unknown price under a hard cap is refused unless the owner's
 * policy allows it) → transport with bounded retries (Retry-After honoured) → normalise → settle + ai_attempt.
 * Every attempt re-reads the connection (rotation and revocation take effect immediately) and the actor's membership.
 * A policy moves to the next route only after errors in FALLBACK_ELIGIBLE — never after an auth refusal, a revoked
 * connection, a safety refusal, a cancellation or the budget. Partial streams are never concatenated across attempts:
 * a failed attempt's deltas are followed by a `discard` event, and only the answering attempt's text is returned.
 */
export async function executeAi(db: Db, input: ExecuteInput): Promise<ExecuteResult> {
  let plan: RoutePlan;
  try {
    plan = await planRoutes(db, input.workspace, input.route, input.request, { policy: input.policy, stream: input.stream });
  } catch (e) {
    // The policy refused every route before anything was sent: recorded, so every refusal is auditable.
    if (e instanceof HubError) {
      const r = input.route;
      await db.insert(schema.aiAttempt).values({
        workspaceId: input.workspace.id,
        requestId: input.requestId,
        runId: input.runId ?? null,
        agentRunId: input.agentRunId ?? null,
        nodeId: input.nodeId ?? null,
        purpose: input.purpose,
        provider: r.provider,
        connectionId: r.connectionId,
        modelId: r.modelId,
        protocol: r.protocol,
        policy: (input.policy ?? input.workspace.aiPolicy)?.mode ?? "MANUAL",
        attempt: 0,
        outcome: "refused",
        errorCode: e.code,
        costSource: "unknown",
        routeReason: "policy refused before sending",
      });
    }
    throw e;
  }
  const counter = { n: 0 };
  const fallbackFrom: RoutingInfo["fallbackFrom"] = [];
  let last: HubError | null = null;
  for (let i = 0; i < plan.plan.length; i++) {
    const step = plan.plan[i]!;
    const reason = i === 0 ? step.reason : `${step.reason} after ${last?.code ?? "error"}`;
    try {
      const r = await executeRoute(db, input, plan, step.route, reason, counter);
      return {
        ...r,
        routing: { policy: plan.mode, reason, fallbackFrom, skipped: plan.skipped.map((s) => ({ connectionId: s.ref.connectionId, modelId: s.ref.modelId, code: s.code })) },
      };
    } catch (e) {
      if (!(e instanceof HubError) || input.signal.aborted) throw e;
      last = e;
      // A later route the actor may not use is skipped (use_roles are respected); the primary's refusal is final.
      const skip = i > 0 && e.code === "AI_ROUTE_FORBIDDEN";
      if (!skip && !mayFallback(e.code)) throw e;
      if (i === plan.plan.length - 1) throw e;
      fallbackFrom.push({ provider: step.route.provider, connectionId: step.route.connectionId, modelId: step.route.modelId, code: e.code });
      await input.onFallback?.({ from: routeSnapshot(step.route), to: routeSnapshot(plan.plan[i + 1]!.route), code: e.code });
    }
  }
  throw last ?? new HubError("AI_NOT_CONFIGURED", "No AI route could be used");
}

async function executeRoute(db: Db, input: ExecuteInput, plan: RoutePlan, route: ResolvedRoute, routeReason: string, counter: { n: number }): Promise<Omit<ExecuteResult, "routing">> {
  const { workspace } = input;
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
      policy: plan.mode,
      priceSnapshot: price,
      routeReason: routeReason.slice(0, 200),
      ...a,
    });

  for (let local = 1; ; local++) {
    const attempt = ++counter.n;
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

    // 3. Circuit breaker (per connection, from recorded attempts — shared by every web/worker process).
    if (await circuitOpen(db, conn.id)) {
      await record({ attempt, outcome: "refused", errorCode: "AI_CIRCUIT_OPEN", costSource: "unknown" });
      throw new HubError("AI_CIRCUIT_OPEN", `"${conn.label}" failed repeatedly in the last minute, so calls to it are paused for ${BREAKER.coolDownMs / 1000}s.`);
    }

    // 4. Budget: reserve a defensible maximum before sending anything.
    const maxCost = maxCostMicros(price, promptChars(input.request), input.request.maxTokens);
    if (maxCost == null && !(input.policy ?? workspace.aiPolicy)?.allowUnknownCost && (await hasHardCap(db, workspace))) {
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
    /** The provider may have billed an attempt that gave no usable result: keep the reservation (defensible max). */
    const settlePossibleCharge = async () => {
      if (usageKey) await settleUsage(db, usageKey, { costMicros: maxCost ?? 0, unpriced: maxCost == null });
    };

    // 5. Call.
    const started = Date.now();
    const attemptKey = `${input.requestId}:${attempt}`;
    const progress = { received: false };
    let streamed = false;
    try {
      const result = await callChat(def, route.protocol, creds, route.modelId, input.request, route.capabilities, input.signal, {
        stream: input.stream === true,
        progress,
        onText: (text) => {
          streamed = true;
          input.onStream?.({ type: "delta", attemptKey, text });
        },
      });
      const latencyMs = Date.now() - started;
      const u = result.usage;
      const reported = result.usageReported !== false;
      const estimated = reported ? costMicros(price, u) : null;
      // Provider-reported cost is in USD: only used as-is for a USD workspace.
      const providerCost = result.providerCostMicros != null && (workspace.currency ?? "USD") === "USD" ? result.providerCostMicros : null;
      const [cost, source] = providerCost != null ? [providerCost, "provider_reported" as const] : estimated != null ? [estimated, "estimated" as const] : [null, "unknown" as const];
      // No usage reported → the real cost is unknown: the ledger keeps the defensible max instead of 0.
      const ledgerCost = cost ?? (reported ? 0 : (maxCost ?? 0));
      const tokens = reported ? { inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens, reasoningTokens: u.reasoningTokens } : {};
      const settle = () =>
        usageKey ? settleUsage(db, usageKey, { costMicros: ledgerCost, inputTokens: u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0), outputTokens: u.outputTokens + (u.reasoningTokens ?? 0), unpriced: cost == null }) : Promise.resolve();
      // Fencing: the connection must still be the one (same credential version, not revoked) that was read before
      // the call. The provider may have billed the call, so the ledger is settled either way; the RESULT is discarded.
      const [fresh] = await db.select({ status: schema.aiConnection.status, credVersion: schema.aiConnection.credVersion }).from(schema.aiConnection).where(eq(schema.aiConnection.id, conn.id));
      if (!fresh || fresh.status === "REVOKED" || fresh.credVersion !== conn.credVersion) {
        const revoked = !fresh || fresh.status === "REVOKED";
        await settle();
        const code = revoked ? "AI_CONNECTION_REVOKED" : "AI_CONNECTION_CHANGED";
        await record({ attempt, outcome: "error", errorCode: code, latencyMs, httpStatus: 200, ...tokens, costSource: source, costMicros: cost, usageKey, possibleCharge: true, servingProvider: result.servingProvider ?? null });
        if (streamed) input.onStream?.({ type: "discard", attemptKey, reason: code });
        const err = revoked
          ? new HubError(code, `The AI connection "${conn.label}" was disconnected while this call was running. Its answer was discarded; nothing falls back to another key.`)
          : new HubError(code, `The key of "${conn.label}" was replaced while this call was running. Its answer was discarded.`, { retryable: true });
        // Already recorded and settled above: the catch below must not record it again.
        if (!err.retryable || input.signal.aborted || local >= max) throw Object.assign(err, { recorded: true });
        await input.onRetry?.({ attempt, code, waitMs: 0 });
        continue;
      }
      await settle();
      await record({ attempt, outcome: "success", latencyMs, httpStatus: 200, ...tokens, costSource: source, costMicros: cost, usageKey, servingProvider: result.servingProvider ?? null });
      const now = new Date();
      await db.update(schema.aiConnection).set({ lastUsedAt: now, ...(conn.status === "DEGRADED" ? { status: "CONNECTED", lastError: null } : {}) }).where(eq(schema.aiConnection.id, conn.id));
      await db
        .update(schema.aiConnectionModel)
        .set({ accessConfirmedAt: now, lastError: null })
        .where(and(eq(schema.aiConnectionModel.connectionId, conn.id), eq(schema.aiConnectionModel.modelId, route.modelId)));
      return { result, route: routeSnapshot(route), costMicros: cost, costSource: source, price, attempts: attempt, structuredOutput: soMode, usageKey };
    } catch (e) {
      if ((e as { recorded?: boolean }).recorded) throw e;
      if (streamed) input.onStream?.({ type: "discard", attemptKey, reason: e instanceof HubError ? e.code : "cancelled" });
      if (!(e instanceof HubError)) {
        // Cancelled by the caller (or a programming error). A cancelled request that was already sent may be billed.
        if (input.signal.aborted) {
          await settlePossibleCharge();
          await record({ attempt, outcome: "cancelled", errorCode: "AI_CANCELLED", latencyMs: Date.now() - started, costSource: "unknown", usageKey, possibleCharge: true });
        } else if (usageKey) await releaseUsage(db, usageKey);
        throw e;
      }
      const possible = e.possibleCharge === true || (progress.received && e.code !== "AI_SAFETY_REFUSAL");
      if (possible) await settlePossibleCharge();
      else if (usageKey) await releaseUsage(db, usageKey);
      const outcome = e.code === "AI_TIMEOUT" ? "timeout" : e.code === "AI_STREAM_INTERRUPTED" ? "interrupted" : "error";
      await record({ attempt, outcome, errorCode: e.code, httpStatus: e.httpStatus ?? null, latencyMs: Date.now() - started, costSource: "unknown", usageKey, possibleCharge: possible });
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
      if (input.signal.aborted || !e.retryable || local >= max) throw e;
      // A Retry-After beyond the cap isn't waited for: this route is exhausted (a policy may try the next one).
      if (e.retryAfterMs != null && e.retryAfterMs > MAX_RETRY_WAIT_MS) throw e;
      const w = waitMs(local, e.retryAfterMs);
      await input.onRetry?.({ attempt, code: e.code, waitMs: w });
      await sleep(w, input.signal);
    }
  }
}
