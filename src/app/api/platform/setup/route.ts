import { auth } from "@/lib/auth";
import { jsonNoStore, notFound, route } from "@/server/http";
import { requestHeaders } from "@/server/platform-access";
import { setupChallengeFrom, setupState } from "@/server/platform-setup";
import { setupSecured } from "@/server/platform-setup-http";

export const dynamic = "force-dynamic";

/** Setup progress for the holder of a live setup session (404 without one). Public identifiers only. */
export const GET = route(async (req) => {
  const ch = await setupChallengeFrom(req);
  if (!ch) throw notFound();
  const s = await auth.api.getSession({ headers: await requestHeaders(req) }).catch(() => null);
  return setupSecured(jsonNoStore(await setupState(ch, s ? { id: s.user.id, email: s.user.email, emailVerified: s.user.emailVerified } : null)));
});
