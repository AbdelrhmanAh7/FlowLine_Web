import { createHash } from "node:crypto";
import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { createProviderHttp, resolveBase } from "@/integrations/http";
import { getProvider } from "@/integrations/registry";
import { ProviderError, type Credentials, type ProviderDef } from "@/integrations/types";
import { audit } from "./audit";
import { safeFetch } from "./egress";
import { decryptSecret, encryptSecret, randomToken } from "./crypto";
import { HttpError, notFound } from "./http";

export class ConnectionError extends Error {
  constructor(
    public code: "CONNECTION_MISSING" | "CONNECTION_EXPIRED" | "CONNECTION_REVOKED" | "CONNECTION_SCOPE" | "CONNECTION_WORKSPACE" | "CONNECTION_PROVIDER",
    message: string,
  ) {
    super(message);
  }
}

interface StoredSecret extends Credentials {
  refreshToken?: string;
}

/** Client-safe projection: never includes secret material. */
export function publicConnection(c: typeof schema.connection.$inferSelect) {
  return {
    id: c.id,
    provider: c.provider,
    label: c.label,
    authType: c.authType,
    accountLabel: c.accountLabel,
    scopes: c.scopes,
    settings: c.settings,
    status: c.status,
    statusReason: c.statusReason,
    accessExpiresAt: c.accessExpiresAt,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
  };
}

export async function listConnections(db: Db, workspaceId: string) {
  const rows = await db.select().from(schema.connection).where(eq(schema.connection.workspaceId, workspaceId)).orderBy(schema.connection.createdAt);
  const usage = await db.execute<{ connection_id: string; flows: number }>(sql`
    select c.id as connection_id, count(distinct f.id)::int as flows
    from connection c join flow f on f.workspace_id = c.workspace_id and f.deleted_at is null
      and f.graph::text like '%' || c.id::text || '%'
    where c.workspace_id = ${workspaceId} group by c.id`);
  const counts = new Map(usage.rows.map((r) => [r.connection_id, r.flows]));
  return rows.map((r) => ({ ...publicConnection(r), flowCount: counts.get(r.id) ?? 0 }));
}

async function identify(provider: ProviderDef, creds: Credentials) {
  const ac = new AbortController();
  try {
    return await provider.identity({ http: createProviderHttp(provider, creds, ac.signal), credentials: creds, signal: ac.signal, log: () => {} });
  } catch (e) {
    if (e instanceof ProviderError) {
      if (e.kind === "auth") throw new HttpError(400, "CONNECTION_REJECTED", `${provider.name} rejected these credentials`);
      if (e.kind === "egress_blocked") throw new HttpError(400, "EGRESS_BLOCKED", e.message);
      throw new HttpError(502, "PROVIDER_UNREACHABLE", `Couldn't verify the connection: ${e.message}`);
    }
    throw new HttpError(400, "CONNECTION_REJECTED", (e as Error).message);
  }
}

/** Builds credentials from the provider's connect fields (API key, basic, connection string providers). */
export function credentialsFromFields(provider: ProviderDef, fields: Record<string, string>): Credentials {
  const settings: Record<string, string> = {};
  const creds: Credentials = { type: provider.authType };
  for (const f of provider.connectFields ?? []) {
    const v = (fields[f.key] ?? "").trim();
    if (!v) throw new HttpError(400, "VALIDATION", `${f.label} is required`);
    if (v.length > 4000) throw new HttpError(400, "VALIDATION", `${f.label} is too long`);
    if (!f.secret) settings[f.key] = v;
    else if (f.key === "password") creds.password = v;
    else if (f.key === "connectionString") creds.connectionString = v;
    // Basic-auth providers (e.g. Zendesk API tokens) send the token as the Basic password.
    else if (provider.authType === "basic") creds.password = v;
    else creds.token = v;
    if (f.key === "username" || f.key === "email") creds.username = f.key === "email" ? `${v}/token` : v;
  }
  creds.settings = settings;
  return creds;
}

