import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { currentKeyId, decryptLegacyV1, decryptSecretV2, encryptSecret, encryptSecretV2, envelopeKeyId } from "../../src/server/crypto";
import {
  assertReplacementIdentity, auditEnvironment, auditNamedEnvironments, detectConnectionSchema, keyBytes, NAMED_FILES, parseNamedEnvironmentBytes, parsePublicOptions,
  validateProcessEnvironment, verifyDatabases, verifyOldCiphertextRows, verifySyntheticPersistence,
  type CryptoApi, type OldCipherRow, type PgClient,
} from "../../scripts/security/dv2-02-verifier";

const options = { oldDatabase: "flowline_test_dv2_old_fixture", newDatabase: "flowline_test_dv2_new_fixture" };
const api: CryptoApi = { decryptLegacyV1, decryptSecretV2, envelopeKeyId };
const payload = { type: "api_key", token: "generated-fixture-only", settings: {} };
const id = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
function env(bytes: Buffer) {
  return { FLOWLINE_ENV: "test", FLOWLINE_ENCRYPTION_KEY: bytes.toString("base64"), FLOWLINE_ENCRYPTION_KEYS_OLD: "", FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD: "", DATABASE_URL: `postgres://fixture:fixture@127.0.0.1:5432/${options.newDatabase}` };
}
function activate(bytes: Buffer) { vi.stubEnv("FLOWLINE_ENCRYPTION_KEY", bytes.toString("base64")); }
function fixture(format: "v1" | "envelope" | "waveA", oldKey: Buffer): OldCipherRow {
  const rowId = randomUUID(), workspaceId = randomUUID(), provider = "openai";
  const ctx = { table: "connection", rowId, workspaceId, provider, purpose: "credentials" };
  activate(oldKey);
  let encrypted: { ciphertext: string; keyId: string };
  if (format === "waveA") {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", oldKey, iv);
    cipher.setAAD(Buffer.from(`flowline:v2:connection:${rowId}:${workspaceId}:${provider}:credentials`));
    const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
    encrypted = { ciphertext: `v2.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`, keyId: id(oldKey) };
  } else encrypted = format === "v1" ? encryptSecret(payload) : encryptSecretV2(payload, ctx);
  expect(format === "v1" ? decryptLegacyV1(encrypted.ciphertext, encrypted.keyId) : decryptSecretV2(encrypted.ciphertext, encrypted.keyId, ctx)).toEqual(payload);
  return { id: rowId, workspaceId, provider, secretEnc: encrypted.ciphertext, keyId: encrypted.keyId, legacyCrypto: format === "v1" };
}
function dbRow(row: OldCipherRow) {
  return { id: row.id, workspace_id: row.workspaceId, provider: row.provider, secret_enc: row.secretEnc, key_id: row.keyId, legacy_crypto: row.legacyCrypto };
}
// Stateful SQL double: no environment files, no socket or database. Only synthetic query parameters.
function client(name: string, oldRows: ReturnType<typeof dbRow>[] = [], marker = true) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  let stored: Record<string, unknown> | undefined, workspace: string | undefined;
  const end = vi.fn(async () => undefined);
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql === "SELECT current_database() AS name") return { rows: [{ name }], rowCount: 1 };
    if (sql.includes("information_schema.columns")) return { rows: ["id", "workspace_id", "provider", "secret_enc", "key_id", ...(marker ? ["legacy_crypto"] : [])].map((column_name) => ({ column_name, data_type: column_name === "legacy_crypto" ? "boolean" : "text" })), rowCount: marker ? 6 : 5 };
    if (sql.startsWith("INSERT INTO workspace")) workspace = params?.[0] as string;
    if (sql.startsWith("INSERT INTO connection")) stored = { id: params?.[0], workspace_id: params?.[1], provider: params?.[2], secret_enc: params?.[7], key_id: params?.[8], legacy_crypto: false };
    if (sql.includes("WHERE id = $1 AND workspace_id = $2")) return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
    if (sql.includes("WHERE key_id = $1")) {
      if (!marker && sql.includes("legacy_crypto")) throw new Error("old schema missing legacy marker");
      return { rows: marker ? oldRows : oldRows.map(({ legacy_crypto: _marker, ...row }) => row), rowCount: oldRows.length };
    }
    if (sql.startsWith("DELETE FROM workspace")) {
      const match = params?.[0] === workspace && params?.[1] === `dv2-02-${workspace}`;
      if (match) { stored = undefined; workspace = undefined; }
      return { rows: [], rowCount: match ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { instance: { connect: vi.fn(async () => undefined), end, query } as unknown as PgClient, query, end, calls };
}
beforeEach(() => { vi.stubEnv("FLOWLINE_ENCRYPTION_KEYS_OLD", ""); vi.stubEnv("FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("DV2-02 bounded input guards", () => {
  it("accepts isolated suffixes and rejects non-test, ambiguous, duplicate and injectable names", () => {
    expect(parsePublicOptions(["--old-db", options.oldDatabase, "--new-db", options.newDatabase])).toEqual(options);
    for (const names of [["flowline", options.newDatabase], [options.oldDatabase, "flowline_test"], ["flowline_test_bad-name", options.newDatabase], ["flowline_test;drop", options.newDatabase], [options.newDatabase, options.newDatabase], [options.oldDatabase, "flowline_test_" + "x".repeat(60)]]) expect(() => parsePublicOptions(["--old-db", names[0], "--new-db", names[1]])).toThrow();
    expect(() => parsePublicOptions(["--new-db", options.newDatabase, "--old-db", options.oldDatabase])).toThrow();
    expect(() => parsePublicOptions(["--old-db", options.oldDatabase, "--new-db", options.newDatabase, "extra"])).toThrow();
  });
  it("requires test mode, canonical replacement key and empty fallback", () => {
    const good = env(randomBytes(32));
    expect(validateProcessEnvironment(options, good).hostname).toBe("127.0.0.1");
    for (const bad of [{ FLOWLINE_ENV: "staging" }, { FLOWLINE_ENCRYPTION_KEY: "" }, { FLOWLINE_ENCRYPTION_KEY: "!!!" + good.FLOWLINE_ENCRYPTION_KEY }, { FLOWLINE_ENCRYPTION_KEYS_OLD: "fixture" }, { FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD: "fixture" }]) expect(() => validateProcessEnvironment(options, { ...good, ...bad })).toThrow();
    expect(() => validateProcessEnvironment({ ...options, oldDatabase: "flowline" }, good)).toThrow();
    expect(() => keyBytes(randomBytes(31).toString("base64"))).toThrow();
  });
  it("refuses URL overrides and sanitizes invalid URL errors", () => {
    const good = env(randomBytes(32));
    for (const url of ["not-a-url-fixture", `mysql://fixture:fixture@localhost/${options.newDatabase}`, `postgres://fixture:fixture@db.internal/${options.newDatabase}`, `postgres://fixture@localhost/${options.newDatabase}`, `postgres://fixture:fixture@localhost/${options.oldDatabase}`, good.DATABASE_URL + "?host=remote", good.DATABASE_URL + "#override"]) expect(() => validateProcessEnvironment(options, { ...good, DATABASE_URL: url })).toThrow();
    expect(() => validateProcessEnvironment(options, { ...good, DATABASE_URL: "not-a-url-fixture" })).toThrow("invalid database URL");
    for (const host of ["localhost", "[::1]"]) expect(validateProcessEnvironment(options, { ...good, DATABASE_URL: `postgres://fixture:fixture@${host}/${options.newDatabase}` }).hostname).toBe(host);
  });
  it("pins the recorded replacement identity and refuses the exposed identity", () => {
    const generated = id(randomBytes(32));
    expect(() => assertReplacementIdentity(generated, generated, "000000000000")).not.toThrow();
    expect(() => assertReplacementIdentity(generated, "000000000000")).toThrow();
    expect(() => assertReplacementIdentity(generated, generated, generated)).toThrow();
    expect(() => assertReplacementIdentity("invalid", "invalid")).toThrow();
  });
});
describe("DV2-02 generated-key rejection", () => {
  it.each(["v1", "envelope", "waveA"] as const)("authenticates the %s positive control then rejects it with the replacement key", (format) => {
    const old = randomBytes(32), replacement = randomBytes(32), row = fixture(format, old);
    activate(replacement);
    expect(currentKeyId("workspace")).toBe(id(replacement));
    expect(verifyOldCiphertextRows([row], replacement, api, id(old))).toEqual({ candidateCount: 1, supportedCount: 1, rejectedCount: 1, unsupportedV1MarkerCount: 0, unsupportedFormatCount: 0, inferredLegacyV1Count: 0 });
  });
  it("fails for the old key, including with a misleading envelope identifier", () => {
    const old = randomBytes(32), row = fixture("envelope", old);
    expect(() => verifyOldCiphertextRows([row], old, api, id(old))).toThrow("replacement must differ");
    const fakeOldId = "000000000000", ctx = `flowline:v2:connection:${row.id}:workspace:${row.workspaceId}:${row.provider}:credentials`;
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", old, iv);
    cipher.setAAD(Buffer.from(`flowline:v2:kek:workspace:${fakeOldId}:${ctx}`));
    const wrapped = Buffer.concat([cipher.update(randomBytes(32)), cipher.final()]);
    const parts = row.secretEnc.split("."); parts.splice(2, 4, fakeOldId, iv.toString("base64"), cipher.getAuthTag().toString("base64"), wrapped.toString("base64"));
    expect(() => verifyOldCiphertextRows([{ ...row, keyId: fakeOldId, secretEnc: parts.join(".") }], old, api, fakeOldId)).toThrow("authenticated old ciphertext");
  });
  it("does not pass while the old key is retained in the active app ring", () => {
    const old = randomBytes(32), row = fixture("envelope", old), replacement = randomBytes(32);
    activate(replacement); vi.stubEnv("FLOWLINE_ENCRYPTION_KEYS_OLD", old.toString("base64"));
    expect(() => verifyOldCiphertextRows([row], replacement, api, id(old))).toThrow("app opened old ciphertext");
  });
  it("cannot count malformed, unmarked, unknown or empty scope as success", () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    for (const altered of [{ ...row, secretEnc: "v1.bad.bad.bad" }, { ...row, secretEnc: "unknown-format" }, { ...row, legacyCrypto: false }, { ...row, provider: "bad:context" }]) expect(() => verifyOldCiphertextRows([altered], replacement, api, id(old))).toThrow();
    expect(() => verifyOldCiphertextRows([], replacement, api, id(old))).toThrow("incomplete");
    expect(() => verifyOldCiphertextRows([row, { ...row, legacyCrypto: false }], replacement, api, id(old))).toThrow("incomplete");
  });
  it("fails closed for malformed envelopes and inconsistent key metadata", () => {
    const old = randomBytes(32), row = fixture("envelope", old), replacement = randomBytes(32); activate(replacement);
    expect(() => verifyOldCiphertextRows([{ ...row, keyId: id(replacement) }], replacement, api, id(old))).toThrow("identity mismatch");
    const parts = row.secretEnc.split("."); parts[7] = "bad";
    expect(() => verifyOldCiphertextRows([{ ...row, secretEnc: parts.join(".") }], replacement, api, id(old))).toThrow();
  });
  it("does not classify app format/configuration failure as cryptographic rejection", () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const broken: CryptoApi = { ...api, decryptLegacyV1: () => { throw new Error("parse fixture failure"); } };
    expect(() => verifyOldCiphertextRows([row], replacement, broken, id(old))).toThrow("not an authentication failure");
  });
});
describe("DV2-02 SQL-double orchestration (no DB)", () => {
  it("commits and reopens the real-schema synthetic row and cleans only generated workspace", async () => {
    const replacement = randomBytes(32); activate(replacement); const db = client(options.newDatabase);
    await verifySyntheticPersistence(db.instance, id(replacement));
    const commit = db.calls.findIndex((c) => c.sql === "COMMIT"), read = db.calls.findIndex((c) => c.sql.includes("WHERE id = $1"));
    expect(commit).toBeGreaterThan(0); expect(read).toBeGreaterThan(commit);
    expect(db.calls.some((c) => /CREATE|DROP|TRUNCATE/.test(c.sql))).toBe(false);
    expect(db.calls.at(-1)?.sql).toBe("DELETE FROM workspace WHERE id = $1 AND slug = $2");
  });
  it("uses read-only old transactions, independently compares rows, and closes both clients", async () => {
    const old = randomBytes(32), row = fixture("envelope", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)]), newDb = client(options.newDatabase);
    const factory = vi.fn((url: URL, readOnly: boolean) => { expect(url.pathname).toBe(`/${readOnly ? options.oldDatabase : options.newDatabase}`); return readOnly ? oldDb.instance : newDb.instance; });
    expect(await verifyDatabases(options, env(replacement), replacement, factory, id(old))).toMatchObject({ oldConnectionRowsUnchanged: true, syntheticConnectionSchemaPersistence: true, syntheticFixtureCleaned: true });
    expect(oldDb.calls.filter((c) => c.sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")).toHaveLength(2);
    expect(oldDb.calls.filter((c) => c.sql.includes("WHERE key_id = $1"))).toHaveLength(2);
    expect(oldDb.calls.some((c) => /INSERT|UPDATE|DELETE|CREATE|DROP/.test(c.sql))).toBe(false);
    expect(oldDb.end).toHaveBeenCalledOnce(); expect(newDb.end).toHaveBeenCalledOnce();
  });
  it("refuses key/environment mismatch before constructing clients", async () => {
    const replacement = randomBytes(32); activate(replacement); const factory = vi.fn();
    await expect(verifyDatabases(options, env(randomBytes(32)), replacement, factory)).rejects.toThrow("key mismatch");
    await expect(verifyDatabases(options, { ...env(replacement), FLOWLINE_ENV: "staging" }, replacement, factory)).rejects.toThrow("test environment");
    expect(factory).not.toHaveBeenCalled();
  });
  it("fails on returned DB identity mismatch before writes and closes clients", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client("flowline", [dbRow(row)]), newDb = client(options.newDatabase);
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : newDb.instance, id(old))).rejects.toThrow("database proof failed");
    expect(newDb.calls).toEqual([]); expect(oldDb.end).toHaveBeenCalledOnce(); expect(newDb.end).toHaveBeenCalledOnce();
  });
  it("fails when old rows change between independent snapshots", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)]), newDb = client(options.newDatabase), original = oldDb.instance.query.bind(oldDb.instance); let reads = 0;
    oldDb.instance.query = async (sql, params) => sql.includes("WHERE key_id = $1") && ++reads === 2 ? { rows: [], rowCount: 0 } : original(sql, params);
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : newDb.instance, id(old))).rejects.toThrow("database proof failed");
  });
  it("refuses a new DB identity mismatch before synthetic writes and hides driver errors", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)]), wrongNew = client("flowline");
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : wrongNew.instance, id(old))).rejects.toThrow("database proof failed");
    expect(wrongNew.calls.some((c) => /INSERT|DELETE/.test(c.sql))).toBe(false);
    const brokenOld = client(options.oldDatabase), newDb = client(options.newDatabase);
    brokenOld.instance.connect = async () => { throw new Error("private-driver-fixture-details"); };
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? brokenOld.instance : newDb.instance, id(old))).rejects.toThrow("database proof failed");
    expect(brokenOld.end).toHaveBeenCalledOnce(); expect(newDb.end).toHaveBeenCalledOnce();
  });
  it("rolls back insert failures without issuing a committed-fixture delete", async () => {
    const replacement = randomBytes(32); activate(replacement);
    const db = client(options.newDatabase), base = db.instance.query.bind(db.instance);
    db.instance.query = async (sql, params) => { if (sql.startsWith("INSERT INTO connection")) throw new Error("private-insert-fixture"); return base(sql, params); };
    await expect(verifySyntheticPersistence(db.instance, id(replacement))).rejects.toThrow("synthetic connection persistence failed");
    expect(db.calls.at(-1)?.sql).toBe("ROLLBACK");
    expect(db.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
  });
  it("cleans after readback failure and refuses failed cleanup", async () => {
    const replacement = randomBytes(32); activate(replacement); const db = client(options.newDatabase), original = db.instance.query.bind(db.instance);
    db.instance.query = async (sql, params) => { if (sql.startsWith("SELECT") && sql.includes("WHERE id = $1")) throw new Error("synthetic private fixture error"); return original(sql, params); };
    await expect(verifySyntheticPersistence(db.instance, id(replacement))).rejects.toThrow("synthetic connection persistence failed");
    expect(db.calls.at(-1)?.sql).toContain("DELETE FROM workspace");
    const fail = client(options.newDatabase), base = fail.instance.query.bind(fail.instance);
    fail.instance.query = async (sql, params) => sql.startsWith("DELETE") ? { rows: [], rowCount: 0 } : base(sql, params);
    await expect(verifySyntheticPersistence(fail.instance, id(replacement))).rejects.toThrow("fixture cleanup failed");
  });
  it("attempts exact cleanup if COMMIT acknowledgement fails", async () => {
    const replacement = randomBytes(32); activate(replacement); const db = client(options.newDatabase), base = db.instance.query.bind(db.instance);
    db.instance.query = async (sql, params) => { if (sql === "COMMIT") throw new Error("commit-acknowledgement-fixture"); return base(sql, params); };
    await expect(verifySyntheticPersistence(db.instance, id(replacement))).rejects.toThrow("synthetic connection persistence failed");
    expect(db.calls.at(-1)?.sql).toBe("DELETE FROM workspace WHERE id = $1 AND slug = $2");
  });
});
describe("DV2-02 pure audit processor", () => {
  it("recognizes generated exposed identities in both rings and fallback lists without returning identities", () => {
    const old = randomBytes(32), oldValue = old.toString("base64"), fresh = randomBytes(32).toString("base64");
    const result = auditEnvironment({ FLOWLINE_ENCRYPTION_KEY: oldValue, FLOWLINE_PLATFORM_ENCRYPTION_KEY: oldValue, FLOWLINE_ENCRYPTION_KEYS_OLD: `${fresh},${oldValue}`, FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD: oldValue }, id(old));
    expect(result).toEqual({ affectedKeyCount: 4, invalidKeyCount: 0, oldFallbackPresent: true });
    expect(JSON.stringify(result)).not.toContain(oldValue); expect(JSON.stringify(result)).not.toContain(id(old));
  });
  it("reads only the seven named files and distinguishes absent from unaffected", () => {
    const generated = randomBytes(32).toString("base64");
    const reader = vi.fn((name: typeof NAMED_FILES[number]) => name === "FlowLine/.env.test" ? { FLOWLINE_ENCRYPTION_KEY: generated } : null);
    const rows = auditNamedEnvironments(reader);
    expect(reader.mock.calls.map(([name]) => name)).toEqual([...NAMED_FILES]);
    expect(rows.find((r) => r.source === "FlowLine/.env.test")).toEqual({ source: "FlowLine/.env.test", exists: true, affectedKeyCount: 0, invalidKeyCount: 0, oldFallbackPresent: false });
    expect(rows.find((r) => r.source === "FL-wt-aihub/.env.test")).toEqual({ source: "FL-wt-aihub/.env.test", exists: false, status: "ABSENT" });
    expect(JSON.stringify(rows)).not.toContain(generated);
  });
  it("parses generated UTF8/UTF16LE and quotes without silently accepting NUL or invalid encoding", () => {
    const generated = randomBytes(32).toString("base64"), text = `FLOWLINE_ENCRYPTION_KEY="${generated}"\nFLOWLINE_ENV=test\n`;
    for (const bytes of [Buffer.from(text), Buffer.from(`\uFEFF${text}`), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])]) expect(parseNamedEnvironmentBytes(bytes).FLOWLINE_ENCRYPTION_KEY).toBe(generated);
    expect(() => parseNamedEnvironmentBytes(Buffer.from("FLOWLINE_ENV=te\0st"))).toThrow("unsupported");
    expect(() => parseNamedEnvironmentBytes(Buffer.from([0xff, 0xff]))).toThrow("unsupported");
  });
  it("returns only bounded counts/status for generated values", () => {
    const generated = randomBytes(32).toString("base64");
    const result = auditEnvironment({ FLOWLINE_ENCRYPTION_KEY: generated, FLOWLINE_PLATFORM_ENCRYPTION_KEY: generated, FLOWLINE_ENCRYPTION_KEYS_OLD: generated });
    expect(result).toEqual({ affectedKeyCount: 0, invalidKeyCount: 0, oldFallbackPresent: true });
    expect(JSON.stringify(result)).not.toContain(generated);
    expect(auditEnvironment({ FLOWLINE_ENCRYPTION_KEY: "malformed-fixture" })).toEqual({ affectedKeyCount: 0, invalidKeyCount: 1, oldFallbackPresent: false });
  });
});

