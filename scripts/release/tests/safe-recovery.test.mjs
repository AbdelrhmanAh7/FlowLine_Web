import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LABEL, RecoveryError, backup, restore, bundlePath, inspectOwned, makePrivateRoot, openDump, sealDump, validateTarget } from "../lib/safe-recovery.mjs";

const runId = randomBytes(16).toString("hex");
const root = makePrivateRoot(tmpdir(), runId);
const sha = "7".repeat(40);
const key = randomBytes(32);
const target = (role, id) => ({ role, id: id.repeat(64), name: `flowline-takeover-beta-${runId}-${role}`, database: `flowline_test_beta_${runId}`, user: "flowline_recovery" });
const source = target("source", "a"), destination = target("restore", "b");
const dump = Buffer.from("PGDMP synthetic test bytes; not a PostgreSQL recovery proof");
const file = `flowline-takeover-beta-${runId}.bundle`;
const config = { source, destination, runId, candidateSha: sha, root, file, backupKey: key.toString("base64") };
let writes = 0, empty = true, wrongDatabase = false, wrongLabel = false, wrongNetwork = false, hasPorts = false, wrongVersion = false;
function fakeDocker(args, input) {
  if (args[0] === "inspect") {
    const t = args.at(-1) === source.id ? source : destination;
    const labels = { [`${LABEL}.run`]: wrongLabel ? "wrong" : runId, [`${LABEL}.role`]: t.role, [`${LABEL}.database`]: t.database, [`${LABEL}.scope`]: "disposable-beta" };
    return Buffer.from([t.id, `/${t.name}`, true, labels, wrongNetwork ? "bridge" : "none", hasPorts ? { "5432/tcp": [{ HostPort: "5435" }] } : {}].map(JSON.stringify).join("|"));
  }
  if (args.includes("psql")) {
    if (input.toString().startsWith("select current_database()")) return Buffer.from(`${wrongDatabase ? "flowline" : source.database}|flowline_recovery|${wrongVersion ? "160000" : "170006"}`);
    return Buffer.from(empty ? "0" : "1");
  }
  if (args.includes("--version")) return Buffer.from("pg_dump (PostgreSQL) 17.6");
  if (args.includes("pg_dump")) return Buffer.from(dump);
  if (args.includes("pg_restore")) {
    writes++;
    assert.deepEqual(input, dump);
    assert.ok(args.includes("--single-transaction") && args.includes("--exit-on-error"));
    assert.ok(!args.includes("--clean") && !args.includes("--create"));
    return Buffer.alloc(0);
  }
  throw new Error("Unexpected operation");
}
const refusal = (f, code) => {
  const before = writes;
  assert.throws(f, (e) => e instanceof RecoveryError && (!code || e.message === code));
  assert.equal(writes, before, "refusals must not invoke pg_restore");
};
after(() => {
  key.fill(0);
  assert.equal(readFileSync(join(root, ".recovery-owned"), "utf8"), runId);
  const names = readdirSync(root).sort();
  assert.ok(JSON.stringify(names) === JSON.stringify([".recovery-owned"]) ||
    JSON.stringify(names) === JSON.stringify([".recovery-owned", file].sort()));
  for (const name of readdirSync(root)) {
    const st = lstatSync(join(root, name));
    assert.ok(st.isFile() && !st.isSymbolicLink() && st.nlink === 1);
  }
  rmSync(root, { recursive: true });
});

