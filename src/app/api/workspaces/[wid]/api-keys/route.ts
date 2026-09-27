import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { API_SCOPES, createApiKey, listApiKeys, type ApiScope } from "@/server/apikeys";
import { json, parseBody, route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "apikey.manage");
  return json({ apiKeys: await listApiKeys(workspace.id), scopes: API_SCOPES });
});

const body = z.object({
  name: z.string().trim().min(1).max(60),
  mode: z.enum(["test", "live"]),
  scopes: z.array(z.enum(Object.keys(API_SCOPES) as [ApiScope, ...ApiScope[]])).min(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/** Creates a key. The full key is in this response only; it is never shown or stored again. */
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { workspace } = await requireWorkspace(user, (await params).wid, "apikey.manage");
  const b = await parseBody(req, body);
  return json(await createApiKey(user, workspace.id, b), { status: 201, headers: { "cache-control": "no-store" } });
});