describe("DV2-02 schema metadata regressions", () => {
  it("supports absent old marker only as reported v1 inference, retaining both required decrypt checks", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)], false), newDb = client(options.newDatabase);
    const result = await verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : newDb.instance, id(old));
    expect(result.oldSchema).toEqual({ legacyCryptoColumn: false, legacyProvenance: "inferred-old-schema-v1" });
    expect(result.newSchema).toEqual({ legacyCryptoColumn: true, legacyProvenance: "explicit-column" });
    expect(result.oldCiphertext).toMatchObject({ candidateCount: 1, rejectedCount: 1, inferredLegacyV1Count: 1 });
    const reads = oldDb.calls.filter((c) => c.sql.includes("WHERE key_id = $1"));
    expect(reads).toHaveLength(2);
    expect(reads.every((c) => !c.sql.includes("legacy_crypto") && c.sql.includes("FROM public.connection"))).toBe(true);
    const inferred: OldCipherRow = { ...row, legacyCrypto: null, legacyProvenance: "inferred-old-schema-v1" };
    const decrypt = vi.fn(decryptLegacyV1);
    expect(verifyOldCiphertextRows([inferred], replacement, { ...api, decryptLegacyV1: decrypt as typeof decryptLegacyV1 }, id(old)).inferredLegacyV1Count).toBe(1);
    expect(decrypt).toHaveBeenCalledOnce();
    expect(() => verifyOldCiphertextRows([inferred], replacement, { ...api, decryptLegacyV1: () => payload } as CryptoApi, id(old))).toThrow("app opened old ciphertext");
  });
  it("does not infer provenance from a missing/null row value when the column exists", () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    for (const legacyCrypto of [null, false]) expect(() => verifyOldCiphertextRows([{ ...row, legacyCrypto, legacyProvenance: "explicit-column" }], replacement, api, id(old))).toThrow("incomplete");
    expect(() => verifyOldCiphertextRows([{ ...row, legacyCrypto: null }], replacement, api, id(old))).toThrow("incomplete");
  });
  it("does not accept inferred v1 when raw AES-GCM opens it, even if app opening is mocked to reject", () => {
    const old = randomBytes(32), row = fixture("v1", old), fakeExposed = "000000000000";
    const inferred: OldCipherRow = { ...row, keyId: fakeExposed, legacyCrypto: null, legacyProvenance: "inferred-old-schema-v1" };
    const reject = vi.fn(() => { throw new Error("Unsupported state or unable to authenticate data"); });
    expect(() => verifyOldCiphertextRows([inferred], old, { ...api, decryptLegacyV1: reject }, fakeExposed)).toThrow("authenticated old ciphertext");
    expect(reject).not.toHaveBeenCalled();
  });
  it.each(["envelope", "waveA"] as const)("refuses old-schema v1 inference for %s", (format) => {
    const old = randomBytes(32), row = fixture(format, old), replacement = randomBytes(32); activate(replacement);
    expect(() => verifyOldCiphertextRows([{ ...row, legacyCrypto: null, legacyProvenance: "inferred-old-schema-v1" }], replacement, api, id(old))).toThrow("restricted to v1");
  });
  it("refuses an unmigrated new database before synthetic writes", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)], false), newDb = client(options.newDatabase, [], false);
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : newDb.instance, id(old))).rejects.toThrow("database proof failed");
    expect(newDb.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
  });
  it("fails if old schema metadata changes between preservation snapshots", async () => {
    const old = randomBytes(32), row = fixture("v1", old), replacement = randomBytes(32); activate(replacement);
    const oldDb = client(options.oldDatabase, [dbRow(row)]), alternate = client(options.oldDatabase, [], false), newDb = client(options.newDatabase), base = oldDb.instance.query.bind(oldDb.instance); let metadataReads = 0;
    oldDb.instance.query = async (sql, params) => sql.includes("information_schema.columns") && ++metadataReads === 2 ? alternate.instance.query(sql, params) : base(sql, params);
    await expect(verifyDatabases(options, env(replacement), replacement, (_url, ro) => ro ? oldDb.instance : newDb.instance, id(old))).rejects.toThrow("database proof failed");
  });
  it.each(["missing", "wrong-type"])("rejects %s schema metadata", async (mode) => {
    const db = client(options.oldDatabase), base = db.instance.query.bind(db.instance);
    db.instance.query = async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
      if (sql.includes("information_schema.columns")) {
        const result = await base<{ column_name: string; data_type: string }>(sql, params);
        const rows = mode === "missing" ? result.rows.filter((r) => r.column_name !== "secret_enc") : result.rows.map((r) => r.column_name === "legacy_crypto" ? { ...r, data_type: "text" } : r);
        return { rows: rows as unknown as T[], rowCount: 5 };
      }
      return base<T>(sql, params);
    };
    await expect(detectConnectionSchema(db.instance)).rejects.toThrow(mode === "missing" ? "required connection columns" : "marker column type");
  });
});
