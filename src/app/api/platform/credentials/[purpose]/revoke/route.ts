import { z } from "zod";
import { adminActor, platformWrite } from "@/server/platform-http";
import { revokePlatformSecret } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

/** Revoke: local use stops now (requests already in flight can't be recalled; revoke it at the provider too). */
export const POST = platformWrite<{ expectedRevision: number }, { purpose: string }>(z.object({ expectedRevision: z.number().int().min(0) }).strict(), async (ctx, body, { purpose }) => ({
  credential: await revokePlatformSecret(adminActor(ctx), purpose, body.expectedRevision),
}));
