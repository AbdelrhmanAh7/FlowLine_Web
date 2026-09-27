import { z } from "zod";
import { db } from "@/db";
import { requireApproval, requireUser } from "@/server/access";
import { decide } from "@/server/approvals";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ aid: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { approval } = await requireApproval(user, (await params).aid, "editor");
  const b = await parseBody(req, z.object({ decision: z.enum(["approve", "reject", "done", "retry", "fail"]), note: z.string().max(500).optional() }));
  return json(await decide(db, { workspaceId: approval.workspaceId, approvalId: approval.id, userId: user.id, decision: b.decision, note: b.note }));
});
