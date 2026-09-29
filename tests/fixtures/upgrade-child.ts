/**
 * Runs the operator's crypto maintenance against a DB that was just UPGRADED from the Phase 4 schema (used by
 * tests/integration/sec-upgrade.test.ts), then reads every seeded secret back through the product's own readers.
 * Separate process: `@/db` binds DATABASE_URL at import, and this must be the upgrade DB, never the suite's DB.
 * Prints ONE JSON line (metadata and comparisons only, never secret values). FLOWLINE_UPGRADE_SEED: the seed ids as JSON.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { decryptAccountTokens } from "@/server/auth-token-adapter";
import { getRuntimeCredentials } from "@/server/connections";
import { contextId, openSecret } from "@/server/crypto";
import { webhookSecretOf } from "@/server/publish";
import { rewrapAll, rotationComplete } from "@/server/rewrap";

interface Seed {
  workspaceId: string;
  connectionId: string;
  webhookId: string;
  runId: string;
  stepNodeId: string;
  accountId: string;
  expected: { token: string; webhook: string; sso: string; stepInputLength: number; access: string; refresh: string };
}
const seed = JSON.parse(process.env.FLOWLINE_UPGRADE_SEED!) as Seed;

async function readAll() {
  const got = { connection: false, webhook: false, sso: false, step: false, account: false };
  const c = await getRuntimeCredentials(db, { connectionId: seed.connectionId, workspaceId: seed.workspaceId, providerId: "airtable", requiredScopes: [] });
  got.connection = c.creds.token === seed.expected.token;
  const [w] = await db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.id, seed.webhookId));
  got.webhook = webhookSecretOf(w!) === seed.expected.webhook;
  const [s] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, seed.workspaceId));
  got.sso = openSecret<string>({ ciphertext: s!.clientSecretEnc, keyId: s!.keyId, legacy: s!.legacyCrypto }, { table: "sso_config", rowId: seed.workspaceId, workspaceId: seed.workspaceId, provider: "oidc", purpose: "client_secret" }) === seed.expected.sso;
  const [st] = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, seed.runId));
  const data = openSecret<{ input: { notes: string } }>({ ciphertext: st!.dataEnc!.ciphertext, keyId: st!.dataEnc!.keyId, legacy: st!.dataLegacy }, { table: "run_step", rowId: `${seed.runId}.${contextId(seed.stepNodeId)}`, workspaceId: seed.workspaceId, provider: "engine", purpose: "step_data" });
  got.step = data.input.notes.length === seed.expected.stepInputLength;
  const [a] = await db.select().from(schema.account).where(eq(schema.account.id, seed.accountId));
  const dec = decryptAccountTokens(a!);
  got.account = dec.accessToken === seed.expected.access && dec.refreshToken === seed.expected.refresh;
  return got;
}

async function flags() {
  const [c] = await db.select().from(schema.connection).where(eq(schema.connection.id, seed.connectionId));
  const [w] = await db.select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.id, seed.webhookId));
  const [s] = await db.select().from(schema.ssoConfig).where(eq(schema.ssoConfig.workspaceId, seed.workspaceId));
  const [st] = await db.select().from(schema.runStep).where(eq(schema.runStep.runId, seed.runId));
  const [a] = await db.select().from(schema.account).where(eq(schema.account.id, seed.accountId));
  return {
    legacy: [c!.legacyCrypto, w!.legacyCrypto, s!.legacyCrypto, st!.dataLegacy],
    envelopes: [c!.secretEnc, w!.secretEnc, s!.clientSecretEnc, st!.dataEnc!.ciphertext, a!.accessToken, a!.refreshToken].map((v) => String(v).startsWith("v2.a256gcm-kw.")),
  };
}

async function main() {
  const out: Record<string, unknown> = {};
  try {
    // 1. Right after the migrations: legacy rows are marked and readable through the legacy path only.
    out.afterMigrate = { flags: await flags(), read: await readAll() };
    // 2. The operator's rewrap: v1 → bound v2, plaintext social tokens → encrypted.
    const first = await rewrapAll();
    out.rewrap = { complete: rotationComplete(first), tables: first.map((r) => ({ table: r.table, legacyUpgraded: r.legacyUpgraded, rewrapped: r.rewrapped, failed: r.failed, remaining: r.remaining })) };
    out.afterRewrap = { flags: await flags(), read: await readAll() };
    // 3. A KEK rotation on the upgraded DB, then the old key retired: everything still opens with the new key alone.
    const k1 = process.env.FLOWLINE_ENCRYPTION_KEY!;
    process.env.FLOWLINE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = k1;
    const rotated = await rewrapAll();
    out.rotation = { complete: rotationComplete(rotated), remaining: rotated.reduce((n, r) => n + r.remaining, 0), failed: rotated.reduce((n, r) => n + r.failed, 0) };
    process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = "";
    out.afterRetire = { read: await readAll() };
  } catch (e) {
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    console.log(JSON.stringify(out));
    await pool.end();
  }
}

void main();
