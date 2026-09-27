import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { listAudit } from "@/server/audit";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "audit.view");
  const before = Number(new URL(req.url).searchParams.get("before")) || undefined;
  return json(await listAudit(db, workspace.id, { before }));
});
