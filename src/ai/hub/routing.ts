import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiPolicy, AiRouteRef } from "@/db/schema";
import { catalogueKey } from "./catalogue";
import { isVerifiedZeroPrice, maxCostMicros, requestInputChars, resolvePrice, type PriceSnapshot } from "./pricing";
import { primaryProtocol } from "./protocols";
import { getProviderDef, isConnectable, LEGACY_LOCAL_PROVIDERS, type ProviderDefinition } from "./registry";
import { HubError, UNKNOWN_CAPABILITIES, type HubChatRequest, type ResolvedRoute } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID.test(v);

type Workspace = typeof schema.workspace.$inferSelect;
type Conn = typeof schema.aiConnection.$inferSelect;

export const NOT_CONFIGURED_MESSAGE = "No AI model is set up for this. Connect a provider in Settings → AI Providers, then pick a model for this step or a workspace default.";
export const LOCAL_MIGRATION_MESSAGE =
  "This uses a local Ollama model, and local AI is no longer supported (Flowline is cloud-only). Connect a cloud provider in Settings → AI Providers and pick a model here; nothing was converted automatically.";

export function isRouteRef(v: unknown): v is AiRouteRef {
  const r = v as AiRouteRef | null;
  return Boolean(r && typeof r === "object" && typeof r.connectionId === "string" && isUuid(r.connectionId) && typeof r.modelId === "string" && r.modelId.length > 0 && r.modelId.length <= 200);
}

export interface RouteInput {
  /** An explicit per-call choice (e.g. a connection test). */
  explicit?: AiRouteRef | null;
  /** The node's / agent version's / Copilot setting's pinned route. */
  pin?: AiRouteRef | null;
  /** Where the pin came from (run meta). */
  pinSource?: "node" | "agent" | "copilot";
  /** Pre-hub node config `model` string (no route): only honoured when the default connection lists that model. */
  legacyModel?: string | null;
}

/**
 * Builds a route for one connection + model: the connection must be this workspace's, not revoked, of a connectable
 * provider, and the model must not be removed from (or absent from a fresh) listing. Capabilities come from the
 * public catalogue (tri-state; provider-wide UNSUPPORTED facts applied), the price from workspace table → catalogue.
 */
export interface RouteOptions {
  /**
   * A fallback-eligible model problem (removed from / not in the connection's listing) doesn't throw here: the route
   * is returned marked `unavailable`, so the policy planner can move to the approved fallback routes (CXH-13). A
   * missing / revoked / foreign connection or an unavailable provider still throws at once.
   */
  deferUnavailable?: boolean;
}

/** Route options for a workspace's calls: only a policy with other routes to try defers unavailable models. */
export function deferFor(workspace: Pick<Workspace, "aiPolicy">): RouteOptions {
  return { deferUnavailable: (workspace.aiPolicy?.mode ?? "MANUAL") !== "MANUAL" };
}

export async function routeFor(db: Db, workspace: Workspace, ref: AiRouteRef, source: ResolvedRoute["source"], opts: RouteOptions = {}): Promise<ResolvedRoute> {
  const [conn] = await db
    .select()
    .from(schema.aiConnection)
    .where(and(eq(schema.aiConnection.id, ref.connectionId), eq(schema.aiConnection.workspaceId, workspace.id)));
  if (!conn) throw new HubError("AI_CONNECTION_MISSING", "The AI connection this uses no longer exists in this workspace. Pick another model.");
  if (conn.status === "REVOKED") throw new HubError("AI_CONNECTION_REVOKED", `The AI connection "${conn.label}" was disconnected. Choose another connection or reconnect it in Settings → AI Providers.`);
  const def = getProviderDef(conn.provider);
  if (!def || !isConnectable(def)) throw new HubError("AI_PROVIDER_NOT_AVAILABLE", `${def?.name ?? conn.provider} isn't available`);

  const [access] = await db
    .select()
    .from(schema.aiConnectionModel)
    .where(and(eq(schema.aiConnectionModel.connectionId, conn.id), eq(schema.aiConnectionModel.modelId, ref.modelId)));
  const unavailable: ResolvedRoute["unavailable"] = access?.removedAt
    ? { code: "AI_MODEL_REMOVED", message: `${ref.modelId} isn't offered by the connection "${conn.label}" anymore. Pick another model.` }
    : !access && conn.catalogRefreshedAt && !conn.catalogStale
      ? { code: "AI_MODEL_NOT_LISTED", message: `${ref.modelId} isn't in the model list of "${conn.label}". Refresh the models or pick another one.` }
      : undefined;
  if (unavailable && !opts.deferUnavailable) throw new HubError(unavailable.code, unavailable.message);
  const route = await buildRoute(db, workspace, conn, def, ref.modelId, source);
  return unavailable ? { ...route, unavailable } : route;
}

