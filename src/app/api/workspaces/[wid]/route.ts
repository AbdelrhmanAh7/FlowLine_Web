import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
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
  const { workspace } = await requireWorkspace(user, (await params).wid, "owner");
  const patch = await parseBody(req, z.object({ name: z.string().optional(), timezone: z.string().optional() }));
  return json({ workspace: await updateWorkspace(workspace.id, patch) });
});
