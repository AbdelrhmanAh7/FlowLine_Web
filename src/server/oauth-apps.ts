import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import { getProvider } from "@/integrations/registry";
import { audit, userActor } from "./audit";
import { decryptSecretV2, encryptSecretV2, type SecretContext } from "./crypto";
import { HttpError, notFound } from "./http";
import { OAUTH_FAMILIES, type OAuthFamily } from "./platform-purposes";
import { platformCredentialStatus, resolvePlatformCredential, secretHint } from "./platform-secrets";
import { runProbe } from "./platform-probes";
import { purposeDef } from "./platform-purposes";
import { checkRate } from "./rate-limit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type AppRow = typeof schema.workspaceOauthApp.$inferSelect;

/**
 * OAuth app identity (docs/security/CREDENTIALS_DESIGN.md MUST 13, 16).
 *
 * An app = (source, family, client id). New authorizations use the workspace's own app when it has one, else
 * Flowline's platform app. A connection records the app that ISSUED its tokens and always refreshes with it: a default
 * change only affects new authorizations; switching/deleting an app sends exactly its connections to reconnect;
 * clearing an override never moves connections onto the platform app. Legacy connections without a recorded app are
 * never guessed — they must reconnect.
 */
export interface ResolvedApp {
  source: "platform" | "workspace";
  /** workspace_oauth_app.id for workspace apps; null for the platform app. */
  appId: string | null;
  /** platform_secret purpose for platform apps. */
  purpose: string | null;
  family: OAuthFamily;
  clientId: string;
  secret: string;
  revision: number;
  epoch: number;
  previous: { secret: string; revision: number; validUntil: Date } | null;
}

export class AppUnavailableError extends Error {
  constructor(
    public reason: "reconnect_required" | "app_unavailable",
    message: string,
  ) {
    super(message);
  }
}

const GRACE_MS: Record<OAuthFamily, number> = { google: 7 * 86_400_000, github: 7 * 86_400_000, slack: 0 };

export function familyForProvider(providerId: string): OAuthFamily | null {
  for (const [f, d] of Object.entries(OAUTH_FAMILIES)) if ((d.providers as readonly string[]).includes(providerId)) return f as OAuthFamily;
  return null;
}

function appContext(app: { id: string; workspaceId: string; family: string }, revision: number): SecretContext {
  return { table: "workspace_oauth_app", rowId: app.id, workspaceId: app.workspaceId, provider: app.family, purpose: "oauth_client_secret", revision };
}

async function activeWorkspaceApp(dbOrTx: Db | Tx, workspaceId: string, family: OAuthFamily): Promise<AppRow | null> {
  const [row] = await dbOrTx
    .select()
    .from(schema.workspaceOauthApp)
    .where(and(eq(schema.workspaceOauthApp.workspaceId, workspaceId), eq(schema.workspaceOauthApp.family, family), isNull(schema.workspaceOauthApp.deletedAt)));
  return row ?? null;
}

function openWorkspaceApp(row: AppRow): ResolvedApp {
  const secret = decryptSecretV2<string>(row.secretEnc!, row.keyId!, appContext(row, row.revision));
  let previous: ResolvedApp["previous"] = null;
  if (row.prevSecretEnc && row.prevKeyId && row.prevRevision && row.prevValidUntil && row.prevValidUntil > new Date()) {
    previous = { secret: decryptSecretV2<string>(row.prevSecretEnc, row.prevKeyId, appContext(row, row.prevRevision)), revision: row.prevRevision, validUntil: row.prevValidUntil };
  }
  return { source: "workspace", appId: row.id, purpose: null, family: row.family as OAuthFamily, clientId: row.clientId, secret, revision: row.revision, epoch: row.epoch, previous };
}

async function platformApp(family: OAuthFamily): Promise<ResolvedApp | null> {
  const cred = await resolvePlatformCredential(OAUTH_FAMILIES[family].purpose);
  if (!cred || !cred.publicId) return null;
  return { source: "platform", appId: null, purpose: cred.purpose, family, clientId: cred.publicId, secret: cred.secret, revision: cred.revision, epoch: cred.epoch, previous: cred.previous };
}

/** The app a NEW authorization (Connect / Reconnect) uses in this workspace, or null when none is configured. */
export async function resolveAppForNewAuthorization(workspaceId: string, providerId: string): Promise<ResolvedApp | null> {
  const family = familyForProvider(providerId);
  if (!family) return null;
  const ws = await activeWorkspaceApp(db, workspaceId, family);
  if (ws) return ws.secretEnc ? openWorkspaceApp(ws) : null; // an override is never silently replaced by the platform app
  return platformApp(family);
}

