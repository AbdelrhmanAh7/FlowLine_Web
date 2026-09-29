import { z } from "zod";
import { adminActor, platformWrite } from "@/server/platform-http";
import { probePlatformSecret } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

/** "Test": one read-only call to a fixed provider URL. OAuth apps are never VERIFIED by a probe, only by a real sign-in or Connect. */
export const POST = platformWrite<Record<string, never>, { purpose: string }>(z.object({}).strict(), async (ctx, _b, { purpose }) => {
  const r = await probePlatformSecret(adminActor(ctx), purpose);
  return { result: r.result, credential: r.view };
});
