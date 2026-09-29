import { auth } from "@/lib/auth";
import { dispatchAuth } from "@/server/auth-dispatch";
import { sendNotice } from "@/server/email/flows";

// Flowline issues hashed, single-use tokens; these built-in endpoints use different token semantics.
const replaced = new Set(["/verify-email", "/send-verification-email", "/request-password-reset", "/reset-password", "/delete-user", "/delete-user/callback"]);
// Two-factor is enrolled/disabled only through the platform setup flow and the account page; the plugin's
// server-only and OTP-by-message endpoints are never exposed.
const blocked = new Set(["/two-factor/send-otp", "/two-factor/verify-otp"]);
export const GET = (request: Request) => {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  return replaced.has(path) || blocked.has(path) ? new Response(null, { status: 404 }) : dispatchAuth(request, "GET");
};
export const POST = async (request: Request) => {
  const path = new URL(request.url).pathname.replace("/api/auth", "");
  if (replaced.has(path) || blocked.has(path)) return new Response(null, { status: 404 });
  const session = path === "/change-password" ? await auth.api.getSession({ headers: request.headers }) : null;
  const response = await dispatchAuth(request, "POST");
  if (path === "/change-password" && response.ok && session) await sendNotice("passwordChanged", session.user.email, request).catch(() => {});
  return response;
};
