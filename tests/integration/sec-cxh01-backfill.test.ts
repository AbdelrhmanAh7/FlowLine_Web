/**
 * CXH-01 round 2 — the upgrade backfill (migration "cxh01_platform_app_identity"): existing platform-app connections
 * get the issuing platform_secret row id ONLY when that row provably issued them (the purpose was never cleared, the
 * row is live, same client id, same epoch when recorded). Everything else stays unrecorded → reconnect at the next
 * refresh. Uses its own throw-away database (<test db>_cxh01); the suite's DB is never touched.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "./helpers";

const TAG = "cxh01_platform_app_identity";
const baseUrl = process.env.DATABASE_URL!;
const baseName = new URL(baseUrl).pathname.slice(1);
const dbName = `${baseName}_cxh01`;
const dbUrl = (() => {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
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

let beforeDir = "";
beforeAll(async () => {
  if (!/^flowline_test(_[a-z0-9]+)?_cxh01$/.test(dbName)) throw new Error(`refusing to use ${dbName}`);
  await admin(`drop database if exists "${dbName}" with (force)`);
  await admin(`create database "${dbName}"`);
  // A copy of the migrations whose journal stops right before this migration.
  beforeDir = mkdtempSync(join(tmpdir(), "flowline-cxh01-migrations-"));
  cpSync("drizzle", beforeDir, { recursive: true });
  const journalPath = join(beforeDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number; tag: string }[] };
  const at = journal.entries.findIndex((e) => e.tag.endsWith(TAG));
  expect(at).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, at);
  writeFileSync(journalPath, JSON.stringify(journal));
});

afterAll(async () => {
  if (beforeDir) rmSync(beforeDir, { recursive: true, force: true });
  await admin(`drop database if exists "${dbName}" with (force)`);
  await closeDb();
});

describe("upgrade: platform-app connections are bound to the issuing app row only when provable", () => {
  it("binds never-cleared, live, same-client, same-epoch rows; leaves everything else for reconnect; drops pending platform authorizations", async () => {
    const pool = new Pool({ connectionString: dbUrl, max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: beforeDir });
      const q = (text: string, params: unknown[] = []) => pool.query(text, params);
      const userId = randomUUID();
      await q(`insert into "user" (id, name, email) values ($1, 'U', $2)`, [userId, `u-${userId}@flowline-test.local`]);
      const ws = (await q(`insert into workspace (name, slug) values ('W', $1) returning id`, [`w-${userId.slice(0, 8)}`])).rows[0].id as string;
      const google = randomUUID();
      const slack = randomUUID();
      const github = randomUUID();
      await q(`insert into platform_secret (id, purpose, public_id, secret_enc, key_id, revision, status, epoch) values ($1, 'integration.google', 'g-client', 'x', 'k', 3, 'verified', 2)`, [google]);
      await q(`insert into platform_secret (id, purpose, public_id, secret_enc, key_id, revision, status, epoch) values ($1, 'integration.slack', 's-client', 'x', 'k', 1, 'configured_unverified', 1)`, [slack]);
      await q(`insert into platform_secret (id, purpose, public_id, secret_enc, key_id, revision, status, epoch) values ($1, 'integration.github', 'h-client', null, null, 2, 'revoked', 2)`, [github]);
      // The Slack app was cleared once before (and configured again): its current row can't be proven to be the issuer.
      await q(`insert into platform_audit_event (actor_label, assurance, action, target_type, target_id, purpose, old_revision, result) values ('admin', 'session_totp_stepup', 'platform_secret.cleared', 'platform_secret', $1, 'integration.slack', 2, 'ok')`, [randomUUID()]);
      const conn = async (provider: string, clientId: string | null, epoch: number | null, source: string | null = "platform") =>
        (
          await q(
            `insert into connection (workspace_id, provider, label, auth_type, account_id, account_label, secret_enc, key_id, oauth_app_source, oauth_client_id, oauth_app_epoch) values ($1, $2, 'c', 'oauth2', 'a', 'a', 'x', 'k', $3, $4, $5) returning id`,
            [ws, provider, source, clientId, epoch],
          )
        ).rows[0].id as string;
      const bound = { gmailSameEpoch: await conn("gmail", "g-client", 2), sheetsNoEpoch: await conn("google_sheets", "g-client", null) };
      const unbound = {
        olderEpoch: await conn("google_sheets", "g-client", 1),
        otherClient: await conn("google_sheets", "other-client", 2),
        slackCleared: await conn("slack", "s-client", 1),
        githubRevoked: await conn("github", "h-client", 2),
        legacyUnknown: await conn("gmail", null, null, null),
      };
      await q(`insert into oauth_state (state, workspace_id, user_id, provider, expires_at, app_source, client_id) values ('pending-platform', $1, $2, 'gmail', now() + interval '5 minutes', 'platform', 'g-client')`, [ws, userId]);
      await q(`insert into oauth_state (state, workspace_id, user_id, provider, expires_at, app_source, app_id, client_id) values ('pending-workspace', $1, $2, 'gmail', now() + interval '5 minutes', 'workspace', $3, 'w-client')`, [ws, userId, randomUUID()]);

      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });

      const idOf = async (id: string) => (await q(`select oauth_platform_secret_id as v from connection where id = $1`, [id])).rows[0].v as string | null;
      expect(await idOf(bound.gmailSameEpoch)).toBe(google);
      expect(await idOf(bound.sheetsNoEpoch)).toBe(google);
      for (const id of Object.values(unbound)) expect(await idOf(id)).toBeNull();
      const states = (await q(`select state from oauth_state order by state`)).rows.map((r) => r.state);
      expect(states).toEqual(["pending-workspace"]);
      // The check constraint: only platform-source connections may carry a platform app row id.
      await expect(q(`update connection set oauth_platform_secret_id = $1 where id = $2`, [google, unbound.legacyUnknown])).rejects.toThrow(/connection_oauth_app_ck/);
    } finally {
      await pool.end();
    }
  }, 120_000);
});
