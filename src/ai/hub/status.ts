import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { Role } from "@/db/schema";
import { roleMayUse } from "./discovery";
import { keyCheckOf } from "./protocols";
import { getProviderDef, isConnectable, LEGACY_LOCAL_PROVIDERS, PROVIDERS, RETIRED_NOT_ADDED } from "./registry";
import { NOT_CONFIGURED_MESSAGE, resolveRoute } from "./routing";
import { testOverride } from "./transport";
import { HubError } from "./types";

/** Registry projection for clients (no hosts beyond the documented ones, nothing secret). */
export function publicProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    tier: p.tier,
    status: p.status,
    connectable: isConnectable(p),
    routeKind: p.routeKind,
    protocols: p.protocols,
    discovery: p.discovery,
    sources: p.sources,
    termsUrl: p.termsUrl,
    verifiedAt: p.verifiedAt,
    requirements: p.requirements,
    contractVerified: p.contractVerified,
    notes: p.notes ?? null,
    verdict: p.verdict,
    verdictEvidence: p.verdictEvidence,
    connectionFields: (p.connectionFields ?? []).map((f) => ({ key: f.key, label: f.label, required: f.required, pattern: f.pattern, options: f.options ?? null, help: f.help ?? null })),
    planWarning: p.planWarning ?? null,
    requiresPlanAttestation: p.requiresPlanAttestation === true,
    keyCheck: isConnectable(p) ? keyCheckOf(p) : ("none" as const),
    freeTier: p.freeTier,
    privacy: p.privacy,
    termsNotes: p.termsNotes ?? null,
  }));
}

/** Services evaluated and deliberately not added (e.g. retired), with their evidence. */
export function retiredProviders() {
  return RETIRED_NOT_ADDED;
}

/**
 * Pre-hub items that can no longer run and need a person to choose a cloud route. Nothing is converted
 * automatically: the settings page lists them in a migration banner.
 */
export async function legacyReport(db: Db, workspaceId: string) {
  const [ws] = await db.select({ aiProvider: schema.workspace.aiProvider, aiModel: schema.workspace.aiModel }).from(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  const localDefault = LEGACY_LOCAL_PROVIDERS.has((ws?.aiProvider ?? "").toLowerCase());
  const agents = await db
    .select({ id: schema.agent.id, name: schema.agent.name, provider: schema.agentVersion.provider, model: schema.agentVersion.model })
    .from(schema.agent)
    .innerJoin(schema.agentVersion, eq(schema.agentVersion.id, schema.agent.currentVersionId))
    .where(and(eq(schema.agent.workspaceId, workspaceId), isNull(schema.agent.deletedAt), inArray(schema.agentVersion.provider, [...LEGACY_LOCAL_PROVIDERS])));
  const flows = localDefault
    ? (await db.select({ id: schema.flow.id, name: schema.flow.name, graph: schema.flow.graph }).from(schema.flow).where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt))))
        .filter((f) => f.graph.nodes.some((n) => n.type.startsWith("ai.") && !(n.data.config as { route?: unknown }).route))
        .map((f) => ({ id: f.id, name: f.name }))
    : [];
  return {
    workspaceDefault: localDefault ? { provider: ws!.aiProvider!, model: ws!.aiModel } : null,
    agents: agents.map((a) => ({ id: a.id, name: a.name, provider: a.provider, model: a.model })),
    flows,
    any: localDefault || agents.length > 0,
  };
}

/** What a member can do with AI in this workspace right now (drives the palette, templates and node config). */
export async function aiStatus(db: Db, workspace: typeof schema.workspace.$inferSelect, role: Role) {
  const conns = await db.select().from(schema.aiConnection).where(eq(schema.aiConnection.workspaceId, workspace.id));
  const usable = conns.filter((c) => roleMayUse(role, c));
  let defaultRoute: { provider: string; providerName: string; connectionId: string; connectionLabel: string; modelId: string } | null = null;
  let defaultError: { code: string; message: string } | null = null;
  try {
    const r = await resolveRoute(db, workspace, {});
    defaultRoute = { provider: r.provider, providerName: getProviderDef(r.provider)?.name ?? r.provider, connectionId: r.connectionId, connectionLabel: r.connectionLabel, modelId: r.modelId };
  } catch (e) {
    defaultError = e instanceof HubError ? { code: e.code, message: e.message } : { code: "AI_NOT_CONFIGURED", message: NOT_CONFIGURED_MESSAGE };
  }
  const defaultUsable = Boolean(defaultRoute && usable.some((c) => c.id === defaultRoute!.connectionId));
  return {
    canUseAny: usable.length > 0,
    usableConnections: usable.length,
    defaultRoute,
    defaultUsable,
    defaultError,
    reason: usable.length === 0 ? (conns.length === 0 ? NOT_CONFIGURED_MESSAGE : "You aren't allowed to use this workspace's AI connections. An owner can allow your role in Settings → AI Providers.") : null,
    testDouble: testOverride() !== null,
  };
}
