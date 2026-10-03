import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Db } from "@/db";
import { decryptSecretV2, encryptSecretV2, type SecretContext } from "./crypto";
import { HttpError, notFound } from "./http";
import { platformAudit, type Assurance } from "./platform-audit";
import { OAUTH_FAMILIES, PURPOSES, purposeDef, type OAuthFamily, type PurposeDef } from "./platform-purposes";
import { checkRate } from "./rate-limit";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Row = typeof schema.platformSecret.$inferSelect;

/**
 * Platform credentials (docs/security/CREDENTIALS_DESIGN.md §2 MUST 6–10, 17–19).
 *
 * - The DB is the ONLY runtime source. There is no "DB, otherwise env" fallback anywhere: an unset, revoked or
 *   unreadable purpose is simply not configured (fail closed), whatever the environment says.
 * - Values are write-only: nothing here returns a secret to a caller outside the server services that use it
 *   (`resolvePlatformCredential`). Views are projections with a public id, a hint (≥ 32 chars only) and metadata.
 * - Replace is compare-and-swap on the revision; an omitted secret keeps the current one; "" is a validation error;
 *   revoke and clear are separate, explicit actions. Every change is audited in the same transaction.
 * - Resolution is per operation (one indexed row read + decrypt); no process caches, so a rotation or revocation is
 *   seen by every web and worker process on its next operation — no restart.
 */

export interface PlatformActor {
  userId: string | null;
  label: string;
  assurance: Assurance;
}

function secretContext(id: string, def: PurposeDef, revision: number): SecretContext {
  return { table: "platform_secret", rowId: id, workspaceId: "platform", scope: "platform", provider: def.provider, purpose: def.purpose, revision };
}

export function secretHint(secret: string) {
  return secret.length >= 32 ? `••••${secret.slice(-4)}` : null;
}

function requireDef(purpose: string): PurposeDef {
  const def = purposeDef(purpose);
  if (!def) throw notFound("Unknown credential");
  return def;
}

function validPublicId(def: PurposeDef, v: string) {
  if (!def.publicId) return false;
  if (v.length > 300 || /[\r\n\0]/.test(v)) return false;
  if (def.publicId.pattern.test(v)) return true;
  // Test stack only: the fake providers use short client ids.
  return process.env.FLOWLINE_ENV === "test" && Boolean(def.publicId.testPattern?.test(v));
}

/** Fixed validation message: the submitted value is never echoed (MUST 7/9). */
function validateSecret(def: PurposeDef, secret: string) {
  if (typeof secret !== "string" || secret.length < def.secret.min || secret.length > def.secret.max || secret !== secret.trim() || /[\0-\x1f\x7f]/.test(secret)) {
    throw new HttpError(400, "SECRET_INVALID", "Paste the secret exactly as the provider shows it (no spaces or line breaks).");
  }
}

/* ───────────── projections ───────────── */

export interface PlatformSecretView {
  purpose: string;
  kind: PurposeDef["kind"];
  provider: string;
  configured: boolean;
  status: "unconfigured" | "configured_unverified" | "verified" | "rejected" | "revoked";
  publicIdLabel: "clientId" | "sender" | "clientToken" | null;
  publicId: string | null;
  secretHint: string | null;
  revision: number;
  setAt: Date | null;
  setBy: string | null;
  verifiedAt: Date | null;
  verifiedVia: string | null;
  verifiedCurrentRevision: boolean;
  hasPrevious: boolean;
  previousValidUntil: Date | null;
  graceDays: number;
  lastProbeAt: Date | null;
  lastProbeResult: string | null;
  revokedAt: Date | null;
  envImport: { available: boolean; imported: boolean; envVars: string[] };
}