async function buildRoute(db: Db, workspace: Workspace, conn: Conn, def: ProviderDefinition, modelId: string, source: ResolvedRoute["source"]): Promise<ResolvedRoute> {
  const keys = [...new Set([modelId, catalogueKey(modelId)])];
  const cats = await db
    .select()
    .from(schema.aiModel)
    .where(and(eq(schema.aiModel.provider, conn.provider), inArray(schema.aiModel.modelId, keys)));
  const cat = cats.find((c) => c.modelId === modelId) ?? cats[0];
  const pricing = resolvePrice(workspace.prices ?? {}, conn.provider, modelId, cat?.pricing, { currency: workspace.currency, region: conn.settings?.region ?? null });
  return {
    kind: "workspace",
    provider: conn.provider,
    connectionId: conn.id,
    connectionLabel: conn.label,
    modelId,
    protocol: primaryProtocol(def, conn.settings ?? {}),
    source,
    capabilities: { ...UNKNOWN_CAPABILITIES, ...(cat?.capabilities ?? {}), ...(def.capabilityFloor ?? {}) },
    pricing,
    free: { zeroPriced: isVerifiedZeroPrice(pricing), note: cat?.freeTierNote ?? null },
  };
}

/**
 * Route resolution: explicit → pin (node / agent version / Copilot setting) → workspace default. Never falls back to
 * another connection, to a server key or to an environment variable here: a missing / revoked / foreign connection
 * is an error. (Fallback between routes is a POLICY decision, made in `planRoutes` with explicitly listed routes.)
 */
export async function resolveRoute(db: Db, workspace: Workspace, input: RouteInput, opts: RouteOptions = {}): Promise<ResolvedRoute> {
  const legacyLocal = LEGACY_LOCAL_PROVIDERS.has((workspace.aiProvider ?? "").toLowerCase());
  let ref: AiRouteRef | null = null;
  let source: ResolvedRoute["source"] = "workspace-default";
  if (input.explicit) [ref, source] = [input.explicit, "explicit"];
  else if (input.pin) [ref, source] = [input.pin, input.pinSource ?? "node"];
  else if (input.legacyModel) {
    // A pre-hub model override. With a legacy local workspace it names an Ollama model: refuse, never reinterpret.
    if (legacyLocal) throw new HubError("AI_LOCAL_MIGRATION_REQUIRED", LOCAL_MIGRATION_MESSAGE);
    const def = workspace.aiDefaultRoute;
    if (!isRouteRef(def)) throw new HubError("AI_ROUTE_MIGRATION_REQUIRED", `This step names the model "${input.legacyModel}" from the old server configuration. Pick a model from a connection in the step's settings.`);
    const [listed] = await db
      .select()
      .from(schema.aiConnectionModel)
      .where(and(eq(schema.aiConnectionModel.connectionId, def.connectionId), eq(schema.aiConnectionModel.modelId, input.legacyModel)));
    if (!listed) throw new HubError("AI_ROUTE_MIGRATION_REQUIRED", `This step names the model "${input.legacyModel}", which the default connection doesn't offer. Pick a model from a connection in the step's settings.`);
    [ref, source] = [{ connectionId: def.connectionId, modelId: input.legacyModel }, "legacy-node-model"];
  } else if (isRouteRef(workspace.aiDefaultRoute)) ref = workspace.aiDefaultRoute;
  if (!ref) {
    if (legacyLocal) throw new HubError("AI_LOCAL_MIGRATION_REQUIRED", LOCAL_MIGRATION_MESSAGE);
    throw new HubError("AI_NOT_CONFIGURED", NOT_CONFIGURED_MESSAGE);
  }
  if (!isRouteRef(ref)) throw new HubError("AI_CONNECTION_MISSING", "The AI route on this step is invalid. Pick a model again.");
  return routeFor(db, workspace, ref, source, opts);
}

/** The route snapshot persisted with run steps / published versions (no secrets, no prices). */
export function routeSnapshot(r: ResolvedRoute) {
  return { provider: r.provider, connectionId: r.connectionId, connectionLabel: r.connectionLabel, modelId: r.modelId, protocol: r.protocol, source: r.source };
}

/* ───────────── policies ───────────── */

export const DEFAULT_POLICY: AiPolicy = { mode: "MANUAL", allowUnknownCost: false };

