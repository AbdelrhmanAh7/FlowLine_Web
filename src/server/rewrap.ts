import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { contextId, encryptSecretV2, envelopeKeyId, isCurrentEnvelope, rewrapSecret, type SecretContext } from "./crypto";
import { ACCOUNT_TOKEN_FIELDS, accountTokenContext, isEnvelope, type AccountTokenField } from "./auth-token-adapter";
import { platformAudit } from "./platform-audit";
import { OAUTH_FAMILIES, purposeDef, type OAuthFamily } from "./platform-purposes";

/**
 * Operator maintenance for crypto v2 (docs/security/CREDENTIALS_DESIGN.md MUST 4–5), run by scripts/admin/rewrap.mts:
 *
 * - LEGACY → v2: rows still marked legacy (v1, no AAD) are re-encrypted with their TRUSTED row context (read from the
 *   row itself), and their legacy flag is cleared — after this, the domain refuses v1 entirely.
 * - KEK rotation: EVERY v2 envelope not under its ring's current key has its data key re-wrapped (payload untouched);
 *   AI hub Wave A blobs are upgraded to envelopes. That covers every encrypted column: connections, webhook secrets,
 *   SSO client secrets, step data, AI keys, platform secrets (current + previous), workspace OAuth apps (current +
 *   previous), pending OAuth / SSO PKCE verifiers, and social-login tokens (access / refresh / id token, each with its
 *   own account/user/provider/field AAD — CXH-06).
 * - Social-login tokens stored in plaintext before encryption are encrypted in place.
 *
 * Concurrency: every row is written with a compare-and-swap on the exact old ciphertext(s) it read, so a concurrent
 * writer (a token refresh, a rotation, a revoke) is never overwritten or resurrected. An account row whose CAS misses
 * is re-read and retried a few times; anything still left is REPORTED, never guessed.
 *
 * Completion: after the pass, `remaining` counts — per table — every value that still needs an old key (an envelope
 * under a non-current KEK, a Wave A blob, a legacy v1 row, a plaintext social token). Rotation is complete (the old key
 * may be retired) ONLY when `rotationComplete(report)` is true: no failures and nothing remaining anywhere.
 * Rewrapping does NOT invalidate copies stolen with an old key: after a compromise, rotate the provider secrets too.
 */
export interface RewrapReport {
  table: string;
  rewrapped: number;
  legacyUpgraded: number;
  failed: number;
  /** Values in this table that still need an old key / the legacy path after this pass (0 = done for this table). */
  remaining: number;
}

/** True only when every table reports no failures and nothing remaining: the old key(s) may be retired. */
export function rotationComplete(report: RewrapReport[]) {
  return report.every((r) => r.failed === 0 && r.remaining === 0);
}

function report(table: string): RewrapReport {
  return { table, rewrapped: 0, legacyUpgraded: 0, failed: 0, remaining: 0 };
}

type Planned = { ciphertext: string; keyId: string; legacy: boolean };
type Outcome = Planned | "failed" | null;

/** What rewrapping one value would produce: null = already current, "failed" = can't be opened with the configured keys. */
function plan(ciphertext: string, keyId: string, ctx: SecretContext, legacy: boolean): Outcome {
  if (!legacy && isCurrentEnvelope(ciphertext, ctx)) return null;
  try {
    return { ...rewrapSecret(ciphertext, keyId, ctx, { legacyV1: legacy }), legacy };
  } catch {
    return "failed";
  }
}

/** Counts an outcome that was applied (or would be, in a dry run), or a failure. */
function count(r: RewrapReport, o: Outcome) {
  if (o === "failed") r.failed++;
  else if (o) {
    if (o.legacy) r.legacyUpgraded++;
    else r.rewrapped++;
  }
}

const ok = (o: Outcome): Planned | null => (o && o !== "failed" ? o : null);

function needsWork(ciphertext: string | null | undefined, ctx: SecretContext, legacy = false) {
  if (!ciphertext) return false;
  return legacy || !isCurrentEnvelope(ciphertext, ctx);
}

/** `col IS NOT DISTINCT FROM value` — a CAS predicate that also matches NULL. */
function same(col: AnyPgColumn, value: unknown): SQL {
  return sql`${col} is not distinct from ${value}`;
}

