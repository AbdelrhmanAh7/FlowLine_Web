import { z } from "zod";
import { requestLocale } from "@/server/email/templates";
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
  const { workspace } = await requireWorkspace(user, (await params).wid, "flow.edit");
  const input = await parseBody(req, z.object({ name: z.string().optional(), templateId: z.string().optional() }));
  // A template's name and step labels are created in the creator's UI language (the request's `fl_locale` cookie).
  return json({ flow: await createFlow(user, workspace.id, input, requestLocale(req)) }, { status: 201 });
});