export interface PlannedRoute {
  route: ResolvedRoute;
  /** Why this route is in the plan ("primary", "fallback #2", "low-cost rank 1 (max 1200 µ)", …). */
  reason: string;
}
export interface SkippedRoute {
  ref: AiRouteRef;
  code: string;
  reason: string;
}
export interface RoutePlan {
  mode: AiPolicy["mode"];
  plan: PlannedRoute[];
  skipped: SkippedRoute[];
}

function sameRef(a: AiRouteRef, b: AiRouteRef) {
  return a.connectionId === b.connectionId && a.modelId === b.modelId;
}

/** Privacy policy: only routes whose provider documents no training on API data. Gateways can't guarantee upstream terms. */
export function privacyAllows(policy: AiPolicy, route: ResolvedRoute): string | null {
  if (!policy.requireNoTraining) return null;
  const def = getProviderDef(route.provider);
  if (!def) return "unknown provider";
  if (def.privacy.training !== "no") return `${def.name}'s data use is "${def.privacy.training}" (${def.privacy.note})`;
  return null;
}

/** Whether the route can serve this request at all (tri-state: only UNSUPPORTED is a hard no). */
export function capabilityProblem(route: ResolvedRoute, req: HubChatRequest, stream: boolean): string | null {
  if (req.tools?.length && route.capabilities.tools === "UNSUPPORTED") return "tool calls are unsupported";
  if (stream && route.capabilities.streaming === "UNSUPPORTED") return "streaming is unsupported";
  return null;
}

/**
 * Plans the ordered routes an AI call may use under the workspace policy:
 * - MANUAL: the resolved route only.
 * - FALLBACK: the resolved route, then the explicitly listed fallback routes (in order). Nothing else, ever.
 * - FREE_ONLY: routes (resolved first, then fallbacks) whose price is VERIFIED zero. Unknown / paid → refused; none → fail closed.
 * - LOW_COST: the resolved route and the approved pool, capability-compatible, with a KNOWN price within the ceiling,
 *   cheapest (defensible max) first. Unknown prices are never "within" a ceiling.
 * Every mode applies the privacy policy. Unresolvable listed routes are skipped with their reason (visible in run meta).
 */
