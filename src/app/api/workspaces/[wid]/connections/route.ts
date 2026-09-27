import { z } from "zod";
import { db } from "@/db";
import { requireUser, requireWorkspace } from "@/server/access";
import { createConnection, listConnections } from "@/server/connections";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid);
  return json({ connections: await listConnections(db, workspace.id) });
});

const body = z.object({ provider: z.string().max(40), label: z.string().max(80).default(""), fields: z.record(z.string(), z.string().max(4000)) });

/** Connect with an API key / token / connection string. Credentials are verified with the provider, encrypted, and never returned. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "editor");
  const b = await parseBody(req, body);
  const connection = await createConnection(db, user.id, workspace.id, b.provider, b.label, b.fields);
  return json({ connection }, { status: 201 });
});
