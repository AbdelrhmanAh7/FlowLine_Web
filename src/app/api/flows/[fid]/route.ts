import { z } from "zod";
import type { FlowGraph } from "@/engine/types";
import { requireFlow, requireUser } from "@/server/access";
import { consumeFault } from "@/server/faults";
import { flowIssues, flowNameSchema, graphSchema, saveFlow, softDeleteFlow } from "@/server/flows";
import { HttpError, json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ fid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const fault = consumeFault("load");
  if (fault) throw new HttpError(fault.status, "INJECTED_FAULT", "Injected load failure (test environment)");
  const user = await requireUser();
  const { flow, role, workspace } = await requireFlow(user, (await params).fid);
  return json({ flow, role, workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name }, issues: flowIssues(flow.graph) });
});

const saveBody = z.object({
  name: flowNameSchema.optional(),
  graph: graphSchema.optional(),
  baseRevision: z.number().int().positive(),
  createVersion: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  const body = await parseBody(req, saveBody);
  const saved = await saveFlow(user, flow.id, { ...body, graph: body.graph as FlowGraph | undefined });
  return json({ flow: saved.flow, version: saved.version, issues: flowIssues(saved.flow.graph) });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { flow } = await requireFlow(user, (await params).fid, "editor");
  await softDeleteFlow(flow.id);
  return json({ ok: true });
});
