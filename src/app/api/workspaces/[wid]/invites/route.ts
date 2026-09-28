import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { createInvite, listInvites } from "@/server/members";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "member.manage");
  return json({ invites: await listInvites(workspace.id) });
});

const body = z.object({ email: z.string().trim().email().max(254), role: z.enum(["owner", "editor", "viewer"]) });

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "member.manage");
  const b = await parseBody(req, body);
  return json(await createInvite(user, workspace.id, b, req), { status: 201 });
});
