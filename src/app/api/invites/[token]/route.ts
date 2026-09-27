import { requireUser } from "@/server/access";
import { json, route } from "@/server/http";
import { acceptInvite, previewInvite } from "@/server/members";

type Ctx = { params: Promise<{ token: string }> };

/** Invitation preview for the signed-in user (valid tokens only). */
export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  return json(await previewInvite(user, (await params).token));
});

/** Accept: the signed-in user's email must match the invitation. */
export const POST = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  return json(await acceptInvite(user, (await params).token));
});
