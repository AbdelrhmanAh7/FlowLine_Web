import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { contextId, isCurrentEnvelope, rewrapSecret, type SecretContext } from "./crypto";
import { encryptAccountTokens } from "./auth-token-adapter";
import { platformAudit } from "./platform-audit";
import { OAUTH_FAMILIES, purposeDef, type OAuthFamily } from "./platform-purposes";

/**
 * Operator maintenance for crypto v2 (docs/security/CREDENTIALS_DESIGN.md MUST 4–5), run by scripts/admin/rewrap.mts:
 *
 * - LEGACY → v2: rows still marked legacy (v1, no AAD) are re-encrypted with their TRUSTED row context (read from the
 *   row itself), and their legacy flag is cleared — after this, the domain refuses v1 entirely.
 * - KEK rotation: every v2 envelope not under the ring's current key has its data key re-wrapped (payload untouched);
 *   AI hub Wave A blobs are upgraded to envelopes. Old keys can be retired once `remaining` is 0 everywhere.
 * - Social-login tokens written before encryption are encrypted in place.
 * Each row is updated with a compare-and-swap on its old ciphertext, so concurrent writers are never overwritten.
 * Rewrapping does NOT invalidate copies stolen with an old key: after a compromise, rotate the provider secrets too.
 */
export interface RewrapReport {
  table: string;
  rewrapped: number;
  legacyUpgraded: number;
  failed: number;
}

function report(table: string): RewrapReport {
  return { table, rewrapped: 0, legacyUpgraded: 0, failed: 0 };
}

function step(r: RewrapReport, ciphertext: string, keyId: string, ctx: SecretContext, legacy: boolean): { ciphertext: string; keyId: string } | null {
  if (!legacy && isCurrentEnvelope(ciphertext, ctx)) return null;
  try {
    const out = rewrapSecret(ciphertext, keyId, ctx, { legacyV1: legacy });
    if (legacy) r.legacyUpgraded++;
    else r.rewrapped++;
    return out;
  } catch {
    r.failed++;
    return null;
  }
}

