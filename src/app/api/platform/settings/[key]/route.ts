import { z } from "zod";
import { HttpError, notFound } from "@/server/http";
import { adminActor, platformWrite } from "@/server/platform-http";
import { isSettingKey, setSetting } from "@/server/platform-settings";

export const dynamic = "force-dynamic";

/** Validated, versioned platform setting (compare-and-swap on revision; audited). */
export const PUT = platformWrite<{ value?: unknown; expectedRevision: number }, { key: string }>(z.object({ value: z.unknown(), expectedRevision: z.number().int().min(0) }).strict(), async (ctx, body, { key }) => {
  if (!isSettingKey(key)) throw notFound("Unknown setting");
  if (body.value === undefined) throw new HttpError(400, "VALIDATION", "Invalid request");
  return setSetting(adminActor(ctx), key, body.value, body.expectedRevision);
});
