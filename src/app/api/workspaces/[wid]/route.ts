import { z } from "zod";
import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { json, parseBody, route } from "@/server/http";
import { updateWorkspace } from "@/server/workspaces";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace, role } = await requireWorkspace(user, (await params).wid);
  return json({ workspace, role });
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "workspace.settings");
  const patch = await parseBody(
    req,
    z.object({
      name: z.string().optional(),
      timezone: z.string().optional(),
      monthlyBudget: z.number().nullable().optional(),
      maxConcurrentRuns: z.number().int().optional(),
      maxQueuedRuns: z.number().int().optional(),
      maxMonthlyExecutions: z.number().int().nullable().optional(),
      aiProvider: z.enum(["ollama", "anthropic"]).nullable().optional(),
      aiModel: z.string().max(120).nullable().optional(),
      prices: z.record(z.string(), z.object({ inputPerMTok: z.number().optional(), outputPerMTok: z.number().optional(), perCall: z.number().optional() })).optional(),
    }),
  );
  const updated = await updateWorkspace(workspace.id, patch);
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "settings.updated", targetType: "workspace", targetId: workspace.id, data: { changed: Object.keys(patch) } });
  return json({ workspace: updated });
});