export async function createConnection(db: Db, userId: string, workspaceId: string, providerId: string, label: string, fields: Record<string, string>) {
  const provider = getProvider(providerId);
  if (!provider) throw notFound("Unknown provider");
  if (provider.authType === "oauth2" && !fields.token) throw new HttpError(400, "USE_OAUTH", `${provider.name} connects with OAuth`);
  // A pasted token for an OAuth app (e.g. a Slack bot token) has unknown scopes: record the provider's
  // declared scopes, flagged as unverified — the provider still enforces the token's real scopes.
  const creds = provider.authType === "oauth2" ? { type: "oauth2" as const, token: fields.token, settings: { tokenPasted: "true" } } : credentialsFromFields(provider, fields);
  const id = await identify(provider, creds);
  const enc = encryptSecret(creds);
  const [row] = await db
    .insert(schema.connection)
    .values({
      workspaceId,
      provider: provider.id,
      label: label.trim().slice(0, 80) || `${provider.name} (${id.label})`,
      authType: provider.authType,
      accountId: id.accountId,
      accountLabel: id.label,
      scopes: [...new Set(provider.actions.flatMap((a) => a.requiredScopes))],
      settings: creds.settings ?? {},
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      createdBy: userId,
    })
    .returning();
  return publicConnection(row);
}

/** Reconnect with new credentials. The external account MUST be the same one, and nothing runs automatically afterwards. */
export async function reconnectConnection(db: Db, workspaceId: string, connectionId: string, fields: Record<string, string>) {
  const [conn] = await db.select().from(schema.connection).where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspaceId)));
  if (!conn) throw notFound("Connection not found");
  const provider = getProvider(conn.provider)!;
  const creds = provider.authType === "oauth2" ? { type: "oauth2" as const, token: fields.token, settings: {} } : credentialsFromFields(provider, fields);
  const id = await identify(provider, creds);
  if (id.accountId !== conn.accountId) {
    throw new HttpError(409, "DIFFERENT_ACCOUNT", `These credentials belong to ${id.label}, but this connection is ${conn.accountLabel}. Create a new connection instead.`);
  }
  await storeCredentials(db, conn.id, creds, null);
  await resumeFlowsForConnection(db, conn.id);
  return publicConnection((await db.select().from(schema.connection).where(eq(schema.connection.id, conn.id)))[0]!);
}

async function storeCredentials(db: Db, connectionId: string, creds: StoredSecret, expiresAt: Date | null, scopes?: string[]) {
  const enc = encryptSecret(creds);
  await db
    .update(schema.connection)
    .set({
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      accessExpiresAt: expiresAt,
      status: "active",
      statusReason: null,
      credVersion: sql`${schema.connection.credVersion} + 1`,
      updatedAt: new Date(),
      ...(scopes ? { scopes } : {}),
    })
    .where(eq(schema.connection.id, connectionId));
}

/** Flows whose graph references this connection id. */
function usesConnection(connectionId: string) {
  return like(sql`${schema.flow.graph}::text`, `%${connectionId}%`);
}

/** Pause ONLY the flows that use this connection. Other flows keep running. */
export async function pauseFlowsUsingConnection(db: Db, connectionId: string, reason: string) {
  await db
    .update(schema.flow)
    .set({ pausedReason: `connection:${connectionId}:${reason}`, pausedAt: new Date() })
    .where(and(usesConnection(connectionId), isNull(schema.flow.deletedAt), or(isNull(schema.flow.pausedReason), like(schema.flow.pausedReason, `connection:${connectionId}:%`))));
}

export async function resumeFlowsForConnection(db: Db, connectionId: string) {
  await db.update(schema.flow).set({ pausedReason: null, pausedAt: null }).where(like(schema.flow.pausedReason, `connection:${connectionId}:%`));
}

export async function markConnectionUnhealthy(db: Db, connectionId: string, status: "expired" | "revoked" | "error", reason: string) {
  await db.update(schema.connection).set({ status, statusReason: reason.slice(0, 300), updatedAt: new Date() }).where(eq(schema.connection.id, connectionId));
  await pauseFlowsUsingConnection(db, connectionId, status);
  const [c] = await db.select({ workspaceId: schema.connection.workspaceId, provider: schema.connection.provider }).from(schema.connection).where(eq(schema.connection.id, connectionId));
  if (c) await audit(db, { workspaceId: c.workspaceId, actor: { kind: "system", label: "worker" }, action: "integration.expired", targetType: "connection", targetId: connectionId, data: { provider: c.provider, status } });
}

