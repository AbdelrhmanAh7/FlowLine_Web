#!/usr/bin/env node
/** Own socket-only PostgreSQL pair; actual candidate crypto, DB-only proof. No .env or web image. */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { LABEL, RecoveryError, backup, restore, docker, digest, inspectOwned, makePrivateRoot, requireSafe, sql } from "./lib/safe-recovery.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (key) => { const i = process.argv.indexOf(key); return i >= 0 ? process.argv[i + 1] : undefined; };
const candidateSha = arg("--candidate-sha");
const candidateDir = arg("--candidate-dir");
const runId = randomBytes(16).toString("hex");
const reportPath = join(repo, `artifacts/phase-4/takeover-20261003/beta/RECOVERY-${runId}.json`);
const database = `flowline_test_beta_${runId}`;
const checks = [];
const owned = [];
let root;
const report = { candidateSha, runId, scope: "DB-only synthetic fixture + actual candidate crypto; no app/worker/migration/ARM certification",
  status: "BLOCKED", checks, cleanup: [], at: new Date().toISOString() };
const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); requireSafe(ok, "PROOF_ASSERTION_FAILED"); };
const refuse = (name, f) => { let refused = false; try { f(); } catch (e) { refused = e instanceof RecoveryError; } check(name, refused); };
const git = (args) => {
  const r = spawnSync("git", args, { cwd: repo, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  requireSafe(r.status === 0, "CANDIDATE_GIT_READ_FAILED"); return r.stdout;
};
try {
  requireSafe(/^[a-f0-9]{40}$/.test(candidateSha ?? "") && candidateDir, "CANDIDATE_ARGUMENTS_REQUIRED");
  const candidate = realpathSync(candidateDir);
  requireSafe(!relative(repo, candidate).startsWith("..") && candidate !== repo && !existsSync(join(candidate, ".git")), "CANDIDATE_CONTEXT_INVALID");
  const cryptoPath = join(candidate, "src/server/crypto.ts");
  check("candidate crypto matches exact Git SHA", digest(readFileSync(cryptoPath)) === digest(git(["show", `${candidateSha}:src/server/crypto.ts`])));
  const journalPath = join(candidate, "drizzle/meta/_journal.json");
  check("candidate journal matches exact Git SHA", digest(readFileSync(journalPath)) === digest(git(["show", `${candidateSha}:drizzle/meta/_journal.json`])));
  // This is a gate, not a retry: fail before generating keys or creating resources if Docker is unavailable.
  docker(["info", "--format", "{{.OSType}}"]);
  root = makePrivateRoot(repo, runId);
  const crypto = await import(pathToFileURL(cryptoPath).href);
  process.env.FLOWLINE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.FLOWLINE_ENCRYPTION_KEYS_OLD;
  delete process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD;
  const backupKey = randomBytes(32).toString("base64");
  const newDb = (role) => {
    const name = `flowline-takeover-beta-${runId}-${role}`;
    // Refuse occupied names; never remove something merely because its name looks familiar.
    const names = docker(["ps", "-a", "--format", "{{.Names}}"], undefined, 1024 * 1024).toString().trim().split(/\r?\n/);
    requireSafe(!names.includes(name), "CONTAINER_NAME_OCCUPIED");
    const id = docker(["run", "-d", "--pull=never", "--name", name, "--network", "none", "--memory", "384m", "--cpus", "0.5", "--pids-limit", "128",
      "--mount", "type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=268435456",
      "--label", `${LABEL}.run=${runId}`, "--label", `${LABEL}.role=${role}`, "--label", `${LABEL}.database=${database}`,
      "--label", `${LABEL}.scope=disposable-beta`,
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--env", "POSTGRES_USER=flowline_recovery", "--env", `POSTGRES_DB=${database}`,
      "postgres:17.6-alpine", "postgres", "-c", "shared_buffers=32MB", "-c", "max_connections=10"], undefined, 1024 * 1024).toString().trim();
    requireSafe(/^[a-f0-9]{64}$/.test(id), "CREATED_CONTAINER_ID_INVALID");
    const target = { id, name, database, user: "flowline_recovery", role };
    owned.push(target);
    return target;
  };
  // Create/wait sequentially. Socket-only trust is confined to --network none; there are no DB passwords.
  const source = newDb("source");
  const wait = async (t) => {
    const until = Date.now() + 45_000;
    while (Date.now() < until) {
      try { if (sql(t, "select 1;") === "1") return; } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new RecoveryError("POSTGRES_READINESS_TIMEOUT");
  };
  await wait(source);
  const destination = newDb("restore"); await wait(destination);
  const wsCtx = { table: "recovery_fixture", rowId: "workspace-row", workspaceId: "synthetic-workspace", provider: "synthetic", purpose: "credential" };
  const platformCtx = { table: "recovery_fixture", rowId: "platform-row", workspaceId: "platform", scope: "platform", provider: "synthetic", purpose: "credential", revision: 1 };
  const wsValue = { token: randomBytes(24).toString("base64") };
  const platformValue = { token: randomBytes(24).toString("base64") };
  const fixtures = [
    { id: wsCtx.rowId, ...crypto.encryptSecretV2(wsValue, wsCtx) },
    { id: platformCtx.rowId, ...crypto.encryptSecretV2(platformValue, platformCtx) },
  ];
  // Data goes only through stdin to psql, never command arguments or artifacts.
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  sql(source, "create table recovery_fixture (id text primary key, ciphertext text not null, key_id text not null);\n" +
    fixtures.map((f) => `insert into recovery_fixture values (${quote(f.id)}, ${quote(f.ciphertext)}, ${quote(f.keyId)});`).join("\n"));
  const config = { source, destination, runId, candidateSha, root, file: `flowline-takeover-beta-${runId}.bundle`, backupKey };
  backup(config); check("encrypted logical backup created", true);
  refuse("wrong backup key refused before restore", () => restore({ ...config, backupKey: randomBytes(32).toString("base64") }));
  refuse("wrong source container refused", () => restore({ ...config, source: { ...source, id: "a".repeat(64) } }));
  refuse("wrong database refused", () => restore({ ...config, destination: { ...destination, database: "flowline" } }));
  refuse("same source/destination refused", () => restore({ ...config, destination: { ...destination, id: source.id } }));
  refuse("inherited container refused", () => restore({ ...config, destination: { ...destination, name: "flowline-db-1" } }));
  sql(destination, "create table must_preserve (id int); insert into must_preserve values (42);");
  refuse("nonempty destination refused", () => restore(config));
  check("refusal preserved destination row", sql(destination, "select id from must_preserve;") === "42");
  // This fixture is ours and positively verified before its bounded removal.
  inspectOwned(destination, runId);
  sql(destination, "drop table must_preserve;");
  restore(config); check("DB restore completed in empty destination", true);
  const recovered = JSON.parse(sql(destination, "select coalesce(json_agg(t order by id), '[]'::json) from recovery_fixture t;"));
  check("all ciphertext and key-id bytes preserved", recovered.length === 2 && fixtures.every((f) => recovered.some((r) => r.id === f.id && r.ciphertext === f.ciphertext && r.key_id === f.keyId)));
  const ws = recovered.find((r) => r.id === wsCtx.rowId), platform = recovered.find((r) => r.id === platformCtx.rowId);
  check("workspace credential decrypts with recovered key", crypto.decryptSecretV2(ws.ciphertext, ws.key_id, wsCtx).token === wsValue.token);
  check("platform credential decrypts with separate recovered key", crypto.decryptSecretV2(platform.ciphertext, platform.key_id, platformCtx).token === platformValue.token);
  const cryptoRefuse = (name, f) => { let ok = false; try { f(); } catch { ok = true; } check(name, ok); };
  cryptoRefuse("AAD workspace mismatch refused", () => crypto.decryptSecretV2(ws.ciphertext, ws.key_id, { ...wsCtx, workspaceId: "other-workspace" }));
  process.env.FLOWLINE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  cryptoRefuse("wrong workspace key refused without fallback", () => crypto.decryptSecretV2(ws.ciphertext, ws.key_id, wsCtx));
  process.env.FLOWLINE_PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  cryptoRefuse("wrong platform key refused without fallback", () => crypto.decryptSecretV2(platform.ciphertext, platform.key_id, platformCtx));
  check("source remained intact", sql(source, "select count(*) from recovery_fixture;") === "2");
  report.status = "PASS_DB_ONLY";
} catch (e) {
  report.code = e instanceof RecoveryError ? e.message : "PROOF_FAILED";
  process.exitCode = 1;
} finally {
  for (const t of owned.reverse()) {
    try { inspectOwned(t, runId); docker(["rm", "-f", t.id]); report.cleanup.push({ name: t.name, removed: true }); }
    catch { report.cleanup.push({ name: t.name, removed: false }); report.status = "BLOCKED_CLEANUP"; process.exitCode = 1; }
  }
  if (root) {
    try {
      requireSafe(realpathSync(root) === root && dirname(root) === repo && !lstatSync(root).isSymbolicLink() &&
        readFileSync(join(root, ".recovery-owned"), "utf8") === runId, "CLEANUP_CONTAINMENT_FAILED");
      const allowed = new Set([".recovery-owned", `flowline-takeover-beta-${runId}.bundle`]);
      requireSafe(readdirSync(root).every((n) => allowed.has(n) && lstatSync(join(root, n)).isFile() && !lstatSync(join(root, n)).isSymbolicLink()), "CLEANUP_CONTENTS_MISMATCH");
      rmSync(root, { recursive: true });
      report.privateFilesRemoved = true;
    } catch { report.privateFilesRemoved = false; report.status = "BLOCKED_CLEANUP"; process.exitCode = 1; }
  }
  // Only names, fixed error codes and booleans are persisted. No keys, plaintext, ciphertext or dumps.
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: report.status, code: report.code, checks: checks.length, resourcesCreated: owned.length, report: relative(repo, reportPath) })}\n`);
}
