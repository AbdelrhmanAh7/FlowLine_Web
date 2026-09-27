import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";
import { revokeInvite } from "@/server/members";

type Ctx = { params: Promise<{ wid: string; iid: string }> };

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "member.manage");
  await revokeInvite(user, workspace.id, p.iid);
  return json({ ok: true });
});
