/** Bounded DB-only recovery. No dotenv, URLs, passwords, shell interpolation or inherited DB access. */
import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { constants, lstatSync, mkdtempSync, openSync, closeSync, fsyncSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";

export const LABEL = "io.flowline.recovery";
export const MAX_DUMP = 64 * 1024 * 1024;
const MAGIC = Buffer.from("FLOWLINE-DB-V1\n");
const idPattern = /^[a-f0-9]{64}$/;
const runPattern = /^[a-f0-9]{32}$/;
const dbPattern = /^flowline_test_beta_[a-f0-9]{32}$/;
const shaPattern = /^[a-f0-9]{40}$/;
export class RecoveryError extends Error {}
export function requireSafe(ok, code) {
  if (!ok) throw new RecoveryError(code);
}
export const digest = (data) => createHash("sha256").update(data).digest("hex");

// Every failure is a fixed code: never propagate Docker/SQL errors (which can contain data).
export function docker(args, input, maxBuffer = MAX_DUMP) {
  const endpoint = process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
  const r = spawnSync("docker", ["--host", endpoint, ...args], {
    input, maxBuffer, timeout: 120_000, windowsHide: true,
    env: { ...process.env, DOCKER_HOST: endpoint, DOCKER_CONTEXT: "", PGPASSWORD: "", DATABASE_URL: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  requireSafe(!r.error && r.status === 0, "DOCKER_OPERATION_FAILED");
  return r.stdout;
}

export function validateTarget(t, runId) {
  requireSafe(t && runPattern.test(runId) && idPattern.test(t.id), "TARGET_ID_INVALID");
  requireSafe(t.name === `flowline-takeover-beta-${runId}-${t.role}` && ["source", "restore"].includes(t.role), "TARGET_NAME_INVALID");
  requireSafe(dbPattern.test(t.database) && t.database === `flowline_test_beta_${runId}`, "TARGET_DATABASE_INVALID");
  requireSafe(t.user === "flowline_recovery", "TARGET_USER_INVALID");
}

export function inspectOwned(t, runId, runDocker = docker) {
  validateTarget(t, runId);
  // Select only nonsensitive fields. Do not inspect Config.Env or full container configuration.
  const fmt = '{{json .Id}}|{{json .Name}}|{{json .State.Running}}|{{json .Config.Labels}}|{{json .HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}';
  let parts;
  try { parts = runDocker(["inspect", "--format", fmt, t.id]).toString().trim().split("|").map(JSON.parse); }
  catch { throw new RecoveryError("CONTAINER_INSPECTION_FAILED"); }
  const [id, name, running, labels, network, ports] = parts;
  requireSafe(id === t.id && name === `/${t.name}` && running === true, "CONTAINER_IDENTITY_MISMATCH");
  requireSafe(labels?.[`${LABEL}.run`] === runId && labels?.[`${LABEL}.role`] === t.role &&
    labels?.[`${LABEL}.database`] === t.database && labels?.[`${LABEL}.scope`] === "disposable-beta", "CONTAINER_LABEL_MISMATCH");
  requireSafe(network === "none" && (!ports || Object.keys(ports).length === 0), "CONTAINER_ISOLATION_MISMATCH");
}

export function sql(t, statement, runDocker = docker) {
  return runDocker(["exec", "-i", t.id, "psql", "-X", "-w", "-U", t.user, "-d", t.database,
    "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--quiet"], Buffer.from(statement), MAX_DUMP).toString().trim();
}

export function checkDatabase(t, runDocker = docker) {
  const identity = sql(t, "select current_database() || '|' || current_user || '|' || current_setting('server_version_num');", runDocker).split("|");
  requireSafe(identity[0] === t.database && identity[1] === t.user && /^\d+$/.test(identity[2]), "DATABASE_IDENTITY_MISMATCH");
  const major = Math.floor(Number(identity[2]) / 10000);
  requireSafe(major === 17, "POSTGRES_VERSION_MISMATCH");
  const tool = runDocker(["exec", t.id, "pg_dump", "--version"]).toString().trim();
  requireSafe(/^pg_dump \(PostgreSQL\) 17\./.test(tool), "PG_DUMP_VERSION_MISMATCH");
  return major;
}

export function requireEmpty(t, runDocker = docker) {
  // Tables, sequences, views, routines, domains/enums and extra extensions all make a target nonempty.
  const result = sql(t, `select (
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
    (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema') +
    (select count(*) from pg_extension where extname <> 'plpgsql') +
    (select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in ('public','information_schema')) +
    (select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid())
  )::text;`, runDocker);
  requireSafe(result === "0", "RESTORE_TARGET_NOT_EMPTY_OR_ACTIVE");
}

function noLinks(path) {
  let current = resolve(path);
  while (current !== parse(current).root) {
    requireSafe(!lstatSync(current).isSymbolicLink(), "PATH_LINK_REFUSED");
    current = dirname(current);
  }
}

/** Creates an exclusively owned root. Windows uses a current-user-only ACL, Unix mode 0700. */
export function makePrivateRoot(parent, runId) {
  requireSafe(runPattern.test(runId), "RUN_ID_INVALID");
  noLinks(parent);
  const root = mkdtempSync(join(realpathSync(parent), ".takeover-beta-"));
  if (process.platform === "win32") {
    const identity = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8", windowsHide: true, stdio: "pipe" });
    const sid = identity.stdout?.trim();
    requireSafe(identity.status === 0 && /^S-1-5-[0-9-]+$/.test(sid ?? ""), "PRIVATE_DIRECTORY_ACL_FAILED");
    const acl = spawnSync("icacls", [root, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true, stdio: "pipe" });
    requireSafe(acl.status === 0, "PRIVATE_DIRECTORY_ACL_FAILED");
  }
  writeFileSync(join(root, ".recovery-owned"), runId, { flag: "wx", mode: 0o600 });
  return root;
}

export function bundlePath(root, file, runId, existing) {
  requireSafe(isAbsolute(root) && /^\.takeover-beta-[a-zA-Z0-9-]+$/.test(basename(root)), "PRIVATE_ROOT_INVALID");
  noLinks(root);
  noLinks(join(root, ".recovery-owned"));
  requireSafe(lstatSync(join(root, ".recovery-owned")).isFile() && lstatSync(join(root, ".recovery-owned")).nlink === 1, "PRIVATE_ROOT_OWNERSHIP_MISMATCH");
  requireSafe(readFileSync(join(root, ".recovery-owned"), "utf8") === runId, "PRIVATE_ROOT_OWNERSHIP_MISMATCH");
  requireSafe(file === `flowline-takeover-beta-${runId}.bundle`, "BUNDLE_NAME_INVALID");
  const path = join(realpathSync(root), file);
  if (existing) {
    noLinks(path);
    const st = lstatSync(path);
    requireSafe(st.isFile() && st.nlink === 1 && st.size <= MAX_DUMP + 16384, "BUNDLE_FILE_INVALID");
  }
  return path;
}

export function keyBytes(key) {
  requireSafe(typeof key === "string", "BACKUP_KEY_INVALID");
  const b = Buffer.from(key, "base64");
  requireSafe(b.length === 32 && b.toString("base64") === key, "BACKUP_KEY_INVALID");
  return b;
}

export function sealDump(dump, manifest, key) {
  requireSafe(Buffer.isBuffer(dump) && dump.length > 0 && dump.length <= MAX_DUMP && dump.subarray(0, 5).toString() === "PGDMP", "DUMP_INVALID_OR_TOO_LARGE");
  const header = Buffer.from(JSON.stringify({ ...manifest, format: 1, dumpSha256: digest(dump) }));
  requireSafe(header.length <= 8192, "MANIFEST_TOO_LARGE");
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.concat([MAGIC, length, header]));
  const ct = Buffer.concat([cipher.update(dump), cipher.final()]);
  return Buffer.concat([MAGIC, length, header, iv, cipher.getAuthTag(), ct]);
}

export function openDump(bundle, key) {
  try {
    requireSafe(bundle.length <= MAX_DUMP + 16384 && bundle.subarray(0, MAGIC.length).equals(MAGIC), "BUNDLE_FORMAT_INVALID");
    const size = bundle.readUInt32BE(MAGIC.length);
    requireSafe(size > 0 && size <= 8192, "BUNDLE_FORMAT_INVALID");
    const offset = MAGIC.length + 4 + size;
    requireSafe(bundle.length > offset + 28, "BUNDLE_FORMAT_INVALID");
    const decipher = createDecipheriv("aes-256-gcm", key, bundle.subarray(offset, offset + 12));
    decipher.setAAD(bundle.subarray(0, offset));
    decipher.setAuthTag(bundle.subarray(offset + 12, offset + 28));
    const dump = Buffer.concat([decipher.update(bundle.subarray(offset + 28)), decipher.final()]);
    const manifest = JSON.parse(bundle.subarray(MAGIC.length + 4, offset).toString());
    requireSafe(manifest.format === 1 && digest(dump) === manifest.dumpSha256 && dump.subarray(0, 5).toString() === "PGDMP", "BUNDLE_INTEGRITY_FAILED");
    return { dump, manifest };
  } catch { throw new RecoveryError("BUNDLE_AUTHENTICATION_FAILED"); }
}

export function backup(config, runDocker = docker) {
  const { source, runId, candidateSha, root, file } = config;
  requireSafe(shaPattern.test(candidateSha) && source?.role === "source", "BACKUP_SOURCE_INVALID");
  inspectOwned(source, runId, runDocker);
  const postgresMajor = checkDatabase(source, runDocker);
  const path = bundlePath(root, file, runId, false);
  const key = keyBytes(config.backupKey);
  let dump;
  try {
    dump = runDocker(["exec", source.id, "pg_dump", "-w", "-U", source.user, "-d", source.database, "-Fc", "--no-owner", "--no-acl"]);
    const manifest = { candidateSha, runId, source, postgresMajor, at: new Date().toISOString() };
    const bundle = sealDump(dump, manifest, key);
    const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { writeFileSync(fd, bundle); fsyncSync(fd); } finally { closeSync(fd); }
    return { status: "PASS", operation: "db-backup", candidateSha, encrypted: true, bytes: bundle.length };
  } finally { key.fill(0); dump?.fill(0); }
}

export function restore(config, runDocker = docker) {
  const { source, destination, runId, candidateSha, root, file } = config;
  validateTarget(source, runId);
  requireSafe(source.role === "source" && destination?.role === "restore" && shaPattern.test(candidateSha), "RESTORE_CONFIG_INVALID");
  validateTarget(destination, runId);
  requireSafe(source.id !== destination.id && source.name !== destination.name, "RESTORE_SOURCE_EQUALS_DESTINATION");
  const path = bundlePath(root, file, runId, true);
  const key = keyBytes(config.backupKey);
  let dump;
  try {
    const opened = openDump(readFileSync(path), key); dump = opened.dump;
    const m = opened.manifest;
    requireSafe(m.runId === runId && m.candidateSha === candidateSha && m.postgresMajor === 17 &&
      ["id", "name", "database", "user", "role"].every((k) => m.source?.[k] === source[k]), "BACKUP_SOURCE_MISMATCH");
    inspectOwned(destination, runId, runDocker);
    checkDatabase(destination, runDocker);
    requireEmpty(destination, runDocker);
    // One transaction, empty target only. Never --clean, DROP, CREATE DATABASE or a source write.
    runDocker(["exec", "-i", destination.id, "pg_restore", "-w", "-U", destination.user, "-d", destination.database,
      "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl"], dump);
    return { status: "PASS", operation: "db-restore", candidateSha, appCertified: false };
  } finally { key.fill(0); dump?.fill(0); }
}

export async function recoveryCli(operation) {
  try {
    requireSafe(process.argv.length === 2, "ARGUMENTS_REFUSED_USE_STDIN");
    let input = "";
    for await (const chunk of process.stdin) { input += chunk; requireSafe(input.length <= 16384, "INPUT_TOO_LARGE"); }
    const config = JSON.parse(input);
    const result = operation(config);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (e) {
    process.stderr.write(`${JSON.stringify({ status: "REFUSED", code: e instanceof RecoveryError ? e.message : "RECOVERY_FAILED" })}\n`);
    process.exitCode = 1;
  }
}
