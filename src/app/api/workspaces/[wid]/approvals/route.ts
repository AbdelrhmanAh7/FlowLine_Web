import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { listPendingApprovals } from "@/server/approvals";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return json({ approvals: await listPendingApprovals(db, workspace.id) });
});
