import { z } from "zod";
import { requireUser, requireWorkspace } from "@/server/access";
import { capBody, HttpError, jsonNoStore, notFound, parseBody, route } from "@/server/http";
import { deleteWorkspaceApp, upsertWorkspaceApp } from "@/server/oauth-apps";
import { assertExactOrigin } from "@/server/platform-http";
import { OAUTH_FAMILIES, type OAuthFamily } from "@/server/platform-purposes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ wid: string; family: string }> };

function familyOf(f: string): OAuthFamily {
  if (!(f in OAUTH_FAMILIES)) throw notFound("Unknown provider");
  return f as OAuthFamily;
}

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  assertExactOrigin(req);
  const capped = await capBody(req, 8 * 1024, new HttpError(413, "BODY_TOO_LARGE", "Request body is too large"));
  try {
    return await parseBody(capped, schema);
  } catch (e) {
    // Never echo submitted values (a too-short secret must not come back in the 400 body).
    if (e instanceof HttpError && e.code === "VALIDATION") throw new HttpError(400, "VALIDATION", "Invalid request");
    throw e;
  }
}

/**
 * Create / rotate / switch the workspace's own app for a provider family. Owner-only. `secret` omitted = keep; "" is a
 * validation error. A different client id is a different app: exactly its connections go to reconnect.
 */
export const PUT = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "oauthapp.manage");
  const b = await body(req, z.object({ clientId: z.string().min(1).max(300), secret: z.string().min(1).max(4096).optional(), expectedRevision: z.number().int().min(0) }).strict());
  return jsonNoStore({ app: await upsertWorkspaceApp(user, workspace.id, familyOf(p.family), b) });
});

/** Remove the override: exactly its connections go to reconnect (never silently onto Flowline's app). */
export const DELETE = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const p = await params;
  const { workspace } = await requireWorkspace(user, p.wid, "oauthapp.manage");
  const b = await body(req, z.object({ expectedRevision: z.number().int().min(1) }).strict());
  return jsonNoStore(await deleteWorkspaceApp(user, workspace.id, familyOf(p.family), b.expectedRevision));
});
