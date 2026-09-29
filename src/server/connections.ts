import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, like, or, sql, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { createProviderHttp } from "@/integrations/http";
import { getProvider } from "@/integrations/registry";
import { ProviderError, type Credentials, type ProviderDef } from "@/integrations/types";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { encryptSecretV2, openSecret, randomToken, sha256Hex, type SecretContext } from "./crypto";
import { HttpError, notFound } from "./http";
import { oauthUrl, redirectUri, revokeAtProvider, tokenRequest, type TokenResult, type TokenSet } from "./oauth-client";
import {
  AppUnavailableError,
  appStillValid,
  familyForProvider,
  markWorkspaceAppVerified,
  oauthAvailable,
  reportWorkspaceAppRejected,
  resolveAppForConnection,
  resolveAppForNewAuthorization,
  type ResolvedApp,
} from "./oauth-apps";
import { OAUTH_FAMILIES } from "./platform-purposes";
import { markPlatformSecretVerified, platformCredentialStatus, reportClientAuthRejected } from "./platform-secrets";

export { redirectUri } from "./oauth-client";

export class ConnectionError extends Error {
  constructor(
    public code: "CONNECTION_MISSING" | "CONNECTION_EXPIRED" | "CONNECTION_REVOKED" | "CONNECTION_SCOPE" | "CONNECTION_WORKSPACE" | "CONNECTION_PROVIDER" | "CONNECTION_PRIVATE" | "CONNECTION_UNAVAILABLE",
    message: string,
    /** CONNECTION_UNAVAILABLE: a temporary provider condition; the same credentials may work later (CXH-14). */
    public retryable = false,
    /** The provider's Retry-After, when it sent one (bounded). */
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

interface StoredSecret extends Credentials {
  refreshToken?: string;
}

type ConnRow = typeof schema.connection.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Bounded status reasons (docs/security/CREDENTIALS_DESIGN.md MUST 21): `status_reason` only ever holds one of these
 * fixed texts — never a provider's error description.
 */
export const STATUS_REASONS = {
  refresh_unavailable: "The access expired and can't be refreshed — reconnect it",
  refresh_refused: "The provider refused to refresh the access — reconnect it",
  oauth_app_unknown: "Authorized before Flowline recorded its OAuth app — reconnect it",
  oauth_app_changed: "The OAuth app changed — reconnect it",
  oauth_app_revoked: "The OAuth app was revoked by an administrator — reconnect it",
  oauth_app_deleted: "The workspace OAuth app was removed — reconnect it",
} as const;

/** Client-safe projection: never includes secret material. */
export function publicConnection(c: ConnRow) {
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
    visibility: c.visibility,
    ownerId: c.createdBy,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
    oauthApp: c.oauthAppSource ? { source: c.oauthAppSource, clientId: c.oauthClientId } : null,
  };
}

/** AAD context of a connection's credentials: bound to this row, workspace and provider. */
function connectionContext(c: { id: string; workspaceId: string; provider: string }): SecretContext {
  return { table: "connection", rowId: c.id, workspaceId: c.workspaceId, provider: c.provider, purpose: "credentials" };
}

function openConnectionSecret(c: ConnRow): StoredSecret {
  return openSecret<StoredSecret>({ ciphertext: c.secretEnc, keyId: c.keyId, legacy: c.legacyCrypto }, connectionContext(c));
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
      // Adapter-built messages (our own text, e.g. an invalid subdomain) — never a raw provider response body.
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

export async function createConnection(db: Db, userId: string, workspaceId: string, providerId: string, label: string, fields: Record<string, string>, opts: { visibility?: "workspace" | "private" } = {}) {
  const provider = getProvider(providerId);
  if (!provider) throw notFound("Unknown provider");
  if (provider.authType === "oauth2" && !fields.token) throw new HttpError(400, "USE_OAUTH", `${provider.name} connects with OAuth`);
  // A pasted token for an OAuth app (e.g. a Slack bot token) has unknown scopes: record the provider's
  // declared scopes, flagged as unverified — the provider still enforces the token's real scopes.
  const creds = provider.authType === "oauth2" ? { type: "oauth2" as const, token: fields.token, settings: { tokenPasted: "true" } } : credentialsFromFields(provider, fields);
  const id = await identify(provider, creds);
  // The row id exists BEFORE encryption so the ciphertext is bound to it (AAD).
  const rowId = randomUUID();
  const enc = encryptSecretV2(creds, connectionContext({ id: rowId, workspaceId, provider: provider.id }));
  const [row] = await db
    .insert(schema.connection)
    .values({
      id: rowId,
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
      legacyCrypto: false,
      createdBy: userId,
      visibility: opts.visibility ?? "workspace",
    })
    .returning();
  return publicConnection(row!);
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
  // A pasted token isn't an OAuth authorization: the connection no longer refreshes through any app.
  await storeCredentials(db, conn, creds, null, undefined, provider.authType === "oauth2" ? null : undefined);
  await resumeFlowsForConnection(db, conn.id);
  return publicConnection((await db.select().from(schema.connection).where(eq(schema.connection.id, conn.id)))[0]!);
}

type AppBinding = { source: "platform" | "workspace"; appId: string | null; clientId: string; epoch: number | null } | null;

async function storeCredentials(db: Db | Tx, conn: Pick<ConnRow, "id" | "workspaceId" | "provider">, creds: StoredSecret, expiresAt: Date | null, scopes?: string[], app?: AppBinding) {
  const enc = encryptSecretV2(creds, connectionContext(conn));
  await db
    .update(schema.connection)
    .set({
      secretEnc: enc.ciphertext,
      keyId: enc.keyId,
      legacyCrypto: false,
      accessExpiresAt: expiresAt,
      status: "active",
      statusReason: null,
      credVersion: sql`${schema.connection.credVersion} + 1`,
      updatedAt: new Date(),
      ...(scopes ? { scopes } : {}),
      ...(app !== undefined ? { oauthAppSource: app?.source ?? null, oauthAppId: app?.appId ?? null, oauthClientId: app?.clientId ?? null, oauthAppEpoch: app?.epoch ?? null } : {}),
    })
    .where(eq(schema.connection.id, conn.id));
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

export async function resumeFlowsForConnection(db: Db | Tx, connectionId: string) {
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
export async function getRuntimeCredentials(db: Db, opts: { connectionId: string; workspaceId: string; providerId: string; requiredScopes: string[]; actingUserId?: string }): Promise<{ creds: Credentials; secrets: string[]; connection: ConnRow }> {
  const [conn] = await db.select().from(schema.connection).where(eq(schema.connection.id, opts.connectionId));
  if (!conn) throw new ConnectionError("CONNECTION_MISSING", "The connection used by this step no longer exists");
  if (conn.workspaceId !== opts.workspaceId) throw new ConnectionError("CONNECTION_WORKSPACE", "The connection belongs to a different workspace");
  if (conn.provider !== opts.providerId) throw new ConnectionError("CONNECTION_PROVIDER", "The connection is for a different app");
  // A private connection is never shared: only runs acting for its creator may use it.
  if (conn.visibility === "private" && (!opts.actingUserId || conn.createdBy !== opts.actingUserId)) {
    throw new ConnectionError("CONNECTION_PRIVATE", `${conn.label} is a private connection of another member — use your own connection`);
  }
  if (conn.status === "revoked") throw new ConnectionError("CONNECTION_REVOKED", `${conn.label} was revoked — reconnect it`);
  if (conn.status !== "active") throw new ConnectionError("CONNECTION_EXPIRED", `${conn.label} needs to be reconnected (${conn.statusReason ?? conn.status})`);
  if (conn.authType === "oauth2") {
    const missing = opts.requiredScopes.filter((s) => !conn.scopes.includes(s));
    if (missing.length) throw new ConnectionError("CONNECTION_SCOPE", `${conn.label} is missing permission: ${missing.join(", ")}`);
  }
  // The issuing app is checked even when the token hasn't expired: a switched/removed app stops its connections now.
  if (conn.oauthAppSource) await assertIssuingAppCurrent(db, conn);
  let secret = openConnectionSecret(conn);
  let current = conn;
  if (conn.authType === "oauth2" && conn.accessExpiresAt && conn.accessExpiresAt.getTime() - Date.now() < 60_000) {
    ({ secret, conn: current } = await refreshLocked(db, conn.id));
  }
  await db.update(schema.connection).set({ lastUsedAt: new Date() }).where(eq(schema.connection.id, conn.id));
  const secrets = [secret.token, secret.password, secret.refreshToken, secret.connectionString].filter((s): s is string => Boolean(s));
  const { refreshToken: _r, ...creds } = secret;
  return { creds, secrets, connection: current };
}

/**
 * Metadata check (no decrypt of the app secret) at EVERY credential access (CXH-01): the issuing app (the workspace's
 * own app or Flowline's platform app) must still exist, be un-revoked, have the same client id and, when recorded, the
 * epoch the tokens were issued under. The expiry sweep after a revoke/switch/delete is not relied on alone: a
 * connection it missed (a racing callback, a crash between commit and sweep) is refused and expired here.
 * (A request already sent to the provider can't be recalled; the boundary is the next credential access.)
 */
async function assertIssuingAppCurrent(db: Db, conn: ConnRow) {
  let reason: "oauth_app_changed" | "oauth_app_revoked" | "oauth_app_deleted" | null = null;
  if (conn.oauthAppSource === "workspace") {
    const [app] = await db
      .select({ clientId: schema.workspaceOauthApp.clientId, deletedAt: schema.workspaceOauthApp.deletedAt, epoch: schema.workspaceOauthApp.epoch })
      .from(schema.workspaceOauthApp)
      .where(eq(schema.workspaceOauthApp.id, conn.oauthAppId!));
    if (!app || app.deletedAt) reason = "oauth_app_changed";
    else if (app.clientId !== conn.oauthClientId || (conn.oauthAppEpoch !== null && app.epoch !== conn.oauthAppEpoch)) reason = "oauth_app_changed";
  } else if (conn.oauthAppSource === "platform") {
    const family = familyForProvider(conn.provider);
    const status = family ? await platformCredentialStatus(OAUTH_FAMILIES[family].purpose, db) : null;
    if (!status || !status.configured) reason = "oauth_app_revoked"; // revoked or cleared
    else if (status.publicId !== conn.oauthClientId) reason = "oauth_app_changed";
    else if (conn.oauthAppEpoch !== null && status.epoch !== conn.oauthAppEpoch) reason = "oauth_app_revoked"; // configured again after a revoke
  }
  if (reason) {
    await markConnectionUnhealthy(db, conn.id, "expired", STATUS_REASONS[reason]);
    throw new ConnectionError("CONNECTION_EXPIRED", `${conn.label} needs to be reconnected (${STATUS_REASONS[reason]})`);
  }
}

class RefreshFailure extends Error {
  constructor(
    public kind: "client_auth" | "transient" | "unavailable" | "app_unavailable",
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** Token request with the app's current secret, then (only on a CLIENT-auth refusal) its previous secret in the grace window. */
async function tokenRequestWithGrace(provider: ProviderDef, app: ResolvedApp, params: Record<string, string>): Promise<{ result: TokenResult; revision: number }> {
  const first = await tokenRequest(provider, { clientId: app.clientId, secret: app.secret }, params);
  if (first.ok || first.kind !== "client_auth" || !app.previous || app.previous.validUntil <= new Date()) return { result: first, revision: app.revision };
  // A client-auth refusal happens before the grant is looked at: the code / refresh token was NOT consumed.
  const second = await tokenRequest(provider, { clientId: app.clientId, secret: app.previous.secret }, params);
  return { result: second, revision: second.ok ? app.previous.revision : app.revision };
}

async function reportAppRejected(app: ResolvedApp, workspaceId: string, revision: number) {
  if (app.source === "platform") await reportClientAuthRejected(app.purpose!, revision);
  else await reportWorkspaceAppRejected(app.appId!, workspaceId, revision);
}

async function refreshLocked(db: Db, connectionId: string): Promise<{ secret: StoredSecret; conn: ConnRow }> {
  // The row lock serializes refreshes: a rotating refresh token is only ever spent once. It is held until commit, so a
  // concurrent connection revoke waits for us and then wins; an APP revoke/switch is fenced (SHARE lock + epoch) below.
  // A denial is COMMITTED (connection expired + its flows paused) before the error is raised,
  // so throwing never rolls back the state the rest of the app relies on.
  let reported = null as { app: ResolvedApp; workspaceId: string; revision: number } | null;
  const outcome = await db
    .transaction(async (tx) => {
      const [conn] = await tx.select().from(schema.connection).where(eq(schema.connection.id, connectionId)).for("update");
      if (!conn) return { ok: false as const, code: "CONNECTION_MISSING" as const, message: "The connection used by this step no longer exists" };
      // Revoked/expired while we waited for the lock: never resurrect it.
      if (conn.status !== "active") return { ok: false as const, code: conn.status === "revoked" ? ("CONNECTION_REVOKED" as const) : ("CONNECTION_EXPIRED" as const), message: `${conn.label} needs to be reconnected (${conn.statusReason ?? conn.status})` };
      let secret = openConnectionSecret(conn);
      // Another worker refreshed while we waited for the lock → use its token.
      if (conn.accessExpiresAt && conn.accessExpiresAt.getTime() - Date.now() >= 60_000) return { ok: true as const, secret, conn };
      const provider = getProvider(conn.provider)!;
      const deny = async (reason: keyof typeof STATUS_REASONS) => {
        await tx.update(schema.connection).set({ status: "expired", statusReason: STATUS_REASONS[reason], updatedAt: new Date() }).where(eq(schema.connection.id, connectionId));
        await tx
          .update(schema.flow)
          .set({ pausedReason: `connection:${connectionId}:expired`, pausedAt: new Date() })
          .where(and(usesConnection(connectionId), isNull(schema.flow.deletedAt), isNull(schema.flow.pausedReason)));
        return { ok: false as const, code: "CONNECTION_EXPIRED" as const, message: `${conn.label}: ${STATUS_REASONS[reason]}` };
      };
      if (!provider.oauth || !secret.refreshToken) return deny("refresh_unavailable");
      let app: ResolvedApp;
      try {
        app = await resolveAppForConnection(conn);
      } catch (e) {
        if (e instanceof AppUnavailableError && e.reason === "reconnect_required") return deny(conn.oauthAppSource ? "oauth_app_changed" : "oauth_app_unknown");
        if (e instanceof AppUnavailableError) throw new RefreshFailure("app_unavailable", `${provider.name}: ${e.message} — an administrator must configure it. The connection was not changed.`);
        throw e;
      }
      // Tokens issued under an older epoch of the app (revoked, then configured again) are never refreshed.
      if (conn.oauthAppEpoch !== null && app.epoch !== conn.oauthAppEpoch) return deny(app.source === "workspace" ? "oauth_app_changed" : "oauth_app_revoked");
      const { result, revision } = await tokenRequestWithGrace(provider, app, { grant_type: "refresh_token", refresh_token: secret.refreshToken });
      if (!result.ok) {
        // The APP's credentials were refused: the user's refresh token is intact. Fail this step, alert admins, and
        // never mark the connection expired or pause its flows (MUST 15).
        if (result.kind === "client_auth") {
          reported = { app, workspaceId: conn.workspaceId, revision };
          throw new RefreshFailure("client_auth", `${provider.name} rejected the OAuth app's client credentials — an administrator must fix them. The connection was not changed.`);
        }
        // A temporary provider condition (rate limit, 5xx, network): keep the credentials, fail retryably (CXH-14).
        if (result.kind === "transient") {
          const wait = result.retryAfterMs !== undefined ? ` Retry after ${Math.ceil(result.retryAfterMs / 1000)}s.` : "";
          throw new RefreshFailure("transient", `Couldn't refresh ${conn.label}: ${provider.name} is temporarily unavailable (${result.code}). The connection was not changed.${wait}`, result.retryAfterMs);
        }
        // Only a RECOGNIZED permanent grant failure costs the user their connection; anything else keeps it.
        if (result.kind === "unavailable") throw new RefreshFailure("unavailable", `Couldn't refresh ${conn.label}: ${provider.name} returned an unexpected error (${result.code}). The connection was not changed.`);
        return deny("refresh_refused");
      }
      // Fence: the issuing app must still be the same, un-revoked app (SHARE lock serializes with a revoke/switch).
      if (!(await appStillValid(tx, app))) return deny(app.source === "workspace" ? "oauth_app_deleted" : "oauth_app_revoked");
      const tokens: TokenSet = result.tokens;
      secret = { ...secret, token: tokens.access_token, refreshToken: tokens.refresh_token ?? secret.refreshToken };
      const enc = encryptSecretV2(secret, connectionContext(conn));
      const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
      const [updated] = await tx
        .update(schema.connection)
        .set({ secretEnc: enc.ciphertext, keyId: enc.keyId, legacyCrypto: false, accessExpiresAt: expiresAt, credVersion: sql`${schema.connection.credVersion} + 1`, updatedAt: new Date() })
        .where(and(eq(schema.connection.id, connectionId), eq(schema.connection.credVersion, conn.credVersion), eq(schema.connection.status, "active")))
        .returning();
      if (!updated) return { ok: false as const, code: "CONNECTION_EXPIRED" as const, message: `${conn.label} changed while refreshing — try again` };
      return { ok: true as const, secret, conn: updated };
    })
    .catch(async (e: unknown) => {
      if (e instanceof RefreshFailure) {
        if (e.kind === "client_auth" && reported) await reportAppRejected(reported.app, reported.workspaceId, reported.revision).catch(() => {});
        if (e.kind === "transient") throw new ConnectionError("CONNECTION_UNAVAILABLE", e.message, true, e.retryAfterMs);
        throw new ConnectionError("CONNECTION_PROVIDER", e.message);
      }
      throw e;
    });
  if (!outcome.ok) throw new ConnectionError(outcome.code, outcome.message);
  return { secret: outcome.secret, conn: outcome.conn };
}

/* ───────────── OAuth (authorization code + PKCE) ───────────── */

/** Whether Connect is possible for this provider (in this workspace, when given). Never reads the environment. */
export async function oauthConfigured(provider: ProviderDef, workspaceId: string | null = null) {
  return Boolean(provider.oauth) && (await oauthAvailable(workspaceId, provider.id));
}

function stateContext(stateHash: string, st: { workspaceId: string; provider: string }): SecretContext {
  return { table: "oauth_state", rowId: stateHash, workspaceId: st.workspaceId, provider: st.provider, purpose: "pkce_verifier" };
}

export async function startOAuth(db: Db, opts: { userId: string; sessionToken: string; workspaceId: string; providerId: string; connectionId?: string; redirectAfter?: string }) {
  const provider = getProvider(opts.providerId);
  if (!provider?.oauth) throw notFound("Provider doesn't use OAuth");
  const app = await resolveAppForNewAuthorization(opts.workspaceId, provider.id);
  if (!app) throw new HttpError(400, "OAUTH_NOT_CONFIGURED", `${provider.name} sign-in isn't configured by an administrator yet`);
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
  const state = randomToken(32);
  const stateHash = sha256Hex(state);
  let challenge: string | undefined;
  let verifierEnc: string | undefined;
  if (provider.oauth.pkce) {
    const verifier = randomToken(48);
    challenge = createHash("sha256").update(verifier).digest("base64url");
    verifierEnc = JSON.stringify(encryptSecretV2(verifier, stateContext(stateHash, { workspaceId: opts.workspaceId, provider: provider.id })));
  }
  const redirect = redirectUri();
  await db.insert(schema.oauthState).values({
    state: stateHash,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    provider: provider.id,
    codeVerifierEnc: verifierEnc ?? null,
    connectionId: opts.connectionId ?? null,
    redirectAfter: opts.redirectAfter ?? null,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    sessionHash: sha256Hex(opts.sessionToken),
    appSource: app.source,
    appId: app.appId,
    clientId: app.clientId,
    appRevision: app.revision,
    appEpoch: app.epoch,
    redirectUri: redirect,
  });
  const u = new URL(oauthUrl(provider, "authorize", provider.oauth.authorizeUrl));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", app.clientId);
  u.searchParams.set("redirect_uri", redirect);
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

/** Membership + capability, re-checked at callback time (before the exchange AND before storing). */
async function assertStillAllowed(db: Db | Tx, workspaceId: string, userId: string, connectionId: string | null) {
  const [m] = await db.select({ role: schema.workspaceMember.role }).from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  if (!m || !can(m.role, "integration.manage")) throw new HttpError(403, "OAUTH_ACCESS_REVOKED", "You no longer have access to connect apps in this workspace");
  if (connectionId) {
    const [c] = await db.select({ id: schema.connection.id }).from(schema.connection).where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspaceId)));
    if (!c) throw notFound("Connection not found");
  }
}

/** The app pinned by the state must still be the same, un-revoked app (identity + epoch); returns it with its secrets. */
async function appForState(st: typeof schema.oauthState.$inferSelect): Promise<ResolvedApp> {
  const current = await resolveAppForNewAuthorization(st.workspaceId, st.provider).catch(() => null);
  if (!current || current.source !== st.appSource || current.appId !== st.appId || current.clientId !== st.clientId || current.epoch !== st.appEpoch) {
    throw new HttpError(409, "OAUTH_APP_CHANGED", "The OAuth app changed while you were signing in — start again");
  }
  return current;
}

export async function completeOAuth(db: Db, opts: { state: string; code: string; userId: string; sessionToken: string }) {
  const stateHash = sha256Hex(opts.state);
  const st = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.oauthState).where(eq(schema.oauthState.state, stateHash)).for("update");
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new HttpError(400, "OAUTH_STATE_INVALID", "This sign-in link expired or was already used — start again");
    if (row.userId !== opts.userId) throw new HttpError(403, "OAUTH_STATE_INVALID", "This sign-in was started by a different user");
    if (!row.sessionHash || row.sessionHash !== sha256Hex(opts.sessionToken)) throw new HttpError(403, "OAUTH_STATE_INVALID", "This sign-in was started in a different session — start again");
    await tx.update(schema.oauthState).set({ usedAt: new Date() }).where(eq(schema.oauthState.state, stateHash));
    return row;
  });
  const provider = getProvider(st.provider)!;
  await assertStillAllowed(db, st.workspaceId, opts.userId, st.connectionId);
  const app = await appForState(st);
  const params: Record<string, string> = { grant_type: "authorization_code", code: opts.code, redirect_uri: st.redirectUri ?? redirectUri() };
  if (st.codeVerifierEnc) {
    const { ciphertext, keyId } = JSON.parse(st.codeVerifierEnc) as { ciphertext: string; keyId: string };
    params.code_verifier = openSecret<string>({ ciphertext, keyId, legacy: false }, stateContext(stateHash, st));
  }
  const { result, revision } = await tokenRequestWithGrace(provider, app, params);
  if (!result.ok) {
    if (result.kind === "client_auth") await reportAppRejected(app, st.workspaceId, revision).catch(() => {});
    throw new HttpError(400, "OAUTH_EXCHANGE_FAILED", `${provider.name} refused the authorization (${result.kind === "client_auth" ? "app_credentials_rejected" : result.code})`);
  }
  const tokens = result.tokens;
  const creds: StoredSecret = { type: "oauth2", token: tokens.access_token, refreshToken: tokens.refresh_token, settings: {} };
  const id = await identify(provider, creds);
  const scopes = tokens.scope ? tokens.scope.split(/[ ,]+/).filter(Boolean) : provider.oauth!.scopes;
  const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
  // Re-check right before storing: membership, capability and the app may have changed during the exchange.
  await assertStillAllowed(db, st.workspaceId, opts.userId, st.connectionId);
  await appForState(st);
  const binding: AppBinding = { source: app.source, appId: app.appId, clientId: app.clientId, epoch: app.epoch };
  const appChanged = () => new HttpError(409, "OAUTH_APP_CHANGED", "The OAuth app changed while you were signing in — start again");
  // Store under a fence (CXH-01): the issuing app row is SHARE-locked and re-checked (not revoked/deleted, same client id,
  // same epoch) in the SAME transaction that writes the connection. A revoke/switch/delete (FOR UPDATE on that row)
  // therefore either commits first — and this callback stores nothing — or waits for this commit, and its expiry sweep
  // then finds the new connection. Lock order matches refreshLocked (connection row, then app row).
  const out = await db.transaction(async (tx) => {
    if (st.connectionId) {
      const [conn] = await tx.select().from(schema.connection).where(and(eq(schema.connection.id, st.connectionId), eq(schema.connection.workspaceId, st.workspaceId))).for("update");
      if (!conn) throw notFound("Connection not found");
      if (conn.provider !== provider.id) throw new HttpError(409, "DIFFERENT_PROVIDER", `This connection is for ${conn.provider}, not ${provider.name}. Nothing was changed.`);
      if (conn.accountId !== id.accountId) {
        throw new HttpError(409, "DIFFERENT_ACCOUNT", `You signed in as ${id.label}, but this connection is ${conn.accountLabel}. Nothing was changed.`);
      }
      if (!(await appStillValid(tx, app))) throw appChanged();
      await assertStillAllowed(tx, st.workspaceId, opts.userId, st.connectionId);
      await storeCredentials(tx, conn, creds, expiresAt, scopes, binding);
      await resumeFlowsForConnection(tx, conn.id);
      return { connectionId: conn.id, workspaceId: st.workspaceId, redirectAfter: st.redirectAfter, reconnected: true };
    }
    if (!(await appStillValid(tx, app))) throw appChanged();
    await assertStillAllowed(tx, st.workspaceId, opts.userId, null);
    const rowId = randomUUID();
    const enc = encryptSecretV2(creds, connectionContext({ id: rowId, workspaceId: st.workspaceId, provider: provider.id }));
    const [row] = await tx
      .insert(schema.connection)
      .values({
        id: rowId,
        workspaceId: st.workspaceId,
        provider: provider.id,
        label: `${provider.name} (${id.label})`,
        authType: "oauth2",
        accountId: id.accountId,
        accountLabel: id.label,
        scopes,
        secretEnc: enc.ciphertext,
        keyId: enc.keyId,
        legacyCrypto: false,
        accessExpiresAt: expiresAt,
        createdBy: opts.userId,
        oauthAppSource: binding.source,
        oauthAppId: binding.appId,
        oauthClientId: binding.clientId,
        oauthAppEpoch: binding.epoch,
      })
      .returning();
    return { connectionId: row!.id, workspaceId: st.workspaceId, redirectAfter: st.redirectAfter, reconnected: false };
  });
  // A real Connect is the ONLY thing that verifies an app revision.
  if (app.source === "platform") await markPlatformSecretVerified(app.purpose!, revision, "connect");
  else await markWorkspaceAppVerified(app.appId!, st.workspaceId, revision);
  return out;
}

export async function deleteConnection(db: Db, workspaceId: string, connectionId: string): Promise<{ remoteRevocation: "revoked" | "failed" | "unsupported" }> {
  const [conn] = await db.select().from(schema.connection).where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspaceId)));
  if (!conn) throw notFound("Connection not found");
  const provider = getProvider(conn.provider);
  // Best-effort, provider-specific revoke at the provider; the local secret is deleted regardless.
  let remoteRevocation: "revoked" | "failed" | "unsupported" = "unsupported";
  if (provider?.oauth) {
    try {
      const s = openConnectionSecret(conn);
      const app = conn.oauthAppSource ? await resolveAppForConnection(conn).catch(() => null) : null;
      remoteRevocation = await revokeAtProvider(provider, { access: s.token, refresh: s.refreshToken }, app ? { clientId: app.clientId, secret: app.secret } : null);
    } catch {
      remoteRevocation = "failed";
    }
  }
  await pauseFlowsUsingConnection(db, connectionId, "removed");
  await db.delete(schema.connection).where(eq(schema.connection.id, connectionId));
  return { remoteRevocation };
}

