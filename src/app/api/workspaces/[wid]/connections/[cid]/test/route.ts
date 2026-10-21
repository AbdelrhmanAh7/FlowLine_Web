import { jsonNoStore, route } from "@/server/http";
import { requireUser } from "@/server/access";
import { testConnection } from "@/server/connection-test";

type Ctx = { params: Promise<{ wid: string; cid: string }> };

/** Test connection: verifies a SAVED connection's credentials. No request body (see `testConnection`). */
export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { wid, cid } = await ctx.params;
  return jsonNoStore(await testConnection(user, wid, cid));
});
