import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { NODE_TYPES, type FlowGraph } from "@/engine/types";
import { BLANK_GRAPH, LOCAL_TEMPLATES } from "@/engine/templates";
import { MAX_EDGES, MAX_NODES, validateGraph } from "@/engine/validate";
import type { CurrentUser } from "./access";
import { consumeFault } from "./faults";
import { HttpError, notFound } from "./http";

const position = z.object({ x: z.number().finite(), y: z.number().finite() });
const nodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(NODE_TYPES),
  position,
  data: z.object({ label: z.string().max(80), config: z.record(z.string(), z.unknown()) }),
});
const edgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1).max(64),
  target: z.string().min(1).max(64),
  sourceHandle: z.string().max(32).nullish(),
  targetHandle: z.string().max(32).nullish(),
});
export const graphSchema = z
  .object({
    nodes: z.array(nodeSchema).max(MAX_NODES),
    edges: z.array(edgeSchema).max(MAX_EDGES),
    viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive() }).optional(),
  })
  .refine((g) => JSON.stringify(g).length < 512 * 1024, "Flow is too large (512KB max)");

export const flowNameSchema = z.string().trim().min(1, "Name is required").max(80);

export async function listFlows(workspaceId: string) {
  const lastRun = sql`(select r.id from ${schema.run} r where r.flow_id = ${schema.flow.id} order by r.created_at desc limit 1)`;
  return db
    .select({
      id: schema.flow.id,
      name: schema.flow.name,
      updatedAt: schema.flow.updatedAt,
      revision: schema.flow.revision,
      nodeCount: sql<number>`jsonb_array_length(${schema.flow.graph} -> 'nodes')::int`,
      hasTrigger: sql<boolean>`exists (select 1 from jsonb_array_elements(${schema.flow.graph} -> 'nodes') n where n ->> 'type' = 'trigger.manual')`,
      lastRunAt: sql<Date | null>`(select r.created_at from ${schema.run} r where r.id = ${lastRun})`,
      lastRunStatus: sql<string | null>`(select r.status::text from ${schema.run} r where r.id = ${lastRun})`,
      runCount: sql<number>`(select count(*)::int from ${schema.run} r where r.flow_id = ${schema.flow.id})`,
      successRate: sql<number | null>`(select case when count(*) filter (where r.status in ('succeeded','failed')) = 0 then null
        else (count(*) filter (where r.status = 'succeeded'))::float / count(*) filter (where r.status in ('succeeded','failed')) end
        from ${schema.run} r where r.flow_id = ${schema.flow.id})`,
    })
    .from(schema.flow)
    .where(and(eq(schema.flow.workspaceId, workspaceId), isNull(schema.flow.deletedAt)))
    .orderBy(desc(schema.flow.updatedAt));
}

export async function createFlow(user: CurrentUser, workspaceId: string, input: { name?: string; templateId?: string }) {
  const template = input.templateId ? LOCAL_TEMPLATES.find((t) => t.id === input.templateId) : undefined;
  if (input.templateId && !template) throw new HttpError(400, "UNKNOWN_TEMPLATE", "That template isn't available");
  const name = flowNameSchema.parse(input.name ?? template?.name ?? "Untitled flow");
  const graph: FlowGraph = structuredClone(template?.graph ?? BLANK_GRAPH);
  const [row] = await db
    .insert(schema.flow)
    .values({ workspaceId, name, graph, templateId: template?.id ?? null, createdBy: user.id, updatedBy: user.id })
    .returning();
  return row;
}

export interface SaveFlowInput {
  name?: string;
  graph?: FlowGraph;
  baseRevision: number;
  /** Explicit save (⌘S) records a version; autosave only updates the draft. */
  createVersion?: boolean;
  /** Offline reconcile: user explicitly chose to overwrite a newer server copy. */
  force?: boolean;
}

export async function saveFlow(user: CurrentUser, flowId: string, input: SaveFlowInput) {
  const fault = consumeFault("save");
  if (fault) throw new HttpError(fault.status, "INJECTED_FAULT", "Injected save failure (test environment)");

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.flow)
      .where(and(eq(schema.flow.id, flowId), isNull(schema.flow.deletedAt)))
      .for("update");
    if (!current) throw notFound("Flow not found");
    if (current.revision !== input.baseRevision) {
      if (!input.force) {
        throw new HttpError(409, "REVISION_CONFLICT", "This flow was changed elsewhere", {
          serverRevision: current.revision,
          serverName: current.name,
          serverGraph: current.graph,
          updatedAt: current.updatedAt,
        });
      }
      // Keep the server copy as a version so the overwrite is recoverable.
      await insertVersion(tx, user, current, "overwrite");
    }
    const [updated] = await tx
      .update(schema.flow)
      .set({
        name: input.name !== undefined ? flowNameSchema.parse(input.name) : current.name,
        graph: input.graph ?? current.graph,
        revision: current.revision + 1,
        updatedAt: new Date(),
        updatedBy: user.id,
      })
      .where(eq(schema.flow.id, flowId))
      .returning();
    const version = input.createVersion ? await insertVersion(tx, user, updated, "save") : null;
    return { flow: updated, version };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function insertVersion(tx: Tx, user: CurrentUser, flow: typeof schema.flow.$inferSelect, reason: "save" | "run" | "overwrite") {
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${schema.flowVersion.version}), 0)::int + 1` })
    .from(schema.flowVersion)
    .where(eq(schema.flowVersion.flowId, flow.id));
  const [v] = await tx
    .insert(schema.flowVersion)
    .values({ flowId: flow.id, version: next, revision: flow.revision, name: flow.name, graph: flow.graph, reason, createdBy: user.id })
    .returning();
  return v;
}

export async function listVersions(flowId: string) {
  return db
    .select({ id: schema.flowVersion.id, version: schema.flowVersion.version, revision: schema.flowVersion.revision, reason: schema.flowVersion.reason, createdAt: schema.flowVersion.createdAt })
    .from(schema.flowVersion)
    .where(eq(schema.flowVersion.flowId, flowId))
    .orderBy(desc(schema.flowVersion.version))
    .limit(50);
}

export async function softDeleteFlow(flowId: string) {
  await db.update(schema.flow).set({ deletedAt: new Date() }).where(eq(schema.flow.id, flowId));
}

export function flowIssues(graph: FlowGraph) {
  return validateGraph(graph);
}
