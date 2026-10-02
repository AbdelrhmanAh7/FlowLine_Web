import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canDecide } from "@/server/approvals";

/** May this member act as the task's named reviewer? ("owner" → the workspace owner only; otherwise owners/editors.) */
export async function reviewerAllowed(workspaceId: string, userId: string, reviewerRole: string) {
  if (!(await canDecide(db, workspaceId, userId))) return false;
  if (reviewerRole !== "owner") return true;
  const [m] = await db.select({ role: schema.workspaceMember.role }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  return m?.role === "owner";
}
