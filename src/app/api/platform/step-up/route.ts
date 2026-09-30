import { z } from "zod";
import { performStepUp } from "@/server/platform-access";
import { platformWrite } from "@/server/platform-http";

export const dynamic = "force-dynamic";

/** TOTP step-up: elevates THIS session for 10 minutes (rate-limited, audited). */
export const POST = platformWrite(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), async (ctx, body) => performStepUp(ctx, body.code), { stepUp: false });
