import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiRouteRef } from "@/db/schema";
import { resolvePrice } from "./pricing";
import { primaryProtocol } from "./protocols";
import { getProviderDef, isConnectable, LEGACY_LOCAL_PROVIDERS } from "./registry";
import { HubError, UNKNOWN_CAPABILITIES, type ResolvedRoute } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID.test(v);

type Workspace = typeof schema.workspace.$inferSelect;

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
  /** The node's / agent's pinned route. */
  pin?: AiRouteRef | null;
  /** Pre-hub node config `model` string (no route): only honoured when the default connection lists that model. */
  legacyModel?: string | null;
}

/**
 * MANUAL routing (Wave A): explicit → pin → workspace default. Never falls back to another connection, to a server
 * key or to an environment variable: a missing / revoked / foreign connection is an error.
 */
export async function resolveRoute(db: Db, workspace: Workspace, input: RouteInput): Promise<ResolvedRoute> {
  const legacyLocal = LEGACY_LOCAL_PROVIDERS.has((workspace.aiProvider ?? "").toLowerCase());
  let ref: AiRouteRef | null = null;
  let source: ResolvedRoute["source"] = "workspace-default";
  if (input.explicit) [ref, source] = [input.explicit, "explicit"];
  else if (input.pin) [ref, source] = [input.pin, "node"];
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
  if (access?.removedAt) throw new HubError("AI_MODEL_REMOVED", `${ref.modelId} isn't offered by the connection "${conn.label}" anymore. Pick another model.`);
  if (!access && conn.catalogRefreshedAt && !conn.catalogStale) {
    throw new HubError("AI_MODEL_NOT_LISTED", `${ref.modelId} isn't in the model list of "${conn.label}". Refresh the models or pick another one.`);
  }
  const [cat] = await db
    .select()
    .from(schema.aiModel)
    .where(and(eq(schema.aiModel.provider, conn.provider), eq(schema.aiModel.modelId, ref.modelId)));
  return {
    kind: "workspace",
    provider: conn.provider,
    connectionId: conn.id,
    connectionLabel: conn.label,
    modelId: ref.modelId,
    protocol: primaryProtocol(def),
    source,
    capabilities: cat?.capabilities ?? UNKNOWN_CAPABILITIES,
    pricing: resolvePrice(workspace.prices ?? {}, conn.provider, ref.modelId, cat?.pricing),
  };
}

/** The route snapshot persisted with run steps / published versions (no secrets, no prices). */
export function routeSnapshot(r: ResolvedRoute) {
  return { provider: r.provider, connectionId: r.connectionId, connectionLabel: r.connectionLabel, modelId: r.modelId, protocol: r.protocol, source: r.source };
}