/** Only the creator may change a connection's visibility (a private credential is never made shared by someone else). */
export async function setVisibility(db: Db, userId: string, workspaceId: string, connectionId: string, visibility: "workspace" | "private") {
  const [c] = await db.select().from(schema.connection).where(and(eq(schema.connection.id, connectionId), eq(schema.connection.workspaceId, workspaceId)));
  if (!c) throw notFound("Connection not found");
  if (c.createdBy !== userId) throw new HttpError(403, "NOT_CONNECTION_OWNER", "Only the member who created this connection can change who may use it");
  const [row] = await db.update(schema.connection).set({ visibility, updatedAt: new Date() }).where(eq(schema.connection.id, c.id)).returning();
  return publicConnection(row!);
}

/**
 * Connections a user may put into a flow: workspace-shared ones plus their own private ones.
 * Used when saving/publishing so another member's private credential can't be referenced.
 */
export async function assertConnectionsUsable(db: Db, userId: string, workspaceId: string, connectionIds: string[]) {
  if (connectionIds.length === 0) return;
  const rows = await db.select({ id: schema.connection.id, visibility: schema.connection.visibility, createdBy: schema.connection.createdBy, label: schema.connection.label, workspaceId: schema.connection.workspaceId }).from(schema.connection).where(inArray(schema.connection.id, connectionIds));
  for (const r of rows) {
    if (r.workspaceId !== workspaceId) throw new HttpError(422, "CONNECTION_WORKSPACE", "A step uses a connection from another workspace");
    if (r.visibility === "private" && r.createdBy !== userId) throw new HttpError(422, "CONNECTION_PRIVATE", `"${r.label}" is another member's private connection — choose your own or a shared one`);
  }
}
