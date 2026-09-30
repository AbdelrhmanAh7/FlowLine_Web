/**
 * Safe upgrade path (CODEX-REVIEW "Safe upgrade is not established"; CXH-05, CXH-06): a database at the Phase 4 schema
 * (migrations 0000–0011) holding v1 ciphertext and plaintext social tokens is migrated forward (0012 → latest), the
 * operator's rewrap runs, and every secret is read back through the product's readers — then a KEK rotation with the
 * old key retired. Uses its own throw-away database (<test db>_upg); the suite's DB is never touched.
 */
import { execSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/server/crypto";
import { closeDb } from "./helpers";

const baseUrl = process.env.DATABASE_URL!;
const baseName = new URL(baseUrl).pathname.slice(1);
const upgName = `${baseName}_upg`;
const upgUrl = (() => {
  const u = new URL(baseUrl);
  u.pathname = `/${upgName}`;
  return u.toString();
})();

async function admin(sqlText: string) {
  const c = new Client({ connectionString: baseUrl });
  await c.connect();
  try {
    await c.query(sqlText);
  } finally {
    await c.end();
  }
}

let migrationsDir = "";
beforeAll(async () => {
  if (!/^flowline_test(_[a-z0-9]+)?_upg$/.test(upgName)) throw new Error(`refusing to use ${upgName}`);
  await admin(`drop database if exists "${upgName}" with (force)`);
  await admin(`create database "${upgName}"`);
  // A copy of the migrations whose journal stops at 0011 (the Phase 4 release schema).
  migrationsDir = mkdtempSync(join(tmpdir(), "flowline-p4-migrations-"));
  cpSync("drizzle", migrationsDir, { recursive: true });
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.idx <= 11);
  expect(journal.entries.at(-1)!.tag).toBe("0011_rate_limit");
  writeFileSync(journalPath, JSON.stringify(journal));
});

afterAll(async () => {
  if (migrationsDir) rmSync(migrationsDir, { recursive: true, force: true });
  await admin(`drop database if exists "${upgName}" with (force)`);
  await closeDb();
});