/**
 * Credentials for executing an action NOW. Re-authorizes at execution time: the
 * connection must still exist, belong to the run's workspace, match the provider,
 * be active, and grant the action's scopes. Expiring OAuth tokens are refreshed
 * under a row lock so concurrent workers never race a rotating refresh token.
 */
export async function getRuntimeCredentials(db: Db, opts: { connectionId: string; workspaceId: string; providerId: string; requiredScopes: string[] }): Promise<{ creds: Credentials; secrets: string[]; connection: typeof schema.connection.$inferSelect }> {
  const [conn] = await db.select().from(schema.connection).where(eq(schema.connection.id, opts.connectionId));
  if (!conn) throw new ConnectionError("CONNECTION_MISSING", "The connection used by this step no longer exists");
  if (conn.workspaceId !== opts.workspaceId) throw new ConnectionError("CONNECTION_WORKSPACE", "The connection belongs to a different workspace");
  if (conn.provider !== opts.providerId) throw new ConnectionError("CONNECTION_PROVIDER", "The connection is for a different app");
  if (conn.status === "revoked") throw new ConnectionError("CONNECTION_REVOKED", `${conn.label} was revoked — reconnect it`);
  if (conn.status !== "active") throw new ConnectionError("CONNECTION_EXPIRED", `${conn.label} needs to be reconnected (${conn.statusReason ?? conn.status})`);
  if (conn.authType === "oauth2") {
    const missing = opts.requiredScopes.filter((s) => !conn.scopes.includes(s));
    if (missing.length) throw new ConnectionError("CONNECTION_SCOPE", `${conn.label} is missing permission: ${missing.join(", ")}`);
  }
  let secret = decryptSecret<StoredSecret>(conn.secretEnc, conn.keyId);
  let current = conn;
  if (conn.authType === "oauth2" && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - Date.now() < 60_000) {
    ({ secret, conn: current } = await refreshLocked(db, conn.id));
  }
  await db.update(schema.connection).set({ lastUsedAt: new Date() }).where(eq(schema.connection.id, conn.id));
  const secrets = [secret.token, secret.password, secret.refreshToken, secret.connectionString].filter((s): s is string => Boolean(s));
  const { refreshToken: _r, ...creds } = secret;
  return { creds, secrets, connection: current };
}

async function refreshLocked(db: Db, connectionId: string): Promise<{ secret: StoredSecret; conn: typeof schema.connection.$inferSelect }> {
  // The row lock serializes refreshes: a rotating refresh token is only ever spent once.
  // A denial is COMMITTED (connection expired + its flows paused) before the error is raised,
  // so throwing never rolls back the state the rest of the app relies on.
  const outcome = await db.transaction(async (tx) => {
    const [conn] = await tx.select().from(schema.connection).where(eq(schema.connection.id, connectionId)).for("update");
    let secret = decryptSecret<StoredSecret>(conn!.secretEnc, conn!.keyId);
    // Another worker refreshed while we waited for the lock → use its token.
    if (conn!.accessExpiresAt && conn!.accessExpiresAt.getTime() - Date.now() >= 60_000) return { ok: true as const, secret, conn: conn! };
    const provider = getProvider(conn!.provider)!;
    const deny = async (reason: string) => {
      await tx.update(schema.connection).set({ status: "expired", statusReason: reason.slice(0, 300), updatedAt: new Date() }).where(eq(schema.connection.id, connectionId));
      await tx
        .update(schema.flow)
        .set({ pausedReason: `connection:${connectionId}:expired`, pausedAt: new Date() })
        .where(and(usesConnection(connectionId), isNull(schema.flow.deletedAt), isNull(schema.flow.pausedReason)));
      return { ok: false as const, message: `${conn!.label} ${reason} — reconnect it` };
    };
    if (!provider.oauth || !secret.refreshToken) return deny("expired and can't be refreshed");
    const tokens = await tokenRequest(provider, { grant_type: "refresh_token", refresh_token: secret.refreshToken });
    if ("error" in tokens) return deny(`could not be refreshed (${tokens.error})`);
    secret = { ...secret, token: tokens.access_token, refreshToken: tokens.refresh_token ?? secret.refreshToken };
    const enc = encryptSecret(secret);
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    const [updated] = await tx
      .update(schema.connection)
      .set({ secretEnc: enc.ciphertext, keyId: enc.keyId, accessExpiresAt: expiresAt, credVersion: sql`${schema.connection.credVersion} + 1`, updatedAt: new Date() })
      .where(eq(schema.connection.id, connectionId))
      .returning();
    return { ok: true as const, secret, conn: updated! };
  });
  if (!outcome.ok) throw new ConnectionError("CONNECTION_EXPIRED", outcome.message);
  return { secret: outcome.secret, conn: outcome.conn };
}

