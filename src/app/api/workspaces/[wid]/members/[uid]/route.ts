import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, parseBody, route } from "@/server/http";
import { changeRole, removeMember } from "@/server/members";

type Ctx = { params: Promise<{ wid: string; uid: string }> };

const body = z.object({ role: z.enum(["owner", "editor", "viewer"]) });

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "member.manage");
  const b = await parseBody(req, body);
  return json(await changeRole(user, workspace.id, p.uid, b.role));
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "member.manage");
  await removeMember(user, workspace.id, p.uid);
  return json({ ok: true });
});