const connCtx = (c: { id: string; workspaceId: string; provider: string }): SecretContext => ({ table: "connection", rowId: c.id, workspaceId: c.workspaceId, provider: c.provider, purpose: "credentials" });
const hookCtx = (w: { id: string; workspaceId: string }): SecretContext => ({ table: "webhook_endpoint", rowId: w.id, workspaceId: w.workspaceId, provider: "flowline", purpose: "signing_secret" });
const ssoCtx = (s: { workspaceId: string }): SecretContext => ({ table: "sso_config", rowId: s.workspaceId, workspaceId: s.workspaceId, provider: "oidc", purpose: "client_secret" });
const stepCtx = (s: { runId: string; nodeId: string; workspaceId: string }): SecretContext => ({ table: "run_step", rowId: `${s.runId}.${contextId(s.nodeId)}`, workspaceId: s.workspaceId, provider: "engine", purpose: "step_data" });
// Same context as src/ai/hub/credentials.ts (aiSecretContext).
const aiCtx = (a: { id: string; workspaceId: string; provider: string }): SecretContext => ({ table: "ai_connection", rowId: a.id, workspaceId: a.workspaceId, provider: a.provider, purpose: "api_key" });
const platformCtx = (p: { id: string }, provider: string, purpose: string, revision: number): SecretContext => ({ table: "platform_secret", rowId: p.id, workspaceId: "platform", scope: "platform", provider, purpose, revision });
const appCtx = (a: { id: string; workspaceId: string; family: string }, revision: number): SecretContext => ({ table: "workspace_oauth_app", rowId: a.id, workspaceId: a.workspaceId, provider: a.family, purpose: "oauth_client_secret", revision });
// Same contexts as src/server/connections.ts (stateContext) and src/server/sso.ts (ssoVerifierContext).
const oauthStateCtx = (s: { state: string; workspaceId: string; provider: string }): SecretContext => ({ table: "oauth_state", rowId: s.state, workspaceId: s.workspaceId, provider: s.provider, purpose: "pkce_verifier" });
const ssoStateCtx = (s: { state: string; workspaceId: string }): SecretContext => ({ table: "sso_state", rowId: contextId(s.state), workspaceId: s.workspaceId, provider: "oidc", purpose: "pkce_verifier" });

function parseVerifier(json: string | null): { ciphertext: string; keyId: string } | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { ciphertext?: unknown; keyId?: unknown };
    return typeof v.ciphertext === "string" && typeof v.keyId === "string" ? { ciphertext: v.ciphertext, keyId: v.keyId } : null;
  } catch {
    return null;
  }
}

type AccountRow = Pick<typeof schema.account.$inferSelect, "id" | "userId" | "providerId" | AccountTokenField>;

/** The rewrap of one account row's token fields: plaintext → encrypted, old-KEK envelope → current KEK. */
function planAccount(a: AccountRow) {
  const next: Partial<Record<AccountTokenField, string>> = {};
  let rewrapped = 0;
  let upgraded = 0;
  let failed = 0;
  for (const f of ACCOUNT_TOKEN_FIELDS) {
    const v = a[f];
    if (!v) continue;
    const ctx = accountTokenContext(a, f);
    if (!isEnvelope(v)) {
      try {
        next[f] = encryptSecretV2(v, ctx).ciphertext;
        upgraded++;
      } catch {
        failed++;
      }
    } else if (!isCurrentEnvelope(v, ctx)) {
      try {
        next[f] = rewrapSecret(v, envelopeKeyId(v), ctx).ciphertext;
        rewrapped++;
      } catch {
        failed++;
      }
    }
  }
  return { next, rewrapped, upgraded, failed };
}

const ACCOUNT_COLS = { accessToken: schema.account.accessToken, refreshToken: schema.account.refreshToken, idToken: schema.account.idToken } as const;
const accountSelect = { id: schema.account.id, userId: schema.account.userId, providerId: schema.account.providerId, ...ACCOUNT_COLS };
const accountHasTokens = sql`${schema.account.accessToken} is not null or ${schema.account.refreshToken} is not null or ${schema.account.idToken} is not null`;

