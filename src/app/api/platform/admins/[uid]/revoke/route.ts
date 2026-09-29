import { z } from "zod";
import { platformWrite } from "@/server/platform-http";
import { revokeAdmin } from "@/server/platform-setup";

export const dynamic = "force-dynamic";

/** Revoke an admin (their elevations are dropped at once). Adding admins is an operator challenge (scripts/admin/bootstrap.mts --grant). */
export const POST = platformWrite<Record<string, never>, { uid: string }>(z.object({}).strict(), async (ctx, _b, { uid }) => {
  await revokeAdmin(ctx.user, uid);
  return { ok: true };
});