describe("upgrade: Phase 4 DB with v1 data → migrations 0012+ → rewrap → everything readable", () => {
  it("migrates, marks legacy rows, rewraps them (incl. a large v1 step payload and plaintext social tokens), and survives a KEK rotation", async () => {
    // 1. The Phase 4 schema.
    const p4 = new Pool({ connectionString: upgUrl, max: 1 });
    await migrate(drizzle(p4), { migrationsFolder: migrationsDir });
    await p4.end();

    // 2. Phase 4-era data: v1 ciphertext (no AAD) everywhere, plaintext social tokens, and a large v1 step payload.
    const c = new Client({ connectionString: upgUrl });
    await c.connect();
    const userId = randomUUID();
    const expected = {
      token: `pat-${randomUUID()}`,
      webhook: `whsec-${randomUUID()}`,
      sso: `sso-secret-${randomUUID()}`,
      stepInputLength: 120_000,
      access: `ya29.legacy-${randomUUID()}`,
      refresh: `1//legacy-${randomUUID()}`,
    };
    const v1 = (value: unknown) => encryptSecret(value);
    let seed: Record<string, unknown>;
    try {
      await c.query(`insert into "user" (id, name, email) values ($1, 'Legacy', $2)`, [userId, `legacy-${userId}@flowline-test.local`]);
      const ws = (await c.query(`insert into workspace (name, slug) values ('Legacy', $1) returning id`, [`legacy-${userId.slice(0, 8)}`])).rows[0].id as string;
      const conn = v1({ type: "api_key", token: expected.token, settings: {} });
      const connectionId = (await c.query(`insert into connection (workspace_id, provider, label, auth_type, account_id, account_label, secret_enc, key_id) values ($1, 'airtable', 'legacy airtable', 'api_key', 'acct', 'acct', $2, $3) returning id`, [ws, conn.ciphertext, conn.keyId])).rows[0].id as string;
      const flowId = (await c.query(`insert into flow (workspace_id, name, graph) values ($1, 'Legacy flow', '{"nodes":[],"edges":[]}') returning id`, [ws])).rows[0].id as string;
      const versionId = (await c.query(`insert into flow_version (flow_id, version, revision, name, graph, reason) values ($1, 1, 1, 'Legacy flow', '{"nodes":[],"edges":[]}', 'run') returning id`, [flowId])).rows[0].id as string;
      const runId = (await c.query(`insert into run (workspace_id, flow_id, flow_version_id, number) values ($1, $2, $3, 1) returning id`, [ws, flowId, versionId])).rows[0].id as string;
      const big = v1({ input: { notes: "م".repeat(expected.stepInputLength) }, output: { ok: true } });
      expect(big.ciphertext.length).toBeGreaterThan(64 * 1024); // larger than the old shared cap
      await c.query(`insert into run_step (run_id, node_id, node_type, node_label, position, data_enc) values ($1, 'trigger', 'trigger.manual', 'Trigger', 0, $2)`, [runId, JSON.stringify(big)]);
      const hook = v1(expected.webhook);
      const webhookId = (await c.query(`insert into webhook_endpoint (flow_id, workspace_id, token, secret_enc, key_id) values ($1, $2, $3, $4, $5) returning id`, [flowId, ws, `tok-${randomUUID()}`, hook.ciphertext, hook.keyId])).rows[0].id as string;
      const sso = v1(expected.sso);
      await c.query(`insert into sso_config (workspace_id, issuer, client_id, client_secret_enc, key_id) values ($1, 'https://idp.example', 'client', $2, $3)`, [ws, sso.ciphertext, sso.keyId]);
      const accountId = randomUUID();
      await c.query(`insert into account (id, account_id, provider_id, user_id, access_token, refresh_token) values ($1, $2, 'google', $3, $4, $5)`, [accountId, `g-${userId}`, userId, expected.access, expected.refresh]);
      seed = { workspaceId: ws, connectionId, webhookId, runId, stepNodeId: "trigger", accountId, expected };
    } finally {
      await c.end();
    }

    // 3. Forward migrations (0012 → latest), exactly as the release runs them.
    execSync("npx tsx src/db/migrate.ts", { env: { ...process.env, DATABASE_URL: upgUrl }, stdio: "pipe" });

    // 4. Rewrap + read-back + rotation in a separate process bound to the upgrade DB.
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn("npx tsx tests/fixtures/upgrade-child.ts", { shell: true, env: { ...process.env, DATABASE_URL: upgUrl, FLOWLINE_UPGRADE_SEED: JSON.stringify(seed) } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("exit", () => {
        const line = stdout.split("\n").find((l) => l.startsWith("{"));
        if (!line) reject(new Error(`upgrade child printed no result: ${stderr.slice(0, 500)}`));
        else resolve(JSON.parse(line));
      });
    });

    expect(result.error).toBeUndefined();
    const all = { connection: true, webhook: true, sso: true, step: true, account: true };
    // After the migrations: the legacy marker is set by 0014, and every value is readable (v1 only via that marker).
    expect(result.afterMigrate).toMatchObject({ flags: { legacy: [true, true, true, true] }, read: all });
    // After the rewrap: no legacy rows, every value a v2 envelope (social tokens encrypted), rotation-complete report.
    expect(result.rewrap).toMatchObject({ complete: true });
    expect(result.afterRewrap).toMatchObject({ flags: { legacy: [false, false, false, false], envelopes: [true, true, true, true, true, true] }, read: all });
    // A KEK rotation completes, and with the old key retired everything still opens.
    expect(result.rotation).toMatchObject({ complete: true, remaining: 0, failed: 0 });
    expect(result.afterRetire).toMatchObject({ read: all });
  }, 180_000);
});