export async function rewrapAll(opts: { dryRun?: boolean } = {}): Promise<RewrapReport[]> {
  const out: RewrapReport[] = [];
  const write = !opts.dryRun;

  const conn = report("connection");
  for (const c of await db.select().from(schema.connection)) {
    const next = step(conn, c.secretEnc, c.keyId, { table: "connection", rowId: c.id, workspaceId: c.workspaceId, provider: c.provider, purpose: "credentials" }, c.legacyCrypto);
    if (next && write) await db.update(schema.connection).set({ secretEnc: next.ciphertext, keyId: next.keyId, legacyCrypto: false }).where(and(eq(schema.connection.id, c.id), eq(schema.connection.secretEnc, c.secretEnc)));
  }
  out.push(conn);

  const hooks = report("webhook_endpoint");
  for (const w of await db.select().from(schema.webhookEndpoint)) {
    const next = step(hooks, w.secretEnc, w.keyId, { table: "webhook_endpoint", rowId: w.id, workspaceId: w.workspaceId, provider: "flowline", purpose: "signing_secret" }, w.legacyCrypto);
    if (next && write) await db.update(schema.webhookEndpoint).set({ secretEnc: next.ciphertext, keyId: next.keyId, legacyCrypto: false }).where(and(eq(schema.webhookEndpoint.id, w.id), eq(schema.webhookEndpoint.secretEnc, w.secretEnc)));
  }
  out.push(hooks);

  const sso = report("sso_config");
  for (const s of await db.select().from(schema.ssoConfig)) {
    const next = step(sso, s.clientSecretEnc, s.keyId, { table: "sso_config", rowId: s.workspaceId, workspaceId: s.workspaceId, provider: "oidc", purpose: "client_secret" }, s.legacyCrypto);
    if (next && write) await db.update(schema.ssoConfig).set({ clientSecretEnc: next.ciphertext, keyId: next.keyId, legacyCrypto: false }).where(and(eq(schema.ssoConfig.workspaceId, s.workspaceId), eq(schema.ssoConfig.clientSecretEnc, s.clientSecretEnc)));
  }
  out.push(sso);

  const steps = report("run_step");
  const stepRows = await db
    .select({ id: schema.runStep.id, runId: schema.runStep.runId, nodeId: schema.runStep.nodeId, dataEnc: schema.runStep.dataEnc, legacy: schema.runStep.dataLegacy, workspaceId: schema.run.workspaceId })
    .from(schema.runStep)
    .innerJoin(schema.run, eq(schema.run.id, schema.runStep.runId))
    .where(isNotNull(schema.runStep.dataEnc));
  for (const s of stepRows) {
    const next = step(steps, s.dataEnc!.ciphertext, s.dataEnc!.keyId, { table: "run_step", rowId: `${s.runId}.${contextId(s.nodeId)}`, workspaceId: s.workspaceId, provider: "engine", purpose: "step_data" }, s.legacy);
    if (next && write) await db.update(schema.runStep).set({ dataEnc: next, dataLegacy: false }).where(and(eq(schema.runStep.id, s.id), sql`${schema.runStep.dataEnc}->>'ciphertext' = ${s.dataEnc!.ciphertext}`));
  }
  out.push(steps);

  const ai = report("ai_connection");
  for (const a of await db.select().from(schema.aiConnection).where(isNotNull(schema.aiConnection.secretEnc))) {
    // Same context as src/ai/hub/credentials.ts (aiSecretContext).
    const next = step(ai, a.secretEnc!, a.keyId!, { table: "ai_connection", rowId: a.id, workspaceId: a.workspaceId, provider: a.provider, purpose: "api_key" }, false);
    if (next && write) await db.update(schema.aiConnection).set({ secretEnc: next.ciphertext, keyId: next.keyId }).where(and(eq(schema.aiConnection.id, a.id), eq(schema.aiConnection.secretEnc, a.secretEnc!)));
  }
  out.push(ai);

  const platform = report("platform_secret");
  for (const p of await db.select().from(schema.platformSecret)) {
    const def = purposeDef(p.purpose);
    if (!def) continue;
    const ctx = (revision: number): SecretContext => ({ table: "platform_secret", rowId: p.id, workspaceId: "platform", scope: "platform", provider: def.provider, purpose: def.purpose, revision });
    const cur = p.secretEnc && p.keyId ? step(platform, p.secretEnc, p.keyId, ctx(p.revision), false) : null;
    const prev = p.prevSecretEnc && p.prevKeyId && p.prevRevision ? step(platform, p.prevSecretEnc, p.prevKeyId, ctx(p.prevRevision), false) : null;
    if ((cur || prev) && write) {
      await db
        .update(schema.platformSecret)
        .set({ ...(cur ? { secretEnc: cur.ciphertext, keyId: cur.keyId } : {}), ...(prev ? { prevSecretEnc: prev.ciphertext, prevKeyId: prev.keyId } : {}) })
        .where(and(eq(schema.platformSecret.id, p.id), eq(schema.platformSecret.revision, p.revision)));
    }
  }
  out.push(platform);

  const apps = report("workspace_oauth_app");
  for (const a of await db.select().from(schema.workspaceOauthApp).where(isNull(schema.workspaceOauthApp.deletedAt))) {
    const ctx = (revision: number): SecretContext => ({ table: "workspace_oauth_app", rowId: a.id, workspaceId: a.workspaceId, provider: a.family, purpose: "oauth_client_secret", revision });
    const cur = a.secretEnc && a.keyId ? step(apps, a.secretEnc, a.keyId, ctx(a.revision), false) : null;
    const prev = a.prevSecretEnc && a.prevKeyId && a.prevRevision ? step(apps, a.prevSecretEnc, a.prevKeyId, ctx(a.prevRevision), false) : null;
    if ((cur || prev) && write) {
      await db
        .update(schema.workspaceOauthApp)
        .set({ ...(cur ? { secretEnc: cur.ciphertext, keyId: cur.keyId } : {}), ...(prev ? { prevSecretEnc: prev.ciphertext, prevKeyId: prev.keyId } : {}) })
        .where(and(eq(schema.workspaceOauthApp.id, a.id), eq(schema.workspaceOauthApp.revision, a.revision)));
    }
  }
  out.push(apps);

  const accounts = report("account");
  for (const a of await db.select().from(schema.account).where(sql`${schema.account.accessToken} is not null or ${schema.account.refreshToken} is not null or ${schema.account.idToken} is not null`)) {
    const plain = [a.accessToken, a.refreshToken, a.idToken].some((v) => v && !v.startsWith("v2.a256gcm-kw."));
    if (!plain) continue;
    try {
      const enc = encryptAccountTokens({ accessToken: a.accessToken, refreshToken: a.refreshToken, idToken: a.idToken }, { id: a.id, userId: a.userId, providerId: a.providerId });
      accounts.legacyUpgraded++;
      if (write) await db.update(schema.account).set({ accessToken: enc.accessToken as string | null, refreshToken: enc.refreshToken as string | null, idToken: enc.idToken as string | null }).where(eq(schema.account.id, a.id));
    } catch {
      accounts.failed++;
    }
  }
  out.push(accounts);

  if (write) {
    await platformAudit(db, {
      actor: { userId: null, label: "cli:rewrap" },
      assurance: "cli",
      action: "crypto.rewrap",
      result: out.some((r) => r.failed) ? "failed" : "ok",
      targetType: "table",
      data: Object.fromEntries(out.flatMap((r) => [[`${r.table.replace(/_(.)/g, (_m, c: string) => c.toUpperCase())}Done`, r.rewrapped + r.legacyUpgraded], [`${r.table.replace(/_(.)/g, (_m, c: string) => c.toUpperCase())}Failed`, r.failed]])),
    });
  }
  return out;
}

/**
 * Binds legacy OAuth connections (no recorded issuing app) of a provider family to the platform app with `clientId`
 * — ONLY when the operator attests (from deployment history) that this client id issued them. Everything not
 * backfilled stays "reconnect required" at its next refresh; nothing is guessed.
 */
export async function backfillLegacyOAuthApp(family: OAuthFamily, clientId: string, opts: { dryRun?: boolean } = {}) {
  const where = and(isNull(schema.connection.oauthAppSource), eq(schema.connection.authType, "oauth2"), inArray(schema.connection.provider, [...OAUTH_FAMILIES[family].providers]), sql`coalesce(${schema.connection.settings}->>'tokenPasted', 'false') <> 'true'`);
  const rows = await db.select({ id: schema.connection.id }).from(schema.connection).where(where);
  if (!opts.dryRun && rows.length) {
    await db.update(schema.connection).set({ oauthAppSource: "platform", oauthAppId: null, oauthClientId: clientId }).where(where);
    await platformAudit(db, { actor: { userId: null, label: "cli:backfill" }, assurance: "cli", action: "crypto.rewrap", result: "ok", targetType: "table", targetId: "connection", purpose: OAUTH_FAMILIES[family].purpose, data: { backfilledConnections: rows.length, clientId } });
  }
  return rows.length;
}