/* ───────────── OAuth (authorization code + PKCE) ───────────── */

export function oauthConfigured(provider: ProviderDef) {
  return Boolean(provider.oauth && process.env[provider.oauth.clientIdEnv] && process.env[provider.oauth.clientSecretEnv]);
}

function oauthUrl(provider: ProviderDef, kind: "authorize" | "token" | "revoke", url: string) {
  // Test env: send OAuth to the fake provider's uniform /oauth/<kind> endpoints; production uses the real URL.
  if (process.env.FLOWLINE_ENV === "test" && process.env.FLOWLINE_PROVIDER_OVERRIDE) return `${resolveBase(provider)}/oauth/${kind}`;
  return url;
}

export function redirectUri() {
  return `${(process.env.FLOWLINE_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/oauth/callback`;
}

export async function startOAuth(db: Db, opts: { userId: string; workspaceId: string; providerId: string; connectionId?: string; redirectAfter?: string }) {
  const provider = getProvider(opts.providerId);
  if (!provider?.oauth) throw notFound("Provider doesn't use OAuth");
  if (!oauthConfigured(provider)) throw new HttpError(400, "OAUTH_NOT_CONFIGURED", `${provider.name} OAuth isn't configured on this server (${provider.oauth.clientIdEnv})`);
  let loginHint: string | undefined;
  if (opts.connectionId) {
    const [conn] = await db
      .select({ provider: schema.connection.provider, accountLabel: schema.connection.accountLabel })
      .from(schema.connection)
      .where(and(eq(schema.connection.id, opts.connectionId), eq(schema.connection.workspaceId, opts.workspaceId)));
    if (!conn) throw notFound("Connection not found");
    if (conn.provider !== provider.id) throw new HttpError(409, "DIFFERENT_PROVIDER", `That connection is for ${conn.provider}, not ${provider.name}`);
    // Reconnect must be the same account: pre-select it where the provider supports a hint (Google).
    const email = /[^\s()<>]+@[^\s()<>]+\.[a-z]{2,}/i.exec(conn.accountLabel)?.[0];
    if (email) loginHint = email;
  }
  const state = randomToken(24);
  let challenge: string | undefined;
  let verifierEnc: string | undefined;
  if (provider.oauth.pkce) {
    const verifier = randomToken(48);
    challenge = createHash("sha256").update(verifier).digest("base64url");
    verifierEnc = JSON.stringify(encryptSecret(verifier));
  }
  await db.insert(schema.oauthState).values({
    state,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    provider: provider.id,
    codeVerifierEnc: verifierEnc ?? null,
    connectionId: opts.connectionId ?? null,
    redirectAfter: opts.redirectAfter ?? null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const u = new URL(oauthUrl(provider, "authorize", provider.oauth.authorizeUrl));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env[provider.oauth.clientIdEnv]!);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", provider.oauth.scopes.join(provider.id === "slack" ? "," : " "));
  u.searchParams.set("state", state);
  if (challenge) {
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.oauth.extraParams ?? {})) u.searchParams.set(k, v);
  if (loginHint) u.searchParams.set("login_hint", loginHint);
  return { url: u.toString() };
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string } | { error: string };

async function tokenRequest(provider: ProviderDef, params: Record<string, string>): Promise<TokenResponse> {
  const o = provider.oauth!;
  const body = new URLSearchParams({ ...params, client_id: process.env[o.clientIdEnv] ?? "", client_secret: process.env[o.clientSecretEnv] ?? "" });
  const res = await safeFetch(oauthUrl(provider, "token", o.tokenUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
    timeoutMs: 15_000,
  });
  let data: Record<string, unknown> = {};
  try {
    data = res.json();
  } catch {
    return { error: `token endpoint returned ${res.status}` };
  }
  // Slack wraps OAuth v2 responses: { ok, access_token | authed_user… }.
  if (data.ok === false || data.error || res.status >= 400) return { error: String(data.error ?? `HTTP ${res.status}`) };
  return data as TokenResponse;
}

