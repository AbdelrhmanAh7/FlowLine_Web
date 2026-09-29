import { z } from "zod";
import { adminActor, platformWrite } from "@/server/platform-http";
import { clearPlatformSecret } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

/** Clear a REVOKED credential entirely (explicit and destructive; the audit keeps the record). */
export const POST = platformWrite<{ expectedRevision: number }, { purpose: string }>(z.object({ expectedRevision: z.number().int().min(0) }).strict(), async (ctx, body, { purpose }) => ({
  credential: await clearPlatformSecret(adminActor(ctx), purpose, body.expectedRevision),
}));
