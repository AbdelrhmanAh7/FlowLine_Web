import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { audit, userActor } from "@/server/audit";
import { jsonNoStore, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

const body = z.object({ allowUnknownCost: z.boolean() }).strict();

/**
 * AI execution policy (owner). Wave A has one mode (MANUAL); the owner decides whether calls whose price is unknown
 * may run while a spending cap applies (default: no — they are refused before anything is sent).
 */
export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "ai.manage");
  const b = await parseBody(req, body);
  const policy = { mode: "MANUAL" as const, allowUnknownCost: b.allowUnknownCost };
  await db.update(schema.workspace).set({ aiPolicy: policy, updatedAt: new Date() }).where(eq(schema.workspace.id, workspace.id));
  await audit(db, { workspaceId: workspace.id, actor: userActor(user), action: "settings.updated", targetType: "workspace", targetId: workspace.id, data: { aiPolicy: policy } });
  return jsonNoStore({ policy });
});
