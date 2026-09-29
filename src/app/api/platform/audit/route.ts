import { db } from "@/db";
import { listPlatformAudit } from "@/server/platform-audit";
import { platformRead } from "@/server/platform-http";

export const dynamic = "force-dynamic";

/** The last 200 platform security events (metadata only), optionally for one purpose. */
export const GET = platformRead(async (_ctx, req) => {
  const purpose = new URL(req.url).searchParams.get("purpose") ?? undefined;
  return { events: await listPlatformAudit(db, { purpose: purpose && purpose.length <= 80 ? purpose : undefined }) };
});
