import { stepUpUntil } from "@/server/platform-access";
import { csrfTokenFor, platformRead } from "@/server/platform-http";

export const dynamic = "force-dynamic";

/** The admin's own panel state: who, step-up expiry, and the session-bound CSRF token for mutations. */
export const GET = platformRead(async (ctx) => ({
  email: ctx.user.email,
  stepUpUntil: await stepUpUntil(ctx),
  sessionStartedAt: ctx.session.createdAt,
  csrfToken: csrfTokenFor(ctx.session.tokenHash),
}));