function view(def: PurposeDef, row: Row | undefined, setByEmail: string | null, imported: boolean): PlatformSecretView {
  const envVars = [def.env.publicId, def.env.secret].filter((x): x is string => Boolean(x));
  const envPresent = Boolean(process.env[def.env.secret]?.trim()) && (!def.env.publicId || Boolean(process.env[def.env.publicId]?.trim()));
  const configured = Boolean(row?.secretEnc) && row?.status !== "revoked";
  const prevLive = Boolean(row?.prevSecretEnc && row.prevValidUntil && row.prevValidUntil > new Date());
  return {
    purpose: def.purpose,
    kind: def.kind,
    provider: def.provider,
    configured,
    status: !row || (!row.secretEnc && row.status !== "revoked") ? "unconfigured" : (row.status as PlatformSecretView["status"]),
    publicIdLabel: def.publicId?.label ?? null,
    publicId: row?.publicId ?? null,
    secretHint: configured ? (row?.secretHint ?? null) : null,
    revision: row?.revision ?? 0,
    setAt: row?.setAt ?? null,
    setBy: setByEmail,
    verifiedAt: row?.verifiedAt ?? null,
    verifiedVia: row?.verifiedVia ?? null,
    verifiedCurrentRevision: Boolean(row && row.status === "verified" && row.verifiedRevision === row.revision),
    hasPrevious: prevLive,
    previousValidUntil: prevLive ? row!.prevValidUntil : null,
    graceDays: Math.round(def.graceMs / 86_400_000),
    lastProbeAt: row?.lastProbeAt ?? null,
    lastProbeResult: row?.lastProbeResult ?? null,
    revokedAt: row?.revokedAt ?? null,
    envImport: { available: envPresent && !imported && (!row || row.revision === 0), imported, envVars },
  };
}

export async function listPlatformSecretViews(): Promise<PlatformSecretView[]> {
  const rows = await db.select().from(schema.platformSecret);
  const imports = new Set((await db.select({ p: schema.platformEnvImport.purpose }).from(schema.platformEnvImport)).map((r) => r.p));
  const setByIds = [...new Set(rows.map((r) => r.setBy).filter((x): x is string => Boolean(x)))];
  const users = setByIds.length ? await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(inArray(schema.user.id, setByIds)) : [];
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  return PURPOSES.map((def) => {
    const row = rows.find((r) => r.purpose === def.purpose);
    return view(def, row, row?.setBy ? (emailOf.get(row.setBy) ?? row.setBy) : null, imports.has(def.purpose));
  });
}

export async function getPlatformSecretView(purpose: string): Promise<PlatformSecretView> {
  const def = requireDef(purpose);
  return (await listPlatformSecretViews()).find((v) => v.purpose === def.purpose)!;
}

/* ───────────── writes ───────────── */

export interface SetInput {
  publicId?: string;
  secret?: string;
  expectedRevision: number;
}

interface SetResult {
  purpose: string;
  revision: number;
  action: "platform_secret.set" | "platform_secret.rotated" | "platform_secret.switched";
  switchedFrom: string | null;
}

