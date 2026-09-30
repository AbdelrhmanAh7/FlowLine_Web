import { z } from "zod";
import { adminActor, platformWrite } from "@/server/platform-http";
import { importPlatformSecretFromEnv } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

/** Import from environment: explicit, audited, once per purpose, only into an empty purpose. */
export const POST = platformWrite<Record<string, never>, { purpose: string }>(z.object({}).strict(), async (ctx, _b, { purpose }) => ({
  credential: await importPlatformSecretFromEnv(adminActor(ctx), purpose),
}));
