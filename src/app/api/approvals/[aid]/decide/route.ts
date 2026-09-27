import { z } from "zod";
import { db } from "@/db";
import { requireApproval, requireUser } from "@/server/access";
import { decide } from "@/server/approvals";
import { audit, userActor } from "@/server/audit";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ aid: string }> };

export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { approval } = await requireApproval(user, (await params).aid, "approval.decide");
  const b = await parseBody(req, z.object({ decision: z.enum(["approve", "reject", "done", "retry", "fail"]), note: z.string().max(500).optional() }));
  const result = await decide(db, { workspaceId: approval.workspaceId, approvalId: approval.id, userId: user.id, decision: b.decision, note: b.note });
  await audit(db, { workspaceId: approval.workspaceId, actor: userActor(user), action: "approval.decided", targetType: "approval", targetId: approval.id, data: { decision: b.decision, action: approval.actionId, kind: approval.kind } });
  return json(result);
});
