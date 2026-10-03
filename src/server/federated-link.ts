import type { GenericEndpointContext } from "better-auth";
import { addOAuthServerContext, APIError, getAuthoritativeSessionFromCtx, getOAuthState } from "better-auth/api";
import { sha256Hex } from "./crypto";

const invalid = () => new APIError("UNAUTHORIZED", { code: "SSO_LINK_INVALID", message: "Restart account linking while signed in" });

/**
 * The provider a Better Auth hook/database-hook context belongs to.
 *
 * `ctx.path` inside hooks is the ROUTE PATTERN ("/callback/:id"), never the concrete URL, so the provider can
 * only come from the route param (callbacks) or the JSON body (direct sign-in/link endpoints). Parsing the
 * path yields the literal ":id", which maps to no provider and made every federated callback fail closed.
 */
export function federatedProviderId(ctx: { params?: unknown; body?: unknown }): string {
  const params = (ctx.params ?? {}) as Record<string, unknown>;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const value = params.id ?? params.providerId ?? body.provider ?? body.providerId;
  return typeof value === "string" ? value : "";
}

/** Trusted OAuth state, never caller-supplied additionalData. */
export async function bindFederatedLink(ctx: GenericEndpointContext, providerStamp?: (provider: string) => Promise<string | null>) {
  const session = await getAuthoritativeSessionFromCtx(ctx);
  if (!session) throw invalid();
  const stamp = await (providerStamp ?? (await import("./auth-dispatch")).federatedProviderStamp)(federatedProviderId(ctx));
  if (!stamp) throw invalid();
  Object.assign(ctx.context, { flowlineLinkConfigStamp: stamp }); // direct ID-token request only
  await addOAuthServerContext({ flowlineLinkSessionHash: sha256Hex(session.session.token), flowlineLinkConfigStamp: stamp });
}

/** Called by account write hooks after provider work, including direct ID-token linking. */
export async function assertFederatedLinkSession(ctx: GenericEndpointContext | null) {
  if (!ctx) return;
  let token: string | null | false | undefined;
  let userId: string | undefined;
  let configStamp: unknown;
  let provider: string;
  if (ctx.path === "/link-social") {
    // The route's middleware captured the initiating session before network work.
    token = ctx.context.session?.session.token;
    userId = ctx.context.session?.user.id;
    configStamp = (ctx.context as { flowlineLinkConfigStamp?: unknown }).flowlineLinkConfigStamp;
    provider = federatedProviderId(ctx);
  } else if (ctx.path?.startsWith("/callback/")) {
    const state = await getOAuthState();
    if (!state?.link) return; // Keep the existing implicit-link policy.
    token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
    const hash = state.serverContext?.flowlineLinkSessionHash;
    if (!token || typeof hash !== "string" || sha256Hex(token) !== hash) throw invalid();
    userId = state.link.userId;
    configStamp = state.serverContext?.flowlineLinkConfigStamp;
    provider = federatedProviderId(ctx); // "/callback/:id" is a pattern; the provider is ctx.params.id
  } else return;
  if (!token || !userId) throw invalid();
  // Do not reuse ctx.context.session: logout/revocation/enrollment can occur
  // while the provider exchange is in flight. findSession includes the MFA fence.
  const live = await ctx.context.internalAdapter.findSession(token);
  if (!live || live.user.id !== userId || live.session.expiresAt <= new Date()) throw invalid();
  const { federatedProviderStamp } = await import("./auth-dispatch");
  if (typeof configStamp !== "string" || await federatedProviderStamp(provider) !== configStamp) throw invalid();
}
