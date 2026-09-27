import { z } from "zod";
import { db } from "@/db";
import { requireConnection, requireUser } from "@/server/access";
import { deleteConnection, publicConnection, reconnectConnection, setVisibility } from "@/server/connections";
import { audit, userActor } from "@/server/audit";
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
  const { connection } = await requireConnection(user, (await params).cid, "integration.manage");
  const b = await parseBody(req, z.union([z.object({ fields: z.record(z.string(), z.string().max(4000)) }), z.object({ visibility: z.enum(["workspace", "private"]) })]));
  if ("visibility" in b) {
    const changed = await setVisibility(db, user.id, connection.workspaceId, connection.id, b.visibility);
    await audit(db, { workspaceId: connection.workspaceId, actor: userActor(user), action: "settings.updated", targetType: "connection", targetId: connection.id, data: { visibility: b.visibility } });
    return json({ connection: changed });
  }
  const { fields } = b;
  const updated = await reconnectConnection(db, connection.workspaceId, connection.id, fields);
  await audit(db, { workspaceId: connection.workspaceId, actor: userActor(user), action: "integration.reconnected", targetType: "connection", targetId: connection.id, data: { provider: connection.provider } });
  return json({ connection: updated });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { connection } = await requireConnection(user, (await params).cid, "integration.manage");
  await deleteConnection(db, connection.workspaceId, connection.id);
  await audit(db, { workspaceId: connection.workspaceId, actor: userActor(user), action: "integration.deleted", targetType: "connection", targetId: connection.id, data: { provider: connection.provider, label: connection.label } });
  return json({ ok: true });
});