/** Cheap availability check (no decrypt) for catalogs: is Connect possible in this workspace? */
export async function oauthAvailable(workspaceId: string | null, providerId: string): Promise<boolean> {
  const family = familyForProvider(providerId);
  if (!family) return false;
  if (workspaceId) {
    const ws = await activeWorkspaceApp(db, workspaceId, family);
    if (ws) return Boolean(ws.secretEnc);
  }
  return Boolean((await platformCredentialStatus(OAUTH_FAMILIES[family].purpose))?.configured);
}

/** The ISSUING app of an existing connection (refresh / revoke). Throws AppUnavailableError instead of guessing. */
export async function resolveAppForConnection(conn: typeof schema.connection.$inferSelect): Promise<ResolvedApp> {
  const family = familyForProvider(conn.provider);
  if (!family || !conn.oauthAppSource || !conn.oauthClientId) {
    throw new AppUnavailableError("reconnect_required", "This connection was authorized before Flowline recorded which OAuth app issued it");
  }
  if (conn.oauthAppSource === "workspace") {
    const [row] = await db.select().from(schema.workspaceOauthApp).where(and(eq(schema.workspaceOauthApp.id, conn.oauthAppId!), eq(schema.workspaceOauthApp.workspaceId, conn.workspaceId)));
    if (!row || row.deletedAt || !row.secretEnc || row.clientId !== conn.oauthClientId) throw new AppUnavailableError("reconnect_required", "The workspace OAuth app that authorized this connection was changed or removed");
    return openWorkspaceApp(row);
  }
  const app = await platformApp(family);
  if (!app) throw new AppUnavailableError("app_unavailable", "Flowline's OAuth app for this provider isn't available right now");
  if (app.clientId !== conn.oauthClientId) throw new AppUnavailableError("reconnect_required", "Flowline's OAuth app for this provider changed");
  return app;
}

/**
 * Fence (inside the caller's transaction, after its connection row lock): the issuing app must still exist with the
 * same identity and epoch. Takes a SHARE lock on the app row so a concurrent revoke/switch serializes against it.
 */
export async function appStillValid(tx: Tx, app: Pick<ResolvedApp, "source" | "appId" | "purpose" | "clientId" | "epoch">): Promise<boolean> {
  if (app.source === "workspace") {
    const [row] = await tx.select().from(schema.workspaceOauthApp).where(eq(schema.workspaceOauthApp.id, app.appId!)).for("share");
    return Boolean(row && !row.deletedAt && row.secretEnc && row.clientId === app.clientId && row.epoch === app.epoch);
  }
  const [row] = await tx.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, app.purpose!)).for("share");
  return Boolean(row && row.status !== "revoked" && row.secretEnc && row.publicId === app.clientId && row.epoch === app.epoch);
}

/**
 * Marks EXACTLY the active connections issued by an app as needing reconnect (their flows pause; others don't).
 * Runs after the app change committed (dependent effects follow the tombstone, never the reverse lock order).
 */
export async function expireConnectionsOfApp(app: { source: "platform"; family: OAuthFamily; clientId?: string } | { source: "workspace"; appId: string }, reason: "oauth_app_changed" | "oauth_app_revoked" | "oauth_app_deleted"): Promise<number> {
  const where =
    app.source === "workspace"
      ? and(eq(schema.connection.oauthAppSource, "workspace"), eq(schema.connection.oauthAppId, app.appId))
      : and(eq(schema.connection.oauthAppSource, "platform"), inArray(schema.connection.provider, [...OAUTH_FAMILIES[app.family].providers]), app.clientId ? eq(schema.connection.oauthClientId, app.clientId) : sql`true`);
  const rows = await db.select({ id: schema.connection.id }).from(schema.connection).where(and(where, eq(schema.connection.status, "active")));
  const { markConnectionUnhealthy, STATUS_REASONS } = await import("./connections");
  for (const r of rows) await markConnectionUnhealthy(db, r.id, "expired", STATUS_REASONS[reason]);
  return rows.length;
}

/* ───────────── workspace overrides (owner-only `oauthapp.manage`) ───────────── */

