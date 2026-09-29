import { z } from "zod";
import { db } from "@/db";
import { requireConnection, requireSession, requireWorkspace } from "@/server/access";
import { startOAuth } from "@/server/connections";
import { json, parseBody, route } from "@/server/http";

const body = z.object({ workspaceId: z.string(), provider: z.string().max(40), connectionId: z.string().optional(), redirectAfter: z.string().max(200).optional() });

/** Starts an OAuth authorization (state + PKCE). Returns the provider URL to navigate to. */
export const POST = route(async (req) => {
  const { user, sessionToken } = await requireSession();
  const b = await parseBody(req, body);
  const { workspace } = await requireWorkspace(user, b.workspaceId, "integration.manage");
  if (b.connectionId) await requireConnection(user, b.connectionId, "integration.manage");
  const redirectAfter = b.redirectAfter?.startsWith("/w/") ? b.redirectAfter : undefined;
  return json(await startOAuth(db, { userId: user.id, sessionToken, workspaceId: workspace.id, providerId: b.provider, connectionId: b.connectionId, redirectAfter }));
});
