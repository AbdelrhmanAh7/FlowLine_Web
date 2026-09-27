import { z } from "zod";
import { db } from "@/db";
import { requireConnection, requireUser } from "@/server/access";
import { deleteConnection, publicConnection, reconnectConnection } from "@/server/connections";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ cid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { connection } = await requireConnection(user, (await params).cid);
  return json({ connection: publicConnection(connection) });
});

/** Reconnect (new credentials for the SAME external account). Paused flows resume; nothing runs automatically. */
export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { connection } = await requireConnection(user, (await params).cid, "editor");
  const { fields } = await parseBody(req, z.object({ fields: z.record(z.string(), z.string().max(4000)) }));
  return json({ connection: await reconnectConnection(db, connection.workspaceId, connection.id, fields) });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { connection } = await requireConnection(user, (await params).cid, "editor");
  await deleteConnection(db, connection.workspaceId, connection.id);
  return json({ ok: true });
});