export interface WorkspaceOauthAppView {
  id: string;
  family: OAuthFamily;
  clientId: string;
  configured: boolean;
  secretHint: string | null;
  revision: number;
  status: string;
  verifiedAt: Date | null;
  verifiedCurrentRevision: boolean;
  hasPrevious: boolean;
  previousValidUntil: Date | null;
  setAt: Date | null;
  setBy: string | null;
  activeConnections: number;
}

async function countAppConnections(appId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.connection).where(and(eq(schema.connection.oauthAppId, appId), eq(schema.connection.status, "active")));
  return Number(r?.n ?? 0);
}

async function viewOf(row: AppRow): Promise<WorkspaceOauthAppView> {
  const setBy = row.setBy ? (await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, row.setBy)))[0]?.email ?? null : null;
  const prevLive = Boolean(row.prevSecretEnc && row.prevValidUntil && row.prevValidUntil > new Date());
  return {
    id: row.id,
    family: row.family as OAuthFamily,
    clientId: row.clientId,
    configured: Boolean(row.secretEnc),
    secretHint: row.secretHint,
    revision: row.revision,
    status: row.status,
    verifiedAt: row.verifiedAt,
    verifiedCurrentRevision: row.status === "verified" && row.verifiedRevision === row.revision,
    hasPrevious: prevLive,
    previousValidUntil: prevLive ? row.prevValidUntil : null,
    setAt: row.setAt,
    setBy,
    activeConnections: await countAppConnections(row.id),
  };
}

export async function listWorkspaceApps(workspaceId: string) {
  const rows = await db.select().from(schema.workspaceOauthApp).where(and(eq(schema.workspaceOauthApp.workspaceId, workspaceId), isNull(schema.workspaceOauthApp.deletedAt)));
  const apps = await Promise.all(rows.map(viewOf));
  const platform = await Promise.all(
    (Object.keys(OAUTH_FAMILIES) as OAuthFamily[]).map(async (f) => {
      const s = await platformCredentialStatus(OAUTH_FAMILIES[f].purpose);
      return { family: f, platformConfigured: Boolean(s?.configured), platformClientId: s?.configured ? s.publicId : null };
    }),
  );
  return { apps, platform };
}

function validClientId(family: OAuthFamily, clientId: string) {
  const def = purposeDef(OAUTH_FAMILIES[family].purpose)!;
  if (!clientId || clientId.length > 300) return false;
  if (def.publicId!.pattern.test(clientId)) return true;
  return process.env.FLOWLINE_ENV === "test" && Boolean(def.publicId!.testPattern?.test(clientId));
}

function validSecret(secret: string) {
  return secret.length >= 8 && secret.length <= 512 && secret === secret.trim() && !/[\0-\x1f\x7f]/.test(secret);
}

export interface UpsertAppInput {
  clientId: string;
  secret?: string;
  expectedRevision: number;
}

/**
 * Create / rotate / switch a workspace app. Rotation (same client id, new secret) keeps the previous secret for the
 * provider's overlap window. A different client id is a different app: the old one is removed and EXACTLY its
 * connections go to reconnect (the count is shown to the owner first via `previewWorkspaceAppChange`).
 */
