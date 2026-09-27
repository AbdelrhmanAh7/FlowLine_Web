import { z } from "zod";
import { db } from "@/db";
import { isUuid, requireUser, requireWorkspace } from "@/server/access";
import { json, notFound, parseBody, route } from "@/server/http";
import { deleteSource, reindexSource, setEnabled } from "@/server/knowledge";

type Ctx = { params: Promise<{ wid: string; sid: string }> };

const body = z.object({ enabled: z.boolean().optional(), reindex: z.literal(true).optional() }).strict();

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.sid)) throw notFound("Knowledge source not found");
  const { workspace } = await requireWorkspace(user, p.wid, "knowledge.manage");
  const b = await parseBody(req, body);
  if (b.reindex) return json({ source: await reindexSource(db, workspace.id, p.sid) });
  if (b.enabled !== undefined) return json({ source: await setEnabled(db, user, workspace.id, p.sid, b.enabled) });
  return json({ ok: true });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  if (!isUuid(p.sid)) throw notFound("Knowledge source not found");
  const { workspace } = await requireWorkspace(user, p.wid, "knowledge.manage");
  await deleteSource(db, user, workspace.id, p.sid);
  return json({ ok: true });
});
