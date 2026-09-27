import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { createFlow, listFlows } from "@/server/flows";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return json({ flows: await listFlows(workspace.id) });
});

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "editor");
  const input = await parseBody(req, z.object({ name: z.string().optional(), templateId: z.string().optional() }));
  return json({ flow: await createFlow(user, workspace.id, input) }, { status: 201 });
});