test("AES-GCM round trip authenticates manifest and exact dump bytes", () => {
  const manifest = { source, runId, candidateSha: sha, postgresMajor: 17 };
  const bundle = sealDump(dump, manifest, key);
  assert.ok(!bundle.includes(dump));
  const opened = openDump(bundle, key);
  assert.deepEqual(opened.dump, dump);
  assert.equal(opened.manifest.candidateSha, sha);
});
test("wrong encryption key is refused", () => refusal(() => openDump(sealDump(dump, {}, key), randomBytes(32))));
test("tampered encrypted dump is refused", () => {
  const bundle = sealDump(dump, {}, key); bundle[bundle.length - 1] ^= 1;
  refusal(() => openDump(bundle, key));
});
test("tampered manifest is refused", () => {
  const bundle = sealDump(dump, { candidateSha: sha }, key);
  bundle[bundle.indexOf(Buffer.from(sha))] = 56;
  refusal(() => openDump(bundle, key));
});
test("truncated or random bundles are refused", () => {
  refusal(() => openDump(Buffer.from("no"), key));
  refusal(() => openDump(sealDump(dump, {}, key).subarray(0, 30), key));
});
test("inherited container names and incorrect DB names refused before Docker", () => {
  refusal(() => validateTarget({ ...source, name: "mizano-postgres" }, runId));
  refusal(() => validateTarget({ ...source, name: "flowline-db-1" }, runId));
  refusal(() => validateTarget({ ...source, database: "flowline" }, runId));
  refusal(() => validateTarget({ ...source, database: "flowline_test_security" }, runId));
});
test("container ID, role, user and run must be explicit", () => {
  refusal(() => validateTarget({ ...source, id: "short" }, runId));
  refusal(() => validateTarget({ ...source, role: "live" }, runId));
  refusal(() => validateTarget({ ...source, user: "postgres" }, runId));
  refusal(() => validateTarget(source, "wrong"));
});
test("container ownership labels and network/ports are checked", () => {
  wrongLabel = true; refusal(() => inspectOwned(source, runId, fakeDocker)); wrongLabel = false;
  wrongNetwork = true; refusal(() => inspectOwned(source, runId, fakeDocker)); wrongNetwork = false;
  hasPorts = true; refusal(() => inspectOwned(source, runId, fakeDocker)); hasPorts = false;
});
test("unsafe backup paths and root ownership are refused", () => {
  refusal(() => bundlePath(root, "../outside.bundle", runId, false));
  refusal(() => bundlePath(root, ".env.staging", runId, false));
  refusal(() => bundlePath(root, file, "c".repeat(32), false));
});
test("logical backup writes encrypted bundle without overwriting", () => {
  assert.equal(backup(config, fakeDocker).encrypted, true);
  const bytes = readFileSync(join(root, file));
  assert.ok(!bytes.includes(dump));
  assert.ok(!bytes.includes(Buffer.from(config.backupKey)));
  assert.throws(() => backup(config, fakeDocker));
  assert.deepEqual(readFileSync(join(root, file)), bytes);
});
test("restore refuses mismatched SHA/source/key before any target write", () => {
  refusal(() => restore({ ...config, candidateSha: "8".repeat(40) }, fakeDocker), "BACKUP_SOURCE_MISMATCH");
  refusal(() => restore({ ...config, source: { ...source, id: "c".repeat(64) } }, fakeDocker), "BACKUP_SOURCE_MISMATCH");
  refusal(() => restore({ ...config, backupKey: randomBytes(32).toString("base64") }, fakeDocker), "BUNDLE_AUTHENTICATION_FAILED");
});
test("restore refuses same source and destination", () => {
  refusal(() => restore({ ...config, destination: { ...destination, id: source.id } }, fakeDocker), "RESTORE_SOURCE_EQUALS_DESTINATION");
});
test("restore refuses actual DB/user version mismatch", () => {
  wrongDatabase = true; refusal(() => restore(config, fakeDocker), "DATABASE_IDENTITY_MISMATCH"); wrongDatabase = false;
  wrongVersion = true; refusal(() => restore(config, fakeDocker), "POSTGRES_VERSION_MISMATCH"); wrongVersion = false;
});
test("restore refuses nonempty or active target", () => {
  empty = false; refusal(() => restore(config, fakeDocker), "RESTORE_TARGET_NOT_EMPTY_OR_ACTIVE"); empty = true;
});
test("restore invokes only transactional non-destructive pg_restore", () => {
  const before = writes;
  assert.deepEqual(restore(config, fakeDocker), { status: "PASS", operation: "db-restore", candidateSha: sha, appCertified: false });
  assert.equal(writes, before + 1);
});
test("corrupted on-disk bundle refuses before writes", () => {
  const original = readFileSync(join(root, file));
  const altered = Buffer.from(original); altered[altered.length - 1] ^= 1;
  writeFileSync(join(root, file), altered);
  refusal(() => restore(config, fakeDocker), "BUNDLE_AUTHENTICATION_FAILED");
  writeFileSync(join(root, file), original);
});
