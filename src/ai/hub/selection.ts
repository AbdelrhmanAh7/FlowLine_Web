import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { AiRouteRef } from "@/db/schema";
import type { FlowGraph } from "@/engine/types";
import { HttpError } from "@/server/http";
import { roleMayUse } from "./discovery";
import { isRouteRef } from "./routing";

type Route = AiRouteRef;

function routesOf(graph: FlowGraph): Map<string, Route> {
  const out = new Map<string, Route>();
  for (const n of graph.nodes) {
    if (!n.type.startsWith("ai.")) continue;
    const r = (n.data.config as { route?: unknown }).route;
    if (isRouteRef(r)) out.set(n.id, { connectionId: r.connectionId, modelId: r.modelId });
  }
  return out;
}

/**
 * Selection-time check (the execution-time check lives in executeAi): the person saving a graph may only
 * introduce or change AI routes on connections their role may USE. Unchanged routes that someone else chose are
 * left alone (editing an unrelated step must not require access to every connection in the flow).
 */
export async function assertRouteSelection(db: Db, userId: string, workspaceId: string, next: FlowGraph, prev: FlowGraph | null) {
  const before = prev ? routesOf(prev) : new Map<string, Route>();
  const changed = [...routesOf(next).entries()].filter(([id, r]) => {
    const b = before.get(id);
    return !b || b.connectionId !== r.connectionId || b.modelId !== r.modelId;
  });
  if (!changed.length) return;
  await assertRoutesUsable(db, userId, workspaceId, changed.map(([, r]) => r));
}

export async function assertRoutesUsable(db: Db, userId: string, workspaceId: string, routes: Route[]) {
  if (!routes.length) return;
  const ids = [...new Set(routes.map((r) => r.connectionId))];
  const conns = await db
    .select()
    .from(schema.aiConnection)
    .where(and(eq(schema.aiConnection.workspaceId, workspaceId), inArray(schema.aiConnection.id, ids)));
  const [m] = await db
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  for (const id of ids) {
    const c = conns.find((x) => x.id === id);
    if (!c) throw new HttpError(422, "AI_CONNECTION_MISSING", "An AI step uses a connection that doesn't exist in this workspace. Pick a model again.");
    if (c.status === "REVOKED") throw new HttpError(422, "AI_CONNECTION_REVOKED", `The AI connection "${c.label}" was disconnected. Pick another model.`);
    if (!roleMayUse(m?.role, c)) throw new HttpError(403, "AI_ROUTE_FORBIDDEN", `You aren't allowed to use the AI connection "${c.label}".`);
  }
}

/**
 * Publish snapshot: AI steps without their own route get the workspace default route written into the PUBLISHED
 * version (the draft is untouched), so a later change of the default doesn't silently change a published flow.
 * Steps with a legacy `model` string are left as they are (they fail with a migration error, never reinterpreted).
 */
export function pinDefaultRoutes(graph: FlowGraph, def: AiRouteRef | null | undefined): FlowGraph {
  if (!isRouteRef(def)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (!n.type.startsWith("ai.")) return n;
      const cfg = n.data.config as { route?: unknown; model?: string };
      if (isRouteRef(cfg.route) || (cfg.model ?? "").trim()) return n;
      return { ...n, data: { ...n.data, config: { ...n.data.config, route: { connectionId: def.connectionId, modelId: def.modelId } } } } as typeof n;
    }),
  };
}

export function aiRoutesIn(graph: FlowGraph): Route[] {
  return [...routesOf(graph).values()];
}
