import { z } from "zod";
import { adminActor, platformRead, platformWrite } from "@/server/platform-http";
import { getPlatformSecretView, setPlatformSecret } from "@/server/platform-secrets";

export const dynamic = "force-dynamic";

type P = { purpose: string };

export const GET = platformRead<P>(async (_ctx, _req, { purpose }) => ({ credential: await getPlatformSecretView(purpose) }));

/**
 * Create / replace / rotate / switch. `secret` omitted = keep the current one; "" is a validation error (never a
 * clear); `expectedRevision` makes it a compare-and-swap. The response is the projection, never the value.
 */
export const PUT = platformWrite<{ publicId?: string; secret?: string; expectedRevision: number }, P>(
  z.object({ publicId: z.string().min(1).max(300).optional(), secret: z.string().min(1).max(4096).optional(), expectedRevision: z.number().int().min(0) }).strict(),
  async (ctx, body, { purpose }) => ({ credential: await setPlatformSecret(adminActor(ctx), purpose, body) }),
);