export async function upsertWorkspaceApp(user: { id: string; email: string }, workspaceId: string, family: OAuthFamily, input: UpsertAppInput) {
  const clientId = input.clientId.trim();
  if (!validClientId(family, clientId)) throw new HttpError(400, "PUBLIC_ID_INVALID", "This client ID doesn't look right for this provider");
  if (input.secret !== undefined && !validSecret(input.secret)) throw new HttpError(400, "SECRET_INVALID", "Paste the client secret exactly as the provider shows it (no spaces or line breaks).");
  const result = await db.transaction(async (tx) => {
    const existing = await activeWorkspaceApp(tx, workspaceId, family);
    if (existing) await tx.select({ id: schema.workspaceOauthApp.id }).from(schema.workspaceOauthApp).where(eq(schema.workspaceOauthApp.id, existing.id)).for("update");
    if ((existing?.revision ?? 0) !== input.expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This app changed since you loaded it. Reload and try again.");
    const switching = Boolean(existing && existing.clientId !== clientId);
    if ((!existing || switching) && input.secret === undefined) throw new HttpError(400, "SECRET_REQUIRED", "Enter the app's client secret");
    if (existing && !switching && input.secret === undefined) throw new HttpError(400, "NOTHING_TO_CHANGE", "Nothing to change: enter a new client secret");
    if (existing && switching) {
      await tx.update(schema.workspaceOauthApp).set({ status: "deleted", deletedAt: new Date(), secretEnc: null, keyId: null, prevSecretEnc: null, prevKeyId: null, prevRevision: null, prevValidUntil: null, secretHint: null, epoch: existing.epoch + 1, updatedAt: new Date() }).where(eq(schema.workspaceOauthApp.id, existing.id));
    }
    if (!existing || switching) {
      const id = randomUUID();
      const enc = encryptSecretV2(input.secret!, appContext({ id, workspaceId, family }, 1));
      await tx.insert(schema.workspaceOauthApp).values({ id, workspaceId, family, clientId, secretEnc: enc.ciphertext, keyId: enc.keyId, revision: 1, secretHint: secretHint(input.secret!), setBy: user.id, setAt: new Date(), createdBy: user.id });
      await audit(tx, { workspaceId, actor: userActor(user), action: "oauth_app.configured", targetType: "oauth_app", targetId: id, data: { family, clientId, previousClientId: existing?.clientId ?? null } });
      return { id, switchedFrom: switching ? existing!.id : null };
    }
    const revision = existing!.revision + 1;
    const enc = encryptSecretV2(input.secret!, appContext(existing!, revision));
    const grace = GRACE_MS[family];
    await tx
      .update(schema.workspaceOauthApp)
      .set({
        secretEnc: enc.ciphertext,
        keyId: enc.keyId,
        revision,
        secretHint: secretHint(input.secret!),
        prevSecretEnc: grace > 0 ? existing!.secretEnc : null,
        prevKeyId: grace > 0 ? existing!.keyId : null,
        prevRevision: grace > 0 ? existing!.revision : null,
        prevValidUntil: grace > 0 ? new Date(Date.now() + grace) : null,
        status: "configured_unverified",
        setBy: user.id,
        setAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workspaceOauthApp.id, existing!.id));
    await audit(tx, { workspaceId, actor: userActor(user), action: "oauth_app.secret_rotated", targetType: "oauth_app", targetId: existing!.id, data: { family, clientId, revision, graceDays: Math.round(grace / 86_400_000) } });
    return { id: existing!.id, switchedFrom: null as string | null };
  });
  if (result.switchedFrom) {
    const affected = await expireConnectionsOfApp({ source: "workspace", appId: result.switchedFrom }, "oauth_app_changed");
    await db.delete(schema.oauthState).where(eq(schema.oauthState.appId, result.switchedFrom));
    await audit(db, { workspaceId, actor: userActor(user), action: "oauth_app.switched", targetType: "oauth_app", targetId: result.id, data: { family, affectedConnections: affected } });
  }
  const [row] = await db.select().from(schema.workspaceOauthApp).where(eq(schema.workspaceOauthApp.id, result.id));
  return viewOf(row!);
}

/** Deleting an override sends exactly its connections to reconnect (never onto the platform app silently). */
export async function deleteWorkspaceApp(user: { id: string; email: string }, workspaceId: string, family: OAuthFamily, expectedRevision: number) {
  const app = await db.transaction(async (tx) => {
    const existing = await activeWorkspaceApp(tx, workspaceId, family);
    if (!existing) throw notFound("No OAuth app is configured for this provider");
    await tx.select({ id: schema.workspaceOauthApp.id }).from(schema.workspaceOauthApp).where(eq(schema.workspaceOauthApp.id, existing.id)).for("update");
    if (existing.revision !== expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This app changed since you loaded it. Reload and try again.");
    await tx.update(schema.workspaceOauthApp).set({ status: "deleted", deletedAt: new Date(), secretEnc: null, keyId: null, prevSecretEnc: null, prevKeyId: null, prevRevision: null, prevValidUntil: null, secretHint: null, epoch: existing.epoch + 1, updatedAt: new Date() }).where(eq(schema.workspaceOauthApp.id, existing.id));
    return existing;
  });
  const affected = await expireConnectionsOfApp({ source: "workspace", appId: app.id }, "oauth_app_deleted");
  await db.delete(schema.oauthState).where(eq(schema.oauthState.appId, app.id));
  await audit(db, { workspaceId, actor: userActor(user), action: "oauth_app.deleted", targetType: "oauth_app", targetId: app.id, data: { family, clientId: app.clientId, affectedConnections: affected } });
  return { affectedConnections: affected };
}

/** What a switch/delete would do: how many active connections this app issued (shown before confirming). */
export async function previewWorkspaceAppChange(workspaceId: string, family: OAuthFamily) {
  const existing = await activeWorkspaceApp(db, workspaceId, family);
  return { affectedConnections: existing ? await countAppConnections(existing.id) : 0 };
}

export async function probeWorkspaceApp(user: { id: string; email: string }, workspaceId: string, family: OAuthFamily) {
  if (!(await checkRate(`oauthapp-probe:${user.id}`, 5, 60)) || !(await checkRate(`oauthapp-probe-ws:${workspaceId}`, 10, 60))) throw new HttpError(429, "RATE_LIMITED", "Too many tests. Wait a minute and try again.");
  const row = await activeWorkspaceApp(db, workspaceId, family);
  if (!row?.secretEnc) throw notFound("No OAuth app is configured for this provider");
  const app = openWorkspaceApp(row);
  const result = await runProbe(purposeDef(OAUTH_FAMILIES[family].purpose)!, app.clientId, app.secret);
  if (result === "rejected") await db.update(schema.workspaceOauthApp).set({ status: "rejected", updatedAt: new Date() }).where(and(eq(schema.workspaceOauthApp.id, row.id), eq(schema.workspaceOauthApp.revision, row.revision)));
  else if (row.status === "rejected") await db.update(schema.workspaceOauthApp).set({ status: "configured_unverified", updatedAt: new Date() }).where(and(eq(schema.workspaceOauthApp.id, row.id), eq(schema.workspaceOauthApp.revision, row.revision)));
  await audit(db, { workspaceId, actor: userActor(user), action: "oauth_app.probe", targetType: "oauth_app", targetId: row.id, data: { family, result } });
  return { result };
}

/** A real Connect succeeded with this app revision: the only thing that makes it VERIFIED. */
export async function markWorkspaceAppVerified(appId: string, workspaceId: string, revision: number) {
  const changed = await db
    .update(schema.workspaceOauthApp)
    .set({ status: "verified", verifiedRevision: revision, verifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.workspaceOauthApp.id, appId), eq(schema.workspaceOauthApp.revision, revision), isNull(schema.workspaceOauthApp.deletedAt), sql`(${schema.workspaceOauthApp.status} <> 'verified' or ${schema.workspaceOauthApp.verifiedRevision} is distinct from ${revision})`))
    .returning({ id: schema.workspaceOauthApp.id, family: schema.workspaceOauthApp.family, clientId: schema.workspaceOauthApp.clientId });
  if (changed.length) await audit(db, { workspaceId, actor: { kind: "system", label: "oauth" }, action: "oauth_app.verified", targetType: "oauth_app", targetId: appId, data: { family: changed[0]!.family, clientId: changed[0]!.clientId, revision } });
}

/** A workspace app's client credentials were refused by the provider (not a user-token failure). */
export async function reportWorkspaceAppRejected(appId: string, workspaceId: string, revision: number) {
  const changed = await db
    .update(schema.workspaceOauthApp)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(schema.workspaceOauthApp.id, appId), eq(schema.workspaceOauthApp.revision, revision), sql`${schema.workspaceOauthApp.status} <> 'rejected'`))
    .returning({ family: schema.workspaceOauthApp.family });
  if (changed.length) await audit(db, { workspaceId, actor: { kind: "system", label: "oauth" }, action: "oauth_app.rejected_by_provider", targetType: "oauth_app", targetId: appId, data: { family: changed[0]!.family, revision } });
}

/**
 * Consent provenance shown to a member BEFORE redirecting to the provider: which app (Flowline's or the workspace's),
 * its client id, the scopes requested and who configured it. Public identifiers only.
 */
export async function describeAuthorizationApp(workspaceId: string, providerId: string) {
  const provider = getProvider(providerId);
  const family = familyForProvider(providerId);
  if (!provider?.oauth || !family) return null;
  const ws = await activeWorkspaceApp(db, workspaceId, family);
  if (ws) {
    if (!ws.secretEnc) return null;
    const by = ws.setBy ? (await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, ws.setBy)))[0]?.email ?? null : null;
    return { source: "workspace" as const, clientId: ws.clientId, scopes: provider.oauth.scopes, configuredBy: by, configuredAt: ws.setAt, verified: ws.status === "verified" };
  }
  const s = await platformCredentialStatus(OAUTH_FAMILIES[family].purpose);
  if (!s?.configured) return null;
  return { source: "platform" as const, clientId: s.publicId, scopes: provider.oauth.scopes, configuredBy: null, configuredAt: null, verified: null };
}
