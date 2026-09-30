// Owner-authorized DV2-02 remediation. Old databases and Git refs are never modified/deleted.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as candidateCrypto from "../../../src/server/crypto.ts";

const out = "artifacts/beta-execution/20260930T122429Z";
const audit = JSON.parse(readFileSync(`${out}/key-reuse-audit.json`, "utf8"));
if (!audit.complete || audit.nonDisposableReuse || !audit.affectedTestsShareKey) throw new Error("Reuse audit does not authorize disposable-only replacement");
const targets = [
  { root: "FlowLine", database: "flowline_test_beta20260930main" },
  { root: "FL-wt-aihub", database: "flowline_test_beta20260930hub" },
].map(t => ({ ...t, directory: path.resolve("..", t.root), file: path.resolve("..", t.root, ".env.test") }));
const source = targets.map(t => ({ ...t, text: readFileSync(t.file, "utf8"), env: parseEnv(readFileSync(t.file, "utf8")) }));
const exposed = source.flatMap(t => [t.env.FLOWLINE_ENCRYPTION_KEY, t.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY]).filter(Boolean);
const report = { at: new Date().toISOString(), history: null, environments: [], oldDatabasesPreserved: true, noActiveOldKeyFallback: true };
const check = (name, condition, checks) => { if (!condition) throw new Error(`Check failed: ${name}`); checks.push(name); };
const denied = fn => { try { fn(); return false; } catch { return true; } };
const keyId = key => createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 12);
const setKeys = (workspace, platform) => {
  process.env.FLOWLINE_ENCRYPTION_KEY = workspace;
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = platform;
  process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = "";
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD = "";
};
// Scan text blobs reachable from every current ref. Secrets remain in memory, never command arguments.
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim().split("\n");
const binary = /\.(png|jpg|jpeg|webp|gif|avif|ico|woff2?|ttf|pdf|zip|mp4|webm)$/i;
let scanned = 0;
const hits = [];
const candidates = objects.filter(entry => entry.includes(" ") && !binary.test(entry.slice(entry.indexOf(" ") + 1)));
const oidOf = entry => entry.slice(0, entry.indexOf(" "));
const types = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], { input: candidates.map(oidOf).join("\n") + "\n", encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim().split("\n");
const blobs = candidates.filter((entry, i) => types[i]?.split(" ")[1] === "blob");
for (let offset = 0; offset < blobs.length; offset += 50) {
  const group = blobs.slice(offset, offset + 50);
  const batch = execFileSync("git", ["cat-file", "--batch"], { input: group.map(oidOf).join("\n") + "\n", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  let cursor = 0;
  for (const entry of group) {
    const headerEnd = batch.indexOf(10, cursor);
    const size = Number(batch.subarray(cursor, headerEnd).toString("utf8").split(" ")[2]);
    const blob = batch.subarray(headerEnd + 1, headerEnd + 1 + size);
    scanned++;
    if (exposed.some(value => blob.includes(Buffer.from(value)))) hits.push({ oid: oidOf(entry), path: entry.slice(entry.indexOf(" ") + 1) });
    cursor = headerEnd + 1 + size + 1;
  }
}
report.history = { textBlobsScanned: scanned, hits, limits: "Binary pixels and compressed artifacts excluded; unreachable objects/transcripts not certified" };
writeFileSync(`${out}/key-rotation-history.json`, JSON.stringify(report.history, null, 2));
if (hits.length) throw new Error("Reachable history contains affected key material; no rotation/publication performed");

for (const target of source) {
  const url = new URL(target.env.DATABASE_URL);
  const checks = [];
  check("disposable env", target.env.FLOWLINE_ENV === "test" && /^\/flowline_test(?:_[a-z0-9]+)?$/.test(url.pathname), checks);
  check("local DB only", ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), checks);
  const oldDatabase = url.pathname.slice(1);
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
  await admin.connect();
  const exists = await admin.query("select datname from pg_database where datname = $1", [target.database]);
  check("new dedicated DB absent", exists.rowCount === 0, checks);
  // Static, validated identifier; no credential or runtime URL is placed in SQL text/logs.
  if (!/^flowline_test_[a-z0-9]+$/.test(target.database)) throw new Error("Invalid test DB identifier");
  await admin.query(`create database "${target.database}"`);
  await admin.end();
  const freshUrl = new URL(url); freshUrl.pathname = `/${target.database}`;
  const pool = new Pool({ connectionString: freshUrl.toString(), max: 1, connectionTimeoutMillis: 5000 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(target.directory, "drizzle") });
    const workspaceKey = randomBytes(32).toString("base64");
    const platformKey = randomBytes(32).toString("base64");
    setKeys(workspaceKey, platformKey);
    const crypto = await import(pathToFileURL(path.join(target.directory, "src/server/crypto.ts")).href);
    const workspaceId = randomUUID(); const rowId = randomUUID();
    const context = { table: "connection", rowId, workspaceId, provider: "github", purpose: "credentials" };
    const fixture = { token: "fake-beta-rotation-fixture" };
    const modern = typeof crypto.encryptSecretV2 === "function";
    const encrypted = modern ? crypto.encryptSecretV2(fixture, context) : crypto.encryptSecret(fixture);
    const decrypt = () => modern ? crypto.openSecret({ ...encrypted, legacy: false }, context) : crypto.decryptSecret(encrypted.ciphertext, encrypted.keyId);
    check("app encrypt/decrypt", decrypt().token === fixture.token, checks);
    await pool.query("insert into workspace (id,name,slug) values ($1,$2,$3)", [workspaceId, "Beta rotation synthetic workspace", `beta-rotation-${randomUUID()}`]);
    await pool.query("insert into connection (id,workspace_id,provider,label,auth_type,account_id,account_label,secret_enc,key_id) values ($1,$2,'github','Synthetic key rotation','token','synthetic','Synthetic',$3,$4)", [rowId, workspaceId, encrypted.ciphertext, encrypted.keyId]);
    const persisted = (await pool.query("select secret_enc, key_id from connection where id=$1", [rowId])).rows[0];
    check("real app credential persistence", persisted.secret_enc === encrypted.ciphertext && persisted.key_id === encrypted.keyId, checks);
    setKeys(target.env.FLOWLINE_ENCRYPTION_KEY, platformKey);
    check("old workspace key cannot decrypt new data", denied(decrypt), checks);
    setKeys(workspaceKey, platformKey);
    const platformContext = { table: "platform_secret", rowId: randomUUID(), workspaceId: "platform", scope: "platform", provider: "github", purpose: "credentials" };
    const platformEncrypted = candidateCrypto.encryptSecretV2(fixture, platformContext);
    check("separate platform ring decrypts", candidateCrypto.openSecret({ ...platformEncrypted, legacy: false }, platformContext).token === fixture.token, checks);
    setKeys(workspaceKey, target.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY || randomBytes(32).toString("base64"));
    check("old platform key cannot decrypt new data", denied(() => candidateCrypto.openSecret({ ...platformEncrypted, legacy: false }, platformContext)), checks);
    setKeys(workspaceKey, platformKey);
    if (modern) check("workspace AAD isolation", denied(() => crypto.openSecret({ ...encrypted, legacy: false }, { ...context, workspaceId: randomUUID() })), checks);
    const schema = (await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n;
    const replacements = { DATABASE_URL: freshUrl.toString(), FLOWLINE_ENCRYPTION_KEY: workspaceKey, FLOWLINE_PLATFORM_ENCRYPTION_KEY: platformKey, FLOWLINE_ENCRYPTION_KEYS_OLD: "", FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD: "" };
    let nextText = target.text;
    for (const [name, value] of Object.entries(replacements)) {
      const expression = new RegExp(`^${name}=.*$`, "m");
      const line = `${name}=${value}`;
      nextText = expression.test(nextText) ? nextText.replace(expression, () => line) : `${nextText.trimEnd()}\n${line}\n`;
    }
    writeFileSync(target.file, nextText);
    const saved = parseEnv(readFileSync(target.file, "utf8"));
    check("new test configuration persisted without fallback", saved.FLOWLINE_ENCRYPTION_KEY === workspaceKey && saved.FLOWLINE_PLATFORM_ENCRYPTION_KEY === platformKey && !saved.FLOWLINE_ENCRYPTION_KEYS_OLD && !saved.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD, checks);
    report.environments.push({ root: target.root, oldDatabase, newDatabase: target.database, schema, workspaceKeyId: keyId(workspaceKey), platformKeyId: keyId(platformKey), cryptoFormat: modern ? "v2 app" : "v1 Phase 4 app; v2 platform ring separately verified against candidate", checks, syntheticConnectionId: rowId });
    writeFileSync(`${out}/key-rotation.json`, JSON.stringify(report, null, 2));
    console.log(`${target.root}: fresh DB, independent keys and ${checks.length} checks PASS; old DB preserved`);
  } finally { await pool.end(); }
}
check("cross-environment keys independent", new Set(report.environments.flatMap(t => [t.workspaceKeyId, t.platformKeyId])).size === 4, []);
console.log("Both disposable environments remediated; no old key retained as fallback");
