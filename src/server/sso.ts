import { createHash, createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { CurrentUser } from "./access";
import { requireWorkspace } from "./access";
import { audit, userActor } from "./audit";
import { contextId, encryptSecretV2, openSecret, randomToken, type SecretContext } from "./crypto";
import { EgressError, safeFetch } from "./egress";
import { HttpError } from "./http";
import { proposeSsoLink } from "./sso-link";
import { sha256Hex } from "./crypto";
import {
  assertIssuerUrl,
  basicClientAuthorization,
  fetchDiscovery,
  validateIdToken,
  type Jwks,
} from "./oidc";


/** AAD contexts: the client secret is bound to the workspace's SSO row; the PKCE verifier to its pending state. */
function ssoSecretContext(workspaceId: string): SecretContext {
  return { table: "sso_config", rowId: workspaceId, workspaceId, provider: "oidc", purpose: "client_secret" };
}
function ssoVerifierContext(state: string, workspaceId: string): SecretContext {
  return { table: "sso_state", rowId: contextId(state), workspaceId, provider: "oidc", purpose: "pkce_verifier" };
}

export { fetchDiscovery, validateIdToken } from "./oidc";
export type { IdTokenClaims, Jwks, OidcDiscovery } from "./oidc";

/**
 * Per-workspace SSO over OpenID Connect (authorization code + PKCE).
 *
 * Honesty rule: SSO is only "available" once it is configured AND a test sign-in
 * has succeeded (sso_config.verified_at). Enabling without a verified test sign-in
 * is refused; editing the issuer or client id clears verification. The client
 * secret is stored encrypted and never leaves the server (publicSsoConfig has no
 * secret material, audit entries never include it).
 */

/* ───────────── Configuration ───────────── */

/** Client-safe projection: no secret material. */
export function publicSsoConfig(c: typeof schema.ssoConfig.$inferSelect) {
  return {
    workspaceId: c.workspaceId,
    issuer: c.issuer,
    provider: c.provider,
    clientId: c.clientId,
    hasSecret: Boolean(c.clientSecretEnc),
    domains: c.domains,
    defaultRole: c.defaultRole,
    enabled: c.enabled,
    verifiedAt: c.verifiedAt,
    updatedAt: c.updatedAt,
  };
}

export async function getSsoConfig(user: CurrentUser, workspaceId: string) {
  await requireWorkspace(user, workspaceId, "viewer");
  const [row] = await db
    .select()
    .from(schema.ssoConfig)
    .where(eq(schema.ssoConfig.workspaceId, workspaceId));
  return row ? publicSsoConfig(row) : null;
}

export interface SsoConfigInput {
  issuer: string;
  provider?: "oidc" | "zitadel";
  clientId: string;
  /** Empty/omitted keeps the existing secret. Required for a new configuration. */
  clientSecret?: string;
  domains: string[];
  defaultRole: Role;
  enabled: boolean;
}

export async function saveSsoConfig(
  user: CurrentUser,
  workspaceId: string,
  input: SsoConfigInput,
) {
  const { workspace } = await requireWorkspace(user, workspaceId, "sso.manage");
  const issuer = input.issuer.trim().replace(/\/+$/, "");
  assertIssuerUrl(issuer);
  const provider = input.provider ?? "oidc";
  if (provider !== "oidc" && provider !== "zitadel") throw new HttpError(400, "VALIDATION", "Unknown SSO provider");
  const clientId = input.clientId.trim();
  if (!clientId || clientId.length > 200)
    throw new HttpError(
      400,
      "VALIDATION",
      "Client ID is required (max 200 characters)",
    );
  const domains = [
    ...new Set(
      input.domains
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
  if (domains.length === 0 || domains.length > 50)
    throw new HttpError(400, "VALIDATION", "List 1–50 allowed email domains");
  for (const d of domains)
    if (
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
        d,
      )
    )
      throw new HttpError(400, "VALIDATION", `"${d}" isn't a valid domain`);
  if (!["viewer", "editor", "owner"].includes(input.defaultRole))
    throw new HttpError(
      400,
      "VALIDATION",
      "Default role must be viewer, editor or owner",
    );

  // The provider must actually speak OIDC before anything is stored.
  const discovery = await fetchDiscovery(issuer);
  if (provider === "zitadel" && !discovery.token_endpoint_auth_methods_supported?.includes("client_secret_basic"))
    throw new HttpError(400, "VALIDATION", "This issuer does not advertise client_secret_basic for a ZITADEL Web application");

  const [existing] = await db
    .select()
    .from(schema.ssoConfig)
    .where(eq(schema.ssoConfig.workspaceId, workspace.id));
  let secretEnc: string, keyId: string;
  let legacyCrypto = false;
  if (input.clientSecret?.trim()) {
    ({ ciphertext: secretEnc, keyId } = encryptSecretV2(
      input.clientSecret.trim(),
      ssoSecretContext(workspace.id),
    ));
  } else if (existing) {
    ({ clientSecretEnc: secretEnc, keyId, legacyCrypto } = existing);
  } else {
    throw new HttpError(400, "VALIDATION", "Client secret is required");
  }

  // Changing who issues tokens or which client we are invalidates the previous test sign-in.
  const identityChanged =
    !existing || existing.issuer !== issuer || existing.clientId !== clientId || existing.provider !== provider || Boolean(input.clientSecret?.trim());
  const verifiedAt = identityChanged ? null : existing.verifiedAt;
  if (input.enabled && !verifiedAt) {
    throw new HttpError(
      400,
      "SSO_UNVERIFIED",
      "Run a successful test sign-in before enabling SSO for everyone",
    );
  }

  const [row] = await db
    .insert(schema.ssoConfig)
    .values({
      workspaceId: workspace.id,
      issuer,
      provider,
      clientId,
      clientSecretEnc: secretEnc,
      keyId,
      legacyCrypto,
      domains,
      defaultRole: input.defaultRole,
      enabled: input.enabled,
      verifiedAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.ssoConfig.workspaceId,
      set: {
        issuer,
        provider,
        clientId,
        clientSecretEnc: secretEnc,
        keyId,
        legacyCrypto,
        domains,
        defaultRole: input.defaultRole,
        enabled: input.enabled,
        verifiedAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  // Never audit the secret — only the non-sensitive shape of the configuration.
  await audit(db, {
    workspaceId: workspace.id,
    actor: userActor(user),
    action: "sso.configured",
    targetType: "sso_config",
    targetId: workspace.id,
    data: {
      issuer,
      provider,
      clientId,
      domains,
      defaultRole: input.defaultRole,
      enabled: input.enabled,
      verified: Boolean(verifiedAt),
      secretUpdated: Boolean(input.clientSecret?.trim()),
    },
  });
  return publicSsoConfig(row!);
}

/* ───────────── Sign-in flow ───────────── */

export function ssoRedirectUri() {
  return `${(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/sso/callback`;
}

const notConfigured = () =>
  new HttpError(
    400,
    "SSO_NOT_CONFIGURED",
    "SSO isn't set up for that workspace",
  );

/**
 * Builds the IdP authorization URL. Allowed when the workspace has an enabled
 * config, or when the caller is an owner running a test sign-in (the only way
 * verified_at gets set). State is random, single-use and expires in 10 minutes.
 */
export async function startSso(opts: {
  slug: string;
  email?: string;
  user: CurrentUser | null;
  sessionToken?: string;
}) {
  const [ws] = await db
    .select()
    .from(schema.workspace)
    .where(eq(schema.workspace.slug, opts.slug.trim().toLowerCase()));
  if (!ws) throw notConfigured();
  const [cfg] = await db
    .select()
    .from(schema.ssoConfig)
    .where(eq(schema.ssoConfig.workspaceId, ws.id));
  if (!cfg) throw notConfigured();
  let testSignIn = false;
  if (!cfg.enabled) {
    let isOwner = false;
    if (opts.user) {
      const [m] = await db
        .select({ role: schema.workspaceMember.role })
        .from(schema.workspaceMember)
        .where(
          sql`${schema.workspaceMember.workspaceId} = ${ws.id} and ${schema.workspaceMember.userId} = ${opts.user.id}`,
        );
      isOwner = m?.role === "owner";
    }
    if (!isOwner) throw notConfigured();
    testSignIn = true;
  }
  const discovery = await fetchDiscovery(cfg.issuer);
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const enc = encryptSecretV2({ verifier, configStamp: cfg.updatedAt.toISOString(), sessionHash: opts.sessionToken ? sha256Hex(opts.sessionToken) : null }, ssoVerifierContext(state, ws.id));
  await db
    .insert(schema.ssoState)
    .values({
      state,
      workspaceId: ws.id,
      nonce,
      codeVerifierEnc: enc.ciphertext,
      keyId: enc.keyId,
      initiatorUserId: opts.user?.id ?? null,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
  const u = new URL(discovery.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", ssoRedirectUri());
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (opts.email) u.searchParams.set("login_hint", opts.email);
  return { url: u.toString(), state, testSignIn };
}

/**
 * Account-link namespace: the workspace AND the IdP identity (issuer + client id). Pointing the workspace at a
 * different IdP never inherits old links — a subject asserted by the new IdP can't reach an account linked
 * under the old one; the account holder has to link again while signed in.
 */
export function ssoProviderId(workspaceId: string, issuer: string, clientId: string) {
  // Only mailbox-proven, explicitly confirmed links use this namespace.
  // Legacy sso:<workspace>:<hash> bindings are unproven and never inherited.
  return `sso:approved:${workspaceId}:${createHash("sha256").update(`${issuer}
${clientId}`).digest("hex").slice(0, 24)}`;
}

/** httpOnly cookie carrying the pending state, set by /api/sso/start and required by the callback. */
export const SSO_STATE_COOKIE = "fl_sso_state";

export interface SsoSignInResult {
  user: { id: string; email: string };
  slug: string;
  sessionToken: string;
  sessionExpiresAt: Date;
  newUser: boolean;
  newMember: boolean;
  testSignIn: boolean;
  /** A GET callback may propose a link, but cannot persist it or issue a session. */
  linkRequired?: string;
  configurationVerified?: boolean;
  mfaRequired?: string;
}

/**
 * Completes an SSO sign-in: consumes the single-use state, exchanges the code
 * (provider client authentication + PKCE), and validates the id_token. A bound
 * identity can sign in; enrolled users receive only a pending local-TOTP challenge.
 * Unbound identities need independent mailbox ownership and explicit POST consent.
 * Owner configuration tests validate OIDC without creating accounts or sessions.
 */
export async function completeSso(opts: {
  state: string;
  code: string;
  sessionToken?: string;
}): Promise<SsoSignInResult> {
  const pending = await db.transaction(async (tx) => {
    const [st] = await tx
      .select()
      .from(schema.ssoState)
      .where(eq(schema.ssoState.state, opts.state))
      .for("update");
    if (!st || st.expiresAt < new Date())
      throw new HttpError(
        400,
        "SSO_STATE_INVALID",
        "This sign-in link expired or was already used — start again",
      );
    await tx
      .delete(schema.ssoState)
      .where(eq(schema.ssoState.state, opts.state));
    return st;
  });
  const [cfg] = await db
    .select()
    .from(schema.ssoConfig)
    .where(eq(schema.ssoConfig.workspaceId, pending.workspaceId));
  const [ws] = await db
    .select()
    .from(schema.workspace)
    .where(eq(schema.workspace.id, pending.workspaceId));
  if (!cfg || !ws) throw notConfigured();

  const discovery = await fetchDiscovery(cfg.issuer);
  const clientSecret = openSecret<string>(
    { ciphertext: cfg.clientSecretEnc, keyId: cfg.keyId, legacy: cfg.legacyCrypto },
    ssoSecretContext(cfg.workspaceId),
  );
  // Pending states are short-lived and always written as v2 (never legacy).
  const binding = openSecret<{ verifier: string; configStamp: string; sessionHash: string | null }>(
    { ciphertext: pending.codeVerifierEnc, keyId: pending.keyId, legacy: false },
    ssoVerifierContext(pending.state, pending.workspaceId),
  );
  // Old in-flight states have no configuration/session fence and must be restarted.
  if (!binding || typeof binding !== "object" || binding.configStamp !== cfg.updatedAt.toISOString())
    throw new HttpError(400, "SSO_STATE_INVALID", "Restart SSO after a configuration change");
  const verifier = binding.verifier;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: ssoRedirectUri(),
    code_verifier: verifier,
  });
  if (cfg.provider === "oidc") {
    body.set("client_id", cfg.clientId);
    body.set("client_secret", clientSecret);
  }
  let tokenRes;
  try {
    tokenRes = await safeFetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        ...(cfg.provider === "zitadel" ? { authorization: basicClientAuthorization(cfg.clientId, clientSecret) } : {}),
      },
      body: body.toString(),
      timeoutMs: 15_000,
    });
  } catch (e) {
    if (e instanceof EgressError)
      throw new HttpError(400, "EGRESS_BLOCKED", e.message);
    throw new HttpError(
      400,
      "SSO_EXCHANGE_FAILED",
      "Couldn't reach the identity provider to finish sign-in",
    );
  }
  let tokens: Record<string, unknown> = {};
  try {
    tokens = tokenRes.json<Record<string, unknown>>();
  } catch {
    /* handled below */
  }
  if (tokenRes.status !== 200 || typeof tokens.id_token !== "string") {
    throw new HttpError(
      400,
      "SSO_EXCHANGE_FAILED",
      `The identity provider refused the sign-in${typeof tokens.error === "string" ? ` (${tokens.error})` : ""}`,
    );
  }
  const jwksRes = await safeFetch(discovery.jwks_uri, {
    headers: { accept: "application/json" },
    timeoutMs: 10_000,
    maxBytes: 256 * 1024,
  });
  if (jwksRes.status !== 200)
    throw new HttpError(
      400,
      "SSO_EXCHANGE_FAILED",
      "Couldn't fetch the identity provider's signing keys",
    );
  const claims = validateIdToken(tokens.id_token, {
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    nonce: pending.nonce,
    domains: cfg.domains,
    jwks: jwksRes.json<Jwks>(),
  });

  if (!cfg.enabled) {
    // An owner's configuration test validates OIDC only; it cannot create a
    // globally trusted identity using the tenant's email assertion.
    if (!pending.initiatorUserId || !opts.sessionToken || !binding.sessionHash || sha256Hex(opts.sessionToken) !== binding.sessionHash)
      throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
    const [initiator] = await db.select().from(schema.user).where(eq(schema.user.id, pending.initiatorUserId));
    if (!initiator) throw notConfigured();
    await requireWorkspace(initiator, ws.id, "sso.manage");
    await db.transaction(async (tx) => {
      const [currentSession] = await tx.select().from(schema.session).where(and(eq(schema.session.token, opts.sessionToken!), eq(schema.session.userId, initiator.id), sql`${schema.session.expiresAt} > now()`)).for("update");
      const [currentConfig] = await tx.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id)).for("update");
      const [member] = await tx.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, initiator.id))).for("update");
      if (!currentSession || !currentConfig || currentConfig.updatedAt.toISOString() !== binding.configStamp || member?.role !== "owner") throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
      await tx.update(schema.ssoConfig).set({ verifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.ssoConfig.workspaceId, ws.id));
    });
    return { user: { id: initiator.id, email: initiator.email }, slug: ws.slug, sessionToken: "", sessionExpiresAt: new Date(), newUser: false, newMember: false, testSignIn: true, configurationVerified: true };
  }

  // Identity is the IdP subject, linked per workspace IdP. An email match alone never signs anyone in:
  // otherwise any workspace owner could point SSO at an IdP they control and take over an existing
  // account (and every other workspace it belongs to). Linking requires independent
  // Flowline mailbox ownership and explicit confirmation by the signed-in user.
  if (!claims.sub)
    throw new HttpError(
      400,
      "SSO_TOKEN_INVALID",
      "The identity token has no subject",
    );
  const providerId = ssoProviderId(ws.id, cfg.issuer, cfg.clientId);
  const subject = claims.sub;
  const email = claims.email;
  const [linked] = await db
    .select({ userId: schema.account.userId })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.providerId, providerId),
        eq(schema.account.accountId, claims.sub),
      ),
    );
  let user: typeof schema.user.$inferSelect | undefined;
  const newUser = false;
  if (linked) {
    [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, linked.userId));
  } else {
    const [existing] = await db
      .select()
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = ${email.toLowerCase()}`);
    if (existing && existing.id !== pending.initiatorUserId)
      throw new HttpError(
        409,
        "SSO_ACCOUNT_EXISTS",
        "An account with this email already exists — sign in with your password first, then start SSO to link it. SSO can't take over an existing account.",
      );
    if (existing) {
      const token = await proposeSsoLink({ user: existing, workspaceId: ws.id, issuer: cfg.issuer, clientId: cfg.clientId, subject: claims.sub, configStamp: binding.configStamp, sessionHash: binding.sessionHash, sessionToken: opts.sessionToken });
      return { user: { id: existing.id, email: existing.email }, slug: ws.slug, sessionToken: "", sessionExpiresAt: new Date(), newUser: false, newMember: false, testSignIn: !cfg.enabled, linkRequired: token };
    } else {
      throw new HttpError(403, "SSO_EMAIL_OWNERSHIP_REQUIRED", "Create and verify your Flowline account before linking workspace SSO");
    }
  }
  if (!user)
    throw new HttpError(500, "INTERNAL", "Couldn't create the user account");
  if (!user.emailVerified) throw new HttpError(403, "SSO_EMAIL_OWNERSHIP_REQUIRED", "Verify your Flowline email before signing in");

  if (user.twoFactorEnabled) {
    const { createFederatedChallenge } = await import("./federated-mfa");
    const mfaRequired = await db.transaction(async (tx) => {
      let initiator: { sessionId: string; userId: string; sessionHash: string } | undefined;
      if (pending.initiatorUserId) {
        const [initiatorSession] = opts.sessionToken ? await tx.select().from(schema.session).where(and(eq(schema.session.token, opts.sessionToken), eq(schema.session.userId, pending.initiatorUserId), sql`${schema.session.expiresAt} > now()`)).for("share") : [];
        if (!initiatorSession || !binding.sessionHash || sha256Hex(opts.sessionToken!) !== binding.sessionHash)
          throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
        initiator = { sessionId: initiatorSession.id, userId: initiatorSession.userId, sessionHash: binding.sessionHash };
      }
      const [currentUser] = await tx.select().from(schema.user).where(eq(schema.user.id, user!.id)).for("share");
      const [currentConfig] = await tx.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id)).for("update");
      const [currentMember] = await tx.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, user!.id))).for("share");
      const [currentLink] = await tx.select().from(schema.account).where(and(eq(schema.account.providerId, providerId), eq(schema.account.accountId, subject), eq(schema.account.userId, user!.id))).for("share");
      if (!currentConfig?.enabled || currentConfig.updatedAt.toISOString() !== binding.configStamp)
        throw new HttpError(400, "SSO_STATE_INVALID", "Restart SSO after a configuration change");
      if (!currentUser?.emailVerified || !currentUser.twoFactorEnabled || !currentMember || !currentLink)
        throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
      return createFederatedChallenge(currentUser.id, `/w/${ws.slug}/flows`, {
        workspaceId: ws.id, newMember: false, role: currentMember.role,
        configStamp: binding.configStamp, providerId, subject, ...(initiator ? { initiator } : {}),
      }, tx);
    });
    return { user: { id: user.id, email: user.email }, slug: ws.slug, sessionToken: "", sessionExpiresAt: new Date(), newUser, newMember: false, testSignIn: false, mfaRequired };
  }

  // Keep Better Auth's session hooks/defaults, but never return the token until
  // the final locked authority check succeeds. No adapter hook runs under our locks.
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id);
  const newMember = false;
  try {
    await db.transaction(async (tx) => {
      if (pending.initiatorUserId) {
        const [initiatorSession] = opts.sessionToken ? await tx.select().from(schema.session).where(and(eq(schema.session.token, opts.sessionToken), eq(schema.session.userId, pending.initiatorUserId), sql`${schema.session.expiresAt} > now()`)).for("share") : [];
        if (!initiatorSession || !binding.sessionHash || sha256Hex(opts.sessionToken!) !== binding.sessionHash)
          throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
      }
      const [currentUser] = await tx.select().from(schema.user).where(eq(schema.user.id, user!.id)).for("share");
      const [currentConfig] = await tx.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, ws.id)).for("update");
      const [currentMember] = await tx.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, ws.id), eq(schema.workspaceMember.userId, user!.id))).for("share");
      const [currentLink] = await tx.select().from(schema.account).where(and(eq(schema.account.providerId, providerId), eq(schema.account.accountId, subject), eq(schema.account.userId, user!.id))).for("share");
      const [currentSession] = await tx.select().from(schema.session).where(and(eq(schema.session.token, session.token), eq(schema.session.userId, user!.id), sql`${schema.session.expiresAt} > now()`)).for("share");
      if (!currentConfig?.enabled || currentConfig.updatedAt.toISOString() !== binding.configStamp)
        throw new HttpError(400, "SSO_STATE_INVALID", "Restart SSO after a configuration change");
      if (!currentUser?.emailVerified || currentUser.twoFactorEnabled !== user!.twoFactorEnabled || !currentMember || !currentLink || !currentSession)
        throw new HttpError(403, "SSO_LINK_INVALID", "Restart SSO while signed in");
      const firstSuccess = !currentConfig.verifiedAt;
      if (firstSuccess) await tx.update(schema.ssoConfig).set({ verifiedAt: new Date(), updatedAt: new Date() }).where(eq(schema.ssoConfig.workspaceId, ws.id));
      await audit(tx, {
        workspaceId: ws.id,
        actor: userActor({ id: currentUser.id, email: currentUser.email }),
        action: "sso.signin", targetType: "user", targetId: currentUser.id,
        data: { email: currentUser.email, newUser, newMember, role: currentMember.role, testSignIn: false, firstVerification: firstSuccess },
      });
    });
  } catch (error) {
    // The adapter used its own transaction. Remove its unissued session on every
    // failed authority check/audit transaction; no cookie/token escaped to a caller.
    await db.delete(schema.session).where(eq(schema.session.token, session.token));
    throw error;
  }
  return {
    user: { id: user.id, email: user.email },
    slug: ws.slug,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    newUser,
    newMember,
    testSignIn: !cfg.enabled,
  };
}

/**
 * The exact cookie better-auth's own sign-in sets: `<token>.<base64 HMAC-SHA256(token, secret)>`,
 * URI-encoded by the response cookie serializer, under authCookies.sessionToken's name/attributes.
 * auth.api.getSession verifies the same HMAC and loads the session row by token.
 */
export async function ssoSessionCookie(token: string) {
  const ctx = await auth.$context;
  const c = ctx.authCookies.sessionToken;
  const signature = createHmac("sha256", ctx.secret)
    .update(token, "utf8")
    .digest("base64");
  return {
    name: c.name,
    value: `${token}.${signature}`,
    options: {
      httpOnly: c.attributes.httpOnly,
      sameSite: (c.attributes.sameSite ?? "lax").toLowerCase() as
        "lax" | "strict" | "none",
      path: c.attributes.path ?? "/",
      secure: c.attributes.secure,
      maxAge: ctx.sessionConfig.expiresIn,
    },
  };
}
