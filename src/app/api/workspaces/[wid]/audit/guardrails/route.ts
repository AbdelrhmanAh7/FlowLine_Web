import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { json, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "audit.view");
  const before = Number(new URL(req.url).searchParams.get("before")) || undefined;
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 50, 1), 200);

  const rows = await db
    .select()
    .from(schema.runEvent)
    .where(
      before
        ? and(
            eq(schema.runEvent.workspaceId, workspace.id),
            eq(schema.runEvent.type, "outbound_capped"),
            lt(schema.runEvent.id, before)
          )
        : and(eq(schema.runEvent.workspaceId, workspace.id), eq(schema.runEvent.type, "outbound_capped"))
    )
    .orderBy(desc(schema.runEvent.id))
    .limit(limit + 1);

  const events = rows.slice(0, limit).map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    action: r.type,
    targetType: "run",
    targetId: r.runId,
    data: r.data,
  }));

  return json({ events, nextBefore: rows.length > limit ? rows[limit - 1]!.id : null });
});