async function setInTx(tx: Tx, actor: PlatformActor, def: PurposeDef, input: SetInput, opts: { importedFromEnv?: boolean; setupChallengeId?: string }): Promise<SetResult> {
  const publicId = input.publicId?.trim();
  if (input.secret !== undefined) validateSecret(def, input.secret);
  if (publicId !== undefined && !validPublicId(def, publicId)) throw new HttpError(400, "PUBLIC_ID_INVALID", def.publicId ? `This ${def.publicId.label === "clientId" ? "client ID" : def.publicId.label === "sender" ? "sender address" : "client-side token"} doesn't look right for ${def.provider}` : "This credential has no public identifier");
  const [row] = await tx.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, def.purpose)).for("update");
  const current = row?.revision ?? 0;
  if (current !== input.expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This credential changed since you loaded it. Reload and try again.");
  const liveSecret = Boolean(row?.secretEnc) && row?.status !== "revoked";
  const nextPublic = publicId ?? row?.publicId ?? null;
  if (def.publicId && !nextPublic) throw new HttpError(400, "PUBLIC_ID_REQUIRED", "Enter the public identifier too");
  if (input.secret === undefined && !liveSecret) throw new HttpError(400, "SECRET_REQUIRED", "Enter the secret");
  if (input.secret === undefined && (publicId === undefined || publicId === row?.publicId)) throw new HttpError(400, "NOTHING_TO_CHANGE", "Nothing to change: enter a new secret or a new public identifier");
  const oauth = def.kind === "oauth_signin" || def.kind === "oauth_integration";
  const clientIdChanged = oauth && liveSecret && Boolean(row?.publicId) && nextPublic !== row!.publicId;
  // A different client id is a different app: it needs its own secret (never "rotates" onto the old one).
  if (clientIdChanged && input.secret === undefined) throw new HttpError(400, "SECRET_REQUIRED", "A different client ID is a different app — enter its client secret");

  const id = row?.id ?? randomUUID();
  const revision = current + 1;
  const plaintext = input.secret ?? decryptSecretV2<string>(row!.secretEnc!, row!.keyId!, secretContext(id, def, current));
  const enc = encryptSecretV2(plaintext, secretContext(id, def, revision));
  const secretChanged = input.secret !== undefined;
  let prev: Pick<Row, "prevSecretEnc" | "prevKeyId" | "prevRevision" | "prevValidUntil"> = { prevSecretEnc: null, prevKeyId: null, prevRevision: null, prevValidUntil: null };
  if (secretChanged && liveSecret && !clientIdChanged && def.graceMs > 0) {
    prev = { prevSecretEnc: row!.secretEnc, prevKeyId: row!.keyId, prevRevision: row!.revision, prevValidUntil: new Date(Date.now() + def.graceMs) };
  } else if (!secretChanged && row) {
    prev = { prevSecretEnc: row.prevSecretEnc, prevKeyId: row.prevKeyId, prevRevision: row.prevRevision, prevValidUntil: row.prevValidUntil };
  }
  const values = {
    publicId: nextPublic,
    secretEnc: enc.ciphertext,
    keyId: enc.keyId,
    revision,
    secretHint: secretHint(plaintext),
    setBy: actor.userId ?? (opts.setupChallengeId ? `setup:${opts.setupChallengeId}` : actor.label),
    setAt: new Date(),
    ...prev,
    status: secretChanged || clientIdChanged || !row || row.status === "revoked" ? "configured_unverified" : row.status,
    // The epoch fences in-flight refreshes/authorizations: it changes when the app IDENTITY changes (switch) or the
    // credential comes back after a revoke — NOT on a same-app secret rotation (tokens issued meanwhile stay valid).
    epoch: !row ? 1 : clientIdChanged || !liveSecret ? row.epoch + 1 : row.epoch,
    revokedAt: null,
    revokedBy: null,
    updatedAt: new Date(),
  };
  if (row) await tx.update(schema.platformSecret).set(values).where(eq(schema.platformSecret.id, id));
  else await tx.insert(schema.platformSecret).values({ id, purpose: def.purpose, ...values });
  const action: SetResult["action"] = !liveSecret ? "platform_secret.set" : clientIdChanged ? "platform_secret.switched" : secretChanged ? "platform_secret.rotated" : "platform_secret.set";
  await platformAudit(tx, {
    actor,
    assurance: actor.assurance,
    action,
    result: "ok",
    targetType: "platform_secret",
    targetId: id,
    purpose: def.purpose,
    oldRevision: current || null,
    newRevision: revision,
    data: { secretUpdated: secretChanged, publicIdChanged: Boolean(publicId !== undefined && publicId !== row?.publicId), importedFromEnv: Boolean(opts.importedFromEnv), graceDays: prev.prevValidUntil ? Math.round(def.graceMs / 86_400_000) : 0 },
  });
  return { purpose: def.purpose, revision, action, switchedFrom: clientIdChanged ? row!.publicId : null };
}

/** Create / replace / rotate / switch. Returns the new projection. */
export async function setPlatformSecret(actor: PlatformActor, purpose: string, input: SetInput, opts: { setupChallengeId?: string } = {}) {
  const def = requireDef(purpose);
  if (purpose === "signin.zitadel") {
    const { getSetting } = await import("./platform-settings");
    if (!await getSetting("signin.zitadel.issuer")) throw new HttpError(409, "ZITADEL_ISSUER_REQUIRED", "Set the ZITADEL issuer before the client credential");
  }
  const result = await db.transaction((tx) => setInTx(tx, actor, def, input, opts));
  if (result.switchedFrom && def.kind === "oauth_integration") {
    // Dependent effects follow the commit (never the other way round): connections issued by the OLD client id can't
    // refresh with the new app — they must reconnect. Only those; nothing moves silently to the new app.
    const { expireConnectionsOfApp } = await import("./oauth-apps");
    await expireConnectionsOfApp({ source: "platform", family: familyOfPurpose(def.purpose)!, clientId: result.switchedFrom }, "oauth_app_changed");
  }
  if (def.kind === "oauth_signin" || def.kind === "oauth_integration") await dropPendingAuthorizations(def, result.action !== "platform_secret.rotated");
  return getPlatformSecretView(def.purpose);
}

