import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
const out = "artifacts/beta-execution/20260930T122429Z";
const report = JSON.parse(readFileSync(`${out}/key-rotation.json`, "utf8"));
const fixtures = [];
const checks = [];
for (const target of report.environments) {
  const env = parseEnv(readFileSync(path.resolve("..", target.root, ".env.test"), "utf8"));
  const crypto = await import(pathToFileURL(path.resolve("..", target.root, "src/server/crypto.ts")).href);
  const client = new Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const row = (await client.query("select id,workspace_id,provider,secret_enc,key_id from connection where id=$1", [target.syntheticConnectionId])).rows[0];
    if (!row) throw new Error("Synthetic persisted fixture absent");
    const context = { table: "connection", rowId: row.id, workspaceId: row.workspace_id, provider: row.provider, purpose: "credentials" };
    const open = () => typeof crypto.openSecret === "function" ? crypto.openSecret({ ciphertext: row.secret_enc, keyId: row.key_id, legacy: false }, context) : crypto.decryptSecret(row.secret_enc, row.key_id);
    process.env.FLOWLINE_ENCRYPTION_KEY = env.FLOWLINE_ENCRYPTION_KEY;
    process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = env.FLOWLINE_PLATFORM_ENCRYPTION_KEY;
    process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = "";
    process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD = "";
    if (open().token !== "fake-beta-rotation-fixture") throw new Error("App persisted roundtrip failed");
    const unexpected = (await client.query("select count(*)::int as n from connection where key_id <> $1", [target.workspaceKeyId])).rows[0].n;
    if (unexpected !== 0) throw new Error("Unexpected key id in new credential fixtures");
    fixtures.push({ root: target.root, open, env });
    checks.push({ root: target.root, persistedAppDecrypt: "PASS", credentialEnvelopesUnderUnexpectedKeys: unexpected, configuredDatabaseMatches: new URL(env.DATABASE_URL).pathname === `/${target.newDatabase}`, oldKeyFallbackEmpty: !env.FLOWLINE_ENCRYPTION_KEYS_OLD && !env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD });
  } finally { await client.end(); }
}
for (const fixture of fixtures) {
  const other = fixtures.find(f => f.root !== fixture.root);
  process.env.FLOWLINE_ENCRYPTION_KEY = other.env.FLOWLINE_ENCRYPTION_KEY;
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = other.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY;
  let refused = false;
  try { fixture.open(); } catch { refused = true; }
  if (!refused) throw new Error("Cross-environment key isolation failed");
  checks.find(c => c.root === fixture.root).otherEnvironmentCannotDecrypt = "PASS";
}
writeFileSync(`${out}/rotation-persistence-isolation.json`, JSON.stringify({ at: new Date().toISOString(), checks, fixtureOnly: true }, null, 2));
console.log("Persisted app roundtrip and cross-environment key isolation PASS for both new test DBs");