export async function rewrapAll(opts: { dryRun?: boolean } = {}): Promise<RewrapReport[]> {
  const out: RewrapReport[] = [];
  const write = !opts.dryRun;

  /** Applies one planned single-column rewrap with its CAS update (counted only when the CAS matched). */
  async function apply(r: RewrapReport, next: Outcome, update: (n: Planned) => Promise<unknown[]>) {
    const p = ok(next);
    if (p && write) {
      if ((await update(p)).length) count(r, p);
    } else count(r, next);
  }

  const conn = report("connection");
  for (const c of await db.select().from(schema.connection)) {
    await apply(conn, plan(c.secretEnc, c.keyId, connCtx(c), c.legacyCrypto), (n) =>
      db.update(schema.connection).set({ secretEnc: n.ciphertext, keyId: n.keyId, legacyCrypto: false }).where(and(eq(schema.connection.id, c.id), eq(schema.connection.secretEnc, c.secretEnc))).returning({ id: schema.connection.id }),
    );
  }
  out.push(conn);

  const hooks = report("webhook_endpoint");
  for (const w of await db.select().from(schema.webhookEndpoint)) {
    await apply(hooks, plan(w.secretEnc, w.keyId, hookCtx(w), w.legacyCrypto), (n) =>
      db.update(schema.webhookEndpoint).set({ secretEnc: n.ciphertext, keyId: n.keyId, legacyCrypto: false }).where(and(eq(schema.webhookEndpoint.id, w.id), eq(schema.webhookEndpoint.secretEnc, w.secretEnc))).returning({ id: schema.webhookEndpoint.id }),
    );
  }
  out.push(hooks);

  const sso = report("sso_config");
  for (const s of await db.select().from(schema.ssoConfig)) {
    await apply(sso, plan(s.clientSecretEnc, s.keyId, ssoCtx(s), s.legacyCrypto), (n) =>
      db.update(schema.ssoConfig).set({ clientSecretEnc: n.ciphertext, keyId: n.keyId, legacyCrypto: false }).where(and(eq(schema.ssoConfig.workspaceId, s.workspaceId), eq(schema.ssoConfig.clientSecretEnc, s.clientSecretEnc))).returning({ id: schema.ssoConfig.workspaceId }),
    );
  }
  out.push(sso);

  const steps = report("run_step");
  const stepRows = await db
    .select({ id: schema.runStep.id, runId: schema.runStep.runId, nodeId: schema.runStep.nodeId, dataEnc: schema.runStep.dataEnc, legacy: schema.runStep.dataLegacy, workspaceId: schema.run.workspaceId })
    .from(schema.runStep)
    .innerJoin(schema.run, eq(schema.run.id, schema.runStep.runId))
    .where(isNotNull(schema.runStep.dataEnc));
  for (const s of stepRows) {
    await apply(steps, plan(s.dataEnc!.ciphertext, s.dataEnc!.keyId, stepCtx(s), s.legacy), (n) =>
      db
        .update(schema.runStep)
        .set({ dataEnc: { ciphertext: n.ciphertext, keyId: n.keyId }, dataLegacy: false })
        .where(and(eq(schema.runStep.id, s.id), sql`${schema.runStep.dataEnc}->>'ciphertext' = ${s.dataEnc!.ciphertext}`))
        .returning({ id: schema.runStep.id }),
    );
  }
  out.push(steps);

  const ai = report("ai_connection");
  for (const a of await db.select().from(schema.aiConnection).where(isNotNull(schema.aiConnection.secretEnc))) {
    await apply(ai, plan(a.secretEnc!, a.keyId!, aiCtx(a), false), (n) =>
      db.update(schema.aiConnection).set({ secretEnc: n.ciphertext, keyId: n.keyId }).where(and(eq(schema.aiConnection.id, a.id), eq(schema.aiConnection.secretEnc, a.secretEnc!))).returning({ id: schema.aiConnection.id }),
    );
  }
  out.push(ai);

  const platform = report("platform_secret");
  for (const p of await db.select().from(schema.platformSecret)) {
    const def = purposeDef(p.purpose);
    if (!def) continue;
    const cur = p.secretEnc && p.keyId ? plan(p.secretEnc, p.keyId, platformCtx(p, def.provider, def.purpose, p.revision), false) : null;
    const prev = p.prevSecretEnc && p.prevKeyId && p.prevRevision ? plan(p.prevSecretEnc, p.prevKeyId, platformCtx(p, def.provider, def.purpose, p.prevRevision), false) : null;
    const [c, v] = [ok(cur), ok(prev)];
    let applied = !write;
    if ((c || v) && write) {
      // CAS on the exact values read: a concurrent rotate/revoke (a revoke keeps the revision) is never undone.
      const done = await db
        .update(schema.platformSecret)
        .set({ ...(c ? { secretEnc: c.ciphertext, keyId: c.keyId } : {}), ...(v ? { prevSecretEnc: v.ciphertext, prevKeyId: v.keyId } : {}) })
        .where(and(eq(schema.platformSecret.id, p.id), eq(schema.platformSecret.revision, p.revision), same(schema.platformSecret.secretEnc, p.secretEnc), same(schema.platformSecret.prevSecretEnc, p.prevSecretEnc)))
        .returning({ id: schema.platformSecret.id });
      applied = done.length > 0;
    }
    if (applied) {
      count(platform, c);
      count(platform, v);
    }
    if (cur === "failed") platform.failed++;
    if (prev === "failed") platform.failed++;
  }
  out.push(platform);

  const apps = report("workspace_oauth_app");
  for (const a of await db.select().from(schema.workspaceOauthApp).where(isNull(schema.workspaceOauthApp.deletedAt))) {
    const cur = a.secretEnc && a.keyId ? plan(a.secretEnc, a.keyId, appCtx(a, a.revision), false) : null;
    const prev = a.prevSecretEnc && a.prevKeyId && a.prevRevision ? plan(a.prevSecretEnc, a.prevKeyId, appCtx(a, a.prevRevision), false) : null;
    const [c, v] = [ok(cur), ok(prev)];
    let applied = !write;
    if ((c || v) && write) {
      const done = await db
        .update(schema.workspaceOauthApp)
        .set({ ...(c ? { secretEnc: c.ciphertext, keyId: c.keyId } : {}), ...(v ? { prevSecretEnc: v.ciphertext, prevKeyId: v.keyId } : {}) })
        .where(and(eq(schema.workspaceOauthApp.id, a.id), eq(schema.workspaceOauthApp.revision, a.revision), isNull(schema.workspaceOauthApp.deletedAt), same(schema.workspaceOauthApp.secretEnc, a.secretEnc), same(schema.workspaceOauthApp.prevSecretEnc, a.prevSecretEnc)))
        .returning({ id: schema.workspaceOauthApp.id });
      applied = done.length > 0;
    }
    if (applied) {
      count(apps, c);
      count(apps, v);
    }
    if (cur === "failed") apps.failed++;
    if (prev === "failed") apps.failed++;
  }
  out.push(apps);

  const states = report("oauth_state");
  for (const s of await db.select().from(schema.oauthState).where(isNotNull(schema.oauthState.codeVerifierEnc))) {
    const v = parseVerifier(s.codeVerifierEnc);
    if (!v) {
      states.failed++;
      continue;
    }
    await apply(states, plan(v.ciphertext, v.keyId, oauthStateCtx(s), false), (n) =>
      db
        .update(schema.oauthState)
        .set({ codeVerifierEnc: JSON.stringify({ ciphertext: n.ciphertext, keyId: n.keyId }) })
        .where(and(eq(schema.oauthState.state, s.state), eq(schema.oauthState.codeVerifierEnc, s.codeVerifierEnc!)))
        .returning({ id: schema.oauthState.state }),
    );
  }
  out.push(states);

  const ssoStates = report("sso_state");
  for (const s of await db.select().from(schema.ssoState)) {
    await apply(ssoStates, plan(s.codeVerifierEnc, s.keyId, ssoStateCtx(s), false), (n) =>
      db.update(schema.ssoState).set({ codeVerifierEnc: n.ciphertext, keyId: n.keyId }).where(and(eq(schema.ssoState.state, s.state), eq(schema.ssoState.codeVerifierEnc, s.codeVerifierEnc))).returning({ id: schema.ssoState.state }),
    );
  }
  out.push(ssoStates);

  // Social-login tokens (CXH-06): plaintext AND v2 envelopes under an old KEK, each field with its own AAD.
  const accounts = report("account");
  for (const first of await db.select(accountSelect).from(schema.account).where(accountHasTokens)) {
    let a: AccountRow | undefined = first;
    for (let attempt = 0; a && attempt < 5; attempt++) {
      const p = planAccount(a);
      let applied = !write || !Object.keys(p.next).length;
      if (!applied) {
        // Compare-and-swap on ALL token fields as read: a concurrent token refresh wins, and we retry on the fresh row.
        const done = await db
          .update(schema.account)
          .set(p.next)
          .where(and(eq(schema.account.id, a.id), same(ACCOUNT_COLS.accessToken, a.accessToken), same(ACCOUNT_COLS.refreshToken, a.refreshToken), same(ACCOUNT_COLS.idToken, a.idToken)))
          .returning({ id: schema.account.id });
        applied = done.length > 0;
      }
      if (applied) {
        accounts.rewrapped += p.rewrapped;
        accounts.legacyUpgraded += p.upgraded;
        accounts.failed += p.failed;
        break;
      }
      [a] = await db.select(accountSelect).from(schema.account).where(eq(schema.account.id, a.id));
    }
  }
  out.push(accounts);

  const remaining = await remainingByTable();
  for (const r of out) r.remaining = remaining[r.table] ?? 0;

  if (write) {
    const key = (t: string) => t.replace(/_(.)/g, (_m, c: string) => c.toUpperCase());
    await platformAudit(db, {
      actor: { userId: null, label: "cli:rewrap" },
      assurance: "cli",
      action: "crypto.rewrap",
      result: rotationComplete(out) ? "ok" : "failed",
      targetType: "table",
      data: Object.fromEntries(out.flatMap((r) => [[`${key(r.table)}Done`, r.rewrapped + r.legacyUpgraded], [`${key(r.table)}Failed`, r.failed], [`${key(r.table)}Remaining`, r.remaining]])),
    });
  }
  return out;
}