function familyOfPurpose(purpose: string): OAuthFamily | null {
  for (const [f, d] of Object.entries(OAUTH_FAMILIES)) if (d.purpose === purpose) return f as OAuthFamily;
  return null;
}

/** Pending authorizations of an app that was switched or revoked can't complete (a rotation keeps them: grace). */
async function dropPendingAuthorizations(def: PurposeDef, drop: boolean) {
  if (!drop) return;
  if (def.kind === "oauth_signin") await db.delete(schema.signinAttempt).where(eq(schema.signinAttempt.provider, def.provider));
  const family = familyOfPurpose(def.purpose);
  if (family) await db.delete(schema.oauthState).where(and(eq(schema.oauthState.appSource, "platform"), inArray(schema.oauthState.provider, [...OAUTH_FAMILIES[family].providers])));
}

/**
 * Revoke: local use stops at commit (secret + previous wiped, epoch bumped). This cannot recall requests already in
 * flight or disable the secret at the provider — the panel says so and links to the provider console.
 */
export async function revokePlatformSecret(actor: PlatformActor, purpose: string, expectedRevision: number) {
  const def = requireDef(purpose);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, def.purpose)).for("update");
    if (!row || !row.secretEnc || row.status === "revoked") throw new HttpError(409, "NOT_CONFIGURED", "This credential isn't configured");
    if (row.revision !== expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This credential changed since you loaded it. Reload and try again.");
    await tx
      .update(schema.platformSecret)
      .set({ secretEnc: null, keyId: null, secretHint: null, prevSecretEnc: null, prevKeyId: null, prevRevision: null, prevValidUntil: null, status: "revoked", revokedAt: new Date(), revokedBy: actor.userId ?? actor.label, epoch: row.epoch + 1, updatedAt: new Date() })
      .where(eq(schema.platformSecret.id, row.id));
    await platformAudit(tx, { actor, assurance: actor.assurance, action: "platform_secret.revoked", result: "ok", targetType: "platform_secret", targetId: row.id, purpose: def.purpose, oldRevision: row.revision, newRevision: null });
  });
  const family = familyOfPurpose(def.purpose);
  if (family) {
    const { expireConnectionsOfApp } = await import("./oauth-apps");
    await expireConnectionsOfApp({ source: "platform", family }, "oauth_app_revoked");
  }
  await dropPendingAuthorizations(def, true);
  return getPlatformSecretView(def.purpose);
}

/** Clear removes a REVOKED credential's row entirely (public id and history of revisions); the audit keeps the record. */
export async function clearPlatformSecret(actor: PlatformActor, purpose: string, expectedRevision: number) {
  const def = requireDef(purpose);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, def.purpose)).for("update");
    if (!row) throw new HttpError(409, "NOT_CONFIGURED", "This credential isn't configured");
    if (row.revision !== expectedRevision) throw new HttpError(409, "REVISION_CONFLICT", "This credential changed since you loaded it. Reload and try again.");
    if (row.status !== "revoked") throw new HttpError(409, "REVOKE_FIRST", "Revoke the credential before clearing it");
    await tx.delete(schema.platformSecret).where(eq(schema.platformSecret.id, row.id));
    await platformAudit(tx, { actor, assurance: actor.assurance, action: "platform_secret.cleared", result: "ok", targetType: "platform_secret", targetId: row.id, purpose: def.purpose, oldRevision: row.revision });
  });
  return getPlatformSecretView(def.purpose);
}

/** How many connections a switch / revoke / clear of this purpose would send to reconnect (shown before confirming). */
export async function affectedConnections(purpose: string): Promise<number> {
  const family = familyOfPurpose(requireDef(purpose).purpose);
  if (!family) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connection)
    .where(and(eq(schema.connection.oauthAppSource, "platform"), inArray(schema.connection.provider, [...OAUTH_FAMILIES[family].providers]), eq(schema.connection.status, "active")));
  return Number(r?.n ?? 0);
}

/**
 * Import from environment: explicit, audited, at most ONCE per purpose (even after a later clear), only into an
 * empty purpose. Nothing is ever imported automatically, and the runtime never reads these variables.
 */