export async function planRoutes(db: Db, workspace: Workspace, primary: ResolvedRoute, req: HubChatRequest, opts: { policy?: AiPolicy; stream?: boolean } = {}): Promise<RoutePlan> {
  const policy = opts.policy ?? workspace.aiPolicy ?? DEFAULT_POLICY;
  const mode = policy.mode ?? "MANUAL";
  const skipped: SkippedRoute[] = [];
  const primaryRef = { connectionId: primary.connectionId, modelId: primary.modelId };

  const extra = mode === "FALLBACK" || mode === "FREE_ONLY" ? (policy.fallbackRoutes ?? []) : mode === "LOW_COST" ? (policy.lowCostPool ?? []) : [];
  const candidates: { route: ResolvedRoute; label: string }[] = [{ route: primary, label: "primary" }];
  let n = 0;
  for (const ref of extra.slice(0, 10)) {
    if (!isRouteRef(ref) || sameRef(ref, primaryRef) || candidates.some((c) => sameRef({ connectionId: c.route.connectionId, modelId: c.route.modelId }, ref))) continue;
    n++;
    try {
      candidates.push({ route: await routeFor(db, workspace, ref, "policy"), label: mode === "LOW_COST" ? `pool #${n}` : `fallback #${n}` });
    } catch (e) {
      if (!(e instanceof HubError)) throw e;
      skipped.push({ ref, code: e.code, reason: e.message });
    }
  }

  const kept: { route: ResolvedRoute; label: string; max: number | null }[] = [];
  for (const c of candidates) {
    const ref = { connectionId: c.route.connectionId, modelId: c.route.modelId };
    if (c.route.unavailable) {
      // MANUAL has nothing else to try: the same immediate refusal as before. Other modes skip it (visible in meta).
      if (mode === "MANUAL") throw new HubError(c.route.unavailable.code, c.route.unavailable.message);
      skipped.push({ ref, code: c.route.unavailable.code, reason: c.route.unavailable.message });
      continue;
    }
    const priv = privacyAllows(policy, c.route);
    if (priv) {
      skipped.push({ ref, code: "AI_PRIVACY_POLICY", reason: `Refused by the workspace privacy policy: ${priv}` });
      continue;
    }
    const cap = capabilityProblem(c.route, req, opts.stream === true);
    if (cap) {
      skipped.push({ ref, code: "AI_CAPABILITY_UNSUPPORTED", reason: `${c.route.modelId}: ${cap}` });
      continue;
    }
    const max = maxCostMicros(c.route.pricing as PriceSnapshot | null, requestInputChars(req), req.maxTokens);
    if (mode === "FREE_ONLY" && !c.route.free?.zeroPriced) {
      skipped.push({ ref, code: "AI_NOT_FREE", reason: c.route.pricing ? `${c.route.modelId} has a price (not verified zero)` : `${c.route.modelId}'s price is unknown (unknown is never free)` });
      continue;
    }
    if (mode === "LOW_COST") {
      const ceil = policy.priceCeiling;
      const p = c.route.pricing;
      if (!p || max == null) {
        skipped.push({ ref, code: "AI_COST_UNKNOWN", reason: `${c.route.modelId}'s price is unknown, so it can't be shown to be within the ceiling` });
        continue;
      }
      if (ceil && ((p.inputPerMTokMicros ?? Infinity) > ceil.inputPerMTokMicros || (p.outputPerMTokMicros ?? Infinity) > ceil.outputPerMTokMicros)) {
        skipped.push({ ref, code: "AI_ABOVE_PRICE_CEILING", reason: `${c.route.modelId} costs more than the ceiling` });
        continue;
      }
    }
    kept.push({ ...c, max });
  }

  if (mode === "LOW_COST") kept.sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  const plan = kept.map((k, i) => ({ route: k.route, reason: mode === "LOW_COST" ? `low-cost rank ${i + 1} (${k.label}, max ${k.max} µ)` : k.label }));

  if (!plan.length) {
    const why = skipped.map((s) => `${s.ref.modelId}: ${s.reason}`).join("; ").slice(0, 600);
    if (mode === "FREE_ONLY") throw new HubError("AI_NO_FREE_ROUTE", `The workspace only allows verified free AI routes, and none is available for this call (${why}). Nothing was sent.`);
    if (mode === "LOW_COST") throw new HubError("AI_NO_ROUTE_WITHIN_CEILING", `No approved route with a known price within the ceiling can serve this call (${why}). Nothing was sent.`);
    const first = skipped[0];
    throw new HubError(first?.code ?? "AI_NOT_CONFIGURED", first ? `${first.reason.replace(/\.$/, "")}. Nothing was sent.` : NOT_CONFIGURED_MESSAGE);
  }
  return { mode, plan, skipped };
}

/** Errors after which a policy may move on to the next planned route. Everything else stops the call. */
export const FALLBACK_ELIGIBLE = new Set([
  "AI_RATE_LIMITED",
  "AI_PROVIDER_ERROR",
  "AI_TIMEOUT",
  "AI_UNAVAILABLE",
  "AI_OVERLOADED",
  "AI_STREAM_INTERRUPTED",
  "AI_BAD_RESPONSE",
  "AI_MODEL_REMOVED",
  "AI_MODEL_NOT_LISTED",
  "AI_QUOTA_EXCEEDED",
  "AI_CIRCUIT_OPEN",
  "AI_ROUTING_UNAVAILABLE",
  "AI_CONTEXT_TOO_LONG",
  "AI_CAPABILITY_UNSUPPORTED",
  "AI_COST_UNKNOWN",
  "AI_CONNECTION_CHANGED",
  "AI_RESPONSE_TOO_LARGE",
]);
/**
 * Never a reason to try another route: auth refusals (bad key, 403, the actor not allowed), a revoked or missing
 * connection, a safety refusal, a cancellation, the budget, a forbidden plan/trial key, an invalid request, privacy.
 */
export const FALLBACK_NEVER = new Set([
  "AI_AUTH_FAILED",
  "AI_FORBIDDEN",
  "AI_ROUTE_FORBIDDEN",
  "AI_CONNECTION_REVOKED",
  "AI_CONNECTION_MISSING",
  "AI_CREDENTIAL_UNREADABLE",
  "AI_SAFETY_REFUSAL",
  "AI_CANCELLED",
  "BUDGET_EXCEEDED",
  "AGENT_COST_LIMIT",
  "AI_ATTEMPT_CONFLICT",
  "AI_PLAN_NOT_ALLOWED",
  "AI_TRIAL_KEY",
  "AI_BAD_REQUEST",
  "AI_PRIVACY_POLICY",
  "AI_REGION_UNSUPPORTED",
  "AI_ACCOUNT_ACTION_REQUIRED",
]);

export function mayFallback(code: string) {
  return FALLBACK_ELIGIBLE.has(code) && !FALLBACK_NEVER.has(code);
}
