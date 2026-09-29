import { z } from "zod";
import { importSettingFromEnv, isSettingKey } from "@/server/platform-settings";
import { notFound } from "@/server/http";
import { adminActor, platformWrite } from "@/server/platform-http";

export const dynamic = "force-dynamic";

/** Import a setting from the environment: explicit, audited, once, only when the setting was never set. */
export const POST = platformWrite<Record<string, never>, { key: string }>(z.object({}).strict(), async (ctx, _b, { key }) => {
  if (!isSettingKey(key)) throw notFound("Unknown setting");
  return importSettingFromEnv(adminActor(ctx), key);
});