export async function importPlatformSecretFromEnv(actor: PlatformActor, purpose: string) {
  const def = requireDef(purpose);
  const secret = process.env[def.env.secret]?.trim();
  const publicId = def.env.publicId ? process.env[def.env.publicId]?.trim() : undefined;
  if (!secret || (def.env.publicId && !publicId)) throw new HttpError(400, "ENV_NOT_SET", "The environment doesn't hold this credential");
  await db.transaction(async (tx) => {
    const [done] = await tx.select().from(schema.platformEnvImport).where(eq(schema.platformEnvImport.purpose, def.purpose)).for("update");
    if (done) throw new HttpError(409, "ALREADY_IMPORTED", "This credential was already imported from the environment once");
    const [row] = await tx.select({ revision: schema.platformSecret.revision }).from(schema.platformSecret).where(eq(schema.platformSecret.purpose, def.purpose));
    if (row && row.revision > 0) throw new HttpError(409, "ALREADY_CONFIGURED", "This credential is already configured in the panel");
    await tx.insert(schema.platformEnvImport).values({ purpose: def.purpose, importedBy: actor.userId ?? actor.label });
    await setInTx(tx, actor, def, { secret, publicId, expectedRevision: 0 }, { importedFromEnv: true });
    await platformAudit(tx, { actor, assurance: actor.assurance, action: "platform_secret.imported_from_env", result: "ok", targetType: "platform_secret", purpose: def.purpose, newRevision: 1, data: { envVar: def.env.secret } });
  });
  return getPlatformSecretView(def.purpose);
}

/** Records a REAL success (a completed Connect / sign-in / delivery / authenticated probe) for exactly that revision. */
export async function markPlatformSecretVerified(purpose: string, revision: number, via: "connect" | "signin" | "probe" | "send", secretId?: string) {
  const def = purposeDef(purpose);
  if (!def) return;
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(schema.platformSecret)
      .set({ status: "verified", verifiedRevision: revision, verifiedAt: new Date(), verifiedVia: via, updatedAt: new Date() })
      .where(and(eq(schema.platformSecret.purpose, def.purpose), eq(schema.platformSecret.revision, revision), secretId ? eq(schema.platformSecret.id, secretId) : undefined, sql`${schema.platformSecret.status} <> 'revoked'`, sql`(${schema.platformSecret.status} <> 'verified' or ${schema.platformSecret.verifiedRevision} is distinct from ${revision})`))
      .returning({ id: schema.platformSecret.id });
    if (changed.length) await platformAudit(tx, { actor: { userId: null, label: "system" }, assurance: "system", action: "platform_secret.verified", result: "ok", targetType: "platform_secret", targetId: changed[0]!.id, purpose: def.purpose, newRevision: revision, data: { via } });
  });
}

/** The provider refused the app's CLIENT credentials (not a user token): recorded + admins alerted; nothing is expired. */
export async function reportClientAuthRejected(purpose: string, revision: number) {
  const def = purposeDef(purpose);
  if (!def) return;
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ id: schema.platformSecret.id, status: schema.platformSecret.status }).from(schema.platformSecret).where(and(eq(schema.platformSecret.purpose, def.purpose), eq(schema.platformSecret.revision, revision))).for("update");
    if (!row || row.status === "revoked" || row.status === "rejected") return;
    await tx.update(schema.platformSecret).set({ status: "rejected", updatedAt: new Date() }).where(eq(schema.platformSecret.id, row.id));
    await platformAudit(tx, { actor: { userId: null, label: "system" }, assurance: "system", action: "platform_secret.rejected_by_provider", result: "rejected", targetType: "platform_secret", targetId: row.id, purpose: def.purpose, newRevision: revision });
  });
}

/* ───────────── runtime resolution (server services only) ───────────── */

export interface ResolvedCredential {
  id: string;
  purpose: string;
  publicId: string | null;
  secret: string;
  revision: number;
  epoch: number;
  previous: { secret: string; revision: number; validUntil: Date } | null;
}

/**
 * The credential for ONE operation, straight from the DB. null = not configured / revoked (fail closed — never an
 * environment fallback). An undecryptable row is audited and treated as unavailable.
 */