export async function completeOAuth(db: Db, opts: { state: string; code: string; userId: string }) {
  const result = await db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.oauthState).where(eq(schema.oauthState.state, opts.state)).for("update");
    if (!st || st.usedAt || st.expiresAt < new Date()) throw new HttpError(400, "OAUTH_STATE_INVALID", "This sign-in link expired or was already used — start again");
    if (st.userId !== opts.userId) throw new HttpError(403, "OAUTH_STATE_INVALID", "This sign-in was started by a different user");
    await tx.update(schema.oauthState).set({ usedAt: new Date() }).where(eq(schema.oauthState.state, opts.state));
    return st;
  });
  const provider = getProvider(result.provider)!;
  const params: Record<string, string> = { grant_type: "authorization_code", code: opts.code, redirect_uri: redirectUri() };
  if (result.codeVerifierEnc) {
    const { ciphertext, keyId } = JSON.parse(result.codeVerifierEnc) as { ciphertext: string; keyId: string };
    params.code_verifier = decryptSecret<string>(ciphertext, keyId);
  }
  const tokens = await tokenRequest(provider, params);
  if ("error" in tokens) throw new HttpError(400, "OAUTH_EXCHANGE_FAILED", `${provider.name} refused the authorization: ${tokens.error}`);
  const creds: StoredSecret = { type: "oauth2", token: tokens.access_token, refreshToken: tokens.refresh_token, settings: {} };
  const id = await identify(provider, creds);
  const scopes = tokens.scope ? tokens.scope.split(/[ ,]+/).filter(Boolean) : provider.oauth!.scopes;
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  if (result.connectionId) {
    const [conn] = await db.select().from(schema.connection).where(and(eq(schema.connection.id, result.connectionId), eq(schema.connection.workspaceId, result.workspaceId)));
    if (!conn) throw notFound("Connection not found");
    if (conn.provider !== provider.id) throw new HttpError(409, "DIFFERENT_PROVIDER", `This connection is for ${conn.provider}, not ${provider.name}. Nothing was changed.`);
    if (conn.accountId !== id.accountId) {
      throw new HttpError(409, "DIFFERENT_ACCOUNT", `You signed in as ${id.label}, but this connection is ${conn.accountLabel}. Nothing was changed.`);
    }
    await storeCredentials(db, conn.id, creds, expiresAt, scopes);
    await resumeFlowsForConnection(db, conn.id);
    return { connectionId: conn.id, workspaceId: result.workspaceId, redirectAfter: result.redirectAfter, reconnected: true };
  }
  const enc = encryptSecret(creds);
  const [row] = await db
    .insert(schema.connection)
    .values({
      workspaceId: result.workspaceId,
      provider: provider.id,
      label: `${provider.name} (${id.label})`,
      authType: "oauth2",
      accountId: id.accountId,
      accountLabel: id.label,
      scopes,
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      accessExpiresAt: expiresAt,
      createdBy: opts.userId,
    })
    .returning();
  return { connectionId: row!.id, workspaceId: result.workspaceId, redirectAfter: result.redirectAfter, reconnected: false };
}

export async function deleteConnection(db: Db, workspaceId: string, connectionId: string) {
  const [conn] = await db.select().from(schema.connection).where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspaceId)));
  if (!conn) throw notFound("Connection not found");
  const provider = getProvider(conn.provider);
  // Best-effort revoke at the provider; the local secret is deleted regardless.
  if (provider?.oauth?.revokeUrl) {
    try {
      const s = decryptSecret<StoredSecret>(conn.secretEnc, conn.keyId);
      await safeFetch(oauthUrl(provider, "revoke", provider.oauth.revokeUrl), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: s.token ?? "" }).toString(), timeoutMs: 8000 });
    } catch {
      /* ignore */
    }
  }
  await pauseFlowsUsingConnection(db, connectionId, "removed");
  await db.delete(schema.connection).where(eq(schema.connection.id, connectionId));
}