/**
 * Per table: how many encrypted values still need an old key or the legacy path — an envelope under a non-current
 * KEK, a Wave A blob, a v1 / legacy-marked row, or a plaintext social token. Metadata only (no decryption).
 */
export async function remainingByTable(): Promise<Record<string, number>> {
  const n: Record<string, number> = {};
  const add = (table: string, hit: boolean) => {
    n[table] = (n[table] ?? 0) + (hit ? 1 : 0);
  };
  for (const c of await db.select({ id: schema.connection.id, workspaceId: schema.connection.workspaceId, provider: schema.connection.provider, secretEnc: schema.connection.secretEnc, legacy: schema.connection.legacyCrypto }).from(schema.connection)) {
    add("connection", needsWork(c.secretEnc, connCtx(c), c.legacy));
  }
  for (const w of await db.select({ id: schema.webhookEndpoint.id, workspaceId: schema.webhookEndpoint.workspaceId, secretEnc: schema.webhookEndpoint.secretEnc, legacy: schema.webhookEndpoint.legacyCrypto }).from(schema.webhookEndpoint)) {
    add("webhook_endpoint", needsWork(w.secretEnc, hookCtx(w), w.legacy));
  }
  for (const s of await db.select({ workspaceId: schema.ssoConfig.workspaceId, enc: schema.ssoConfig.clientSecretEnc, legacy: schema.ssoConfig.legacyCrypto }).from(schema.ssoConfig)) {
    add("sso_config", needsWork(s.enc, ssoCtx(s), s.legacy));
  }
  const stepRows = await db
    .select({ runId: schema.runStep.runId, nodeId: schema.runStep.nodeId, dataEnc: schema.runStep.dataEnc, legacy: schema.runStep.dataLegacy, workspaceId: schema.run.workspaceId })
    .from(schema.runStep)
    .innerJoin(schema.run, eq(schema.run.id, schema.runStep.runId))
    .where(isNotNull(schema.runStep.dataEnc));
  for (const s of stepRows) add("run_step", needsWork(s.dataEnc!.ciphertext, stepCtx(s), s.legacy));
  for (const a of await db.select({ id: schema.aiConnection.id, workspaceId: schema.aiConnection.workspaceId, provider: schema.aiConnection.provider, secretEnc: schema.aiConnection.secretEnc }).from(schema.aiConnection).where(isNotNull(schema.aiConnection.secretEnc))) {
    add("ai_connection", needsWork(a.secretEnc, aiCtx(a)));
  }
  for (const p of await db.select().from(schema.platformSecret)) {
    const def = purposeDef(p.purpose);
    if (!def) continue;
    add("platform_secret", needsWork(p.secretEnc, platformCtx(p, def.provider, def.purpose, Math.max(1, p.revision))));
    add("platform_secret", needsWork(p.prevSecretEnc, platformCtx(p, def.provider, def.purpose, Math.max(1, p.prevRevision ?? 1))));
  }
  for (const a of await db.select().from(schema.workspaceOauthApp).where(isNull(schema.workspaceOauthApp.deletedAt))) {
    add("workspace_oauth_app", needsWork(a.secretEnc, appCtx(a, a.revision)));
    add("workspace_oauth_app", needsWork(a.prevSecretEnc, appCtx(a, Math.max(1, a.prevRevision ?? 1))));
  }
  for (const s of await db.select().from(schema.oauthState).where(isNotNull(schema.oauthState.codeVerifierEnc))) {
    const v = parseVerifier(s.codeVerifierEnc);
    add("oauth_state", !v || needsWork(v.ciphertext, oauthStateCtx(s)));
  }
  for (const s of await db.select().from(schema.ssoState)) add("sso_state", needsWork(s.codeVerifierEnc, ssoStateCtx(s)));
  for (const a of await db.select(accountSelect).from(schema.account).where(accountHasTokens)) {
    for (const f of ACCOUNT_TOKEN_FIELDS) {
      const v = a[f];
      if (v) add("account", !isEnvelope(v) || !isCurrentEnvelope(v, accountTokenContext(a, f)));
    }
  }
  return n;
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