export async function resolvePlatformCredential(purpose: string): Promise<ResolvedCredential | null> {
  const def = purposeDef(purpose);
  if (!def) return null;
  const [row] = await db.select().from(schema.platformSecret).where(eq(schema.platformSecret.purpose, def.purpose));
  if (!row || row.status === "revoked" || !row.secretEnc || !row.keyId) return null;
  try {
    const secret = decryptSecretV2<string>(row.secretEnc, row.keyId, secretContext(row.id, def, row.revision));
    let previous: ResolvedCredential["previous"] = null;
    if (row.prevSecretEnc && row.prevKeyId && row.prevRevision && row.prevValidUntil && row.prevValidUntil > new Date()) {
      previous = { secret: decryptSecretV2<string>(row.prevSecretEnc, row.prevKeyId, secretContext(row.id, def, row.prevRevision)), revision: row.prevRevision, validUntil: row.prevValidUntil };
    }
    return { id: row.id, purpose: def.purpose, publicId: row.publicId, secret, revision: row.revision, epoch: row.epoch, previous };
  } catch {
    await platformAudit(db, { actor: { userId: null, label: "system" }, assurance: "system", action: "platform_secret.decrypt_failed", result: "failed", targetType: "platform_secret", targetId: row.id, purpose: def.purpose, newRevision: row.revision }).catch(() => {});
    return null;
  }
}

/** Metadata only (no decrypt): whether a purpose is usable, and its row id (immutable identity) / public id / revision / epoch. */
export async function platformCredentialStatus(purpose: string, dbOrTx: Db | Tx = db): Promise<{ id: string; configured: boolean; publicId: string | null; revision: number; epoch: number; setBy: string | null } | null> {
  const [row] = await dbOrTx
    .select({ id: schema.platformSecret.id, status: schema.platformSecret.status, secretEnc: schema.platformSecret.secretEnc, publicId: schema.platformSecret.publicId, revision: schema.platformSecret.revision, epoch: schema.platformSecret.epoch, setBy: schema.platformSecret.setBy })
    .from(schema.platformSecret)
    .where(eq(schema.platformSecret.purpose, purpose));
  if (!row) return null;
  return { id: row.id, configured: Boolean(row.secretEnc) && row.status !== "revoked", publicId: row.publicId, revision: row.revision, epoch: row.epoch, setBy: row.setBy };
}

/* ───────────── probe ("Test") ───────────── */

export type ProbeResult = "rejected" | "client_accepted" | "accepted" | "unreachable" | "insufficient_permissions";

/**
 * A read-only check against ONE fixed provider URL. OAuth probes can only reject obviously wrong client credentials
 * (`invalid_client`): they never mark an app VERIFIED — only a real Connect / sign-in does. Email and billing probes
 * call an authenticated no-op endpoint and never send mail or charge anything. A permission-limited probe cannot
 * verify or reject the credential: it preserves the previous status and verification metadata, and audits as
 * unverified. A real delivery verifies a sending-only key. The provider's body is never stored.
 */
export async function probePlatformSecret(actor: PlatformActor, purpose: string) {
  const def = requireDef(purpose);
  if (!(await checkRate(`platform-probe:${actor.userId ?? actor.label}`, 5, 60)) || !(await checkRate(`platform-probe-purpose:${def.purpose}`, 10, 60))) {
    throw new HttpError(429, "RATE_LIMITED", "Too many tests. Wait a minute and try again.");
  }
  const cred = await resolvePlatformCredential(def.purpose);
  if (!cred) throw new HttpError(409, "NOT_CONFIGURED", "This credential isn't configured");
  const { runProbe } = await import("./platform-probes");
  const result = await runProbe(def, cred.publicId, cred.secret);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.platformSecret).where(and(eq(schema.platformSecret.purpose, def.purpose), eq(schema.platformSecret.revision, cred.revision))).for("update");
    if (!row) return; // rotated meanwhile: the result belongs to an old revision
    const status = result === "rejected" ? "rejected" : result === "accepted" ? "verified" : row.status === "rejected" && result === "client_accepted" ? "configured_unverified" : row.status;
    await tx
      .update(schema.platformSecret)
      .set({ lastProbeAt: new Date(), lastProbeResult: result, status, ...(result === "accepted" ? { verifiedRevision: cred.revision, verifiedAt: new Date(), verifiedVia: "probe" } : {}), updatedAt: new Date() })
      .where(eq(schema.platformSecret.id, row.id));
    await platformAudit(tx, { actor, assurance: actor.assurance, action: "platform_secret.probe", result: result === "rejected" ? "rejected" : result === "unreachable" ? "unreachable" : result === "accepted" ? "accepted" : "unverified", targetType: "platform_secret", targetId: row.id, purpose: def.purpose, newRevision: cred.revision });
  });
  return { result, view: await getPlatformSecretView(def.purpose) };
}
