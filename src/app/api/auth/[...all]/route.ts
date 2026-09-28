import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { sendNotice } from "@/server/email/flows";

const handler = toNextJsHandler(auth);
// Flowline issues hashed, single-use tokens; these built-in endpoints use different token semantics.
const replaced = new Set(["/verify-email", "/send-verification-email", "/request-password-reset", "/reset-password", "/delete-user", "/delete-user/callback"]);
export const GET = (request: Request) => replaced.has(new URL(request.url).pathname.replace("/api/auth", "")) ? new Response(null, { status: 404 }) : handler.GET(request);
export const POST = async (request: Request) => {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  if (replaced.has(path)) return new Response(null, { status: 404 });
  const session = path === "/change-password" ? await auth.api.getSession({ headers: request.headers }) : null;
  const response = await handler.POST(request);
  if (path === "/change-password" && response.ok && session) await sendNotice("passwordChanged", session.user.email, request).catch(() => {});
  return response;
};
