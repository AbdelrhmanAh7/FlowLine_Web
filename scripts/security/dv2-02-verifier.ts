// REVIEW BEFORE EXECUTION: CLI modes read only the explicitly named local files below.
// Importing this module does not load env files, read keys, connect to DBs or spawn processes.
import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  CryptoConfigError, currentKeyId, decryptLegacyV1, decryptSecretV2,
  encryptSecretV2, envelopeKeyId, openSecret, type SecretContext,
} from "../../src/server/crypto";

const WORKTREE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PARENT = dirname(WORKTREE);
const PRIMARY = resolve(PARENT, "FlowLine");
const localRequire = createRequire(resolve(WORKTREE, "package.json"));
export const CANDIDATE_SHA = "9fdcb7d4278d945cf6f40dd86c961b981f1f7f0d";
export const EXPOSED_WORKSPACE_KEY_ID = "cf55e2d177c9";
const DB_NAME = /^flowline_test(?:_[a-z0-9]+(?:_[a-z0-9]+)*)?$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const NAMED_FILES = [
  "FlowLine/.env", "FlowLine/.env.test", "FlowLine/.env.staging",
  "FL-wt-aihub/.env", "FL-wt-aihub/.env.test", "FL-wt-design/.env", "FL-wt-design/.env.test",
] as const;
export type ProcessEnv = Record<string, string | undefined>;
export type PublicOptions = { oldDatabase: string; newDatabase: string };
export type PgClient = {
  connect(): Promise<void>; end(): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};
export type OldCipherRow = {
  id: string; workspaceId: string; provider: string; secretEnc: string; keyId: string; legacyCrypto: boolean | null;
  legacyProvenance?: "explicit-column" | "inferred-old-schema-v1";
};
export type OldCipherResult = {
  candidateCount: number; supportedCount: number; rejectedCount: number;
  unsupportedV1MarkerCount: number; unsupportedFormatCount: number;
  inferredLegacyV1Count: number;
};
export type CryptoApi = {
  decryptLegacyV1: typeof decryptLegacyV1; decryptSecretV2: typeof decryptSecretV2;
  envelopeKeyId: typeof envelopeKeyId;
};
const appCrypto: CryptoApi = { decryptLegacyV1, decryptSecretV2, envelopeKeyId };

export function parsePublicOptions(argv: string[]): PublicOptions {
  if (argv.length !== 4 || argv[0] !== "--old-db" || argv[2] !== "--new-db") throw new Error("invalid public arguments");
  const [oldDatabase, newDatabase] = [argv[1], argv[3]];
  if (oldDatabase.length > 63 || newDatabase.length > 63 || !DB_NAME.test(oldDatabase) || !DB_NAME.test(newDatabase) || !newDatabase.startsWith("flowline_test_")) throw new Error("invalid database name");
  if (oldDatabase === newDatabase) throw new Error("database names must differ");
  return { oldDatabase, newDatabase };
}

export function keyBytes(value: string | undefined): Buffer {
  const trimmed = value?.trim() ?? "";
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== trimmed) throw new Error("invalid encryption key encoding");
  return bytes;
}
function keyId(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex").slice(0, 12); }

export function validateProcessEnvironment(options: PublicOptions, env: ProcessEnv): URL {
  // Validate even typed callers before allowing a database connection.
  parsePublicOptions(["--old-db", options.oldDatabase, "--new-db", options.newDatabase]);
  if (env.FLOWLINE_ENV !== "test") throw new Error("test environment required");
  if (env.FLOWLINE_ENCRYPTION_KEYS_OLD?.trim() || env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD?.trim()) throw new Error("old-key fallback must be empty");
  const bytes = keyBytes(env.FLOWLINE_ENCRYPTION_KEY);
  bytes.fill(0);
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("invalid database URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK.has(url.hostname.toLowerCase()) || url.search || url.hash) throw new Error("database URL must be direct loopback PostgreSQL without overrides");
  if (url.pathname !== `/${options.newDatabase}` || !url.username || !url.password) throw new Error("new database URL mismatch or credentials missing");
  return url;
}

export function assertReplacementIdentity(currentId: string, expectedId: string, exposedId = EXPOSED_WORKSPACE_KEY_ID): void {
  if (!/^[0-9a-f]{12}$/.test(expectedId) || currentId !== expectedId || currentId === exposedId) throw new Error("replacement key identity mismatch");
}
function context(row: OldCipherRow): SecretContext {
  return { table: "connection", rowId: row.id, workspaceId: row.workspaceId, provider: row.provider, purpose: "credentials" };
}
function segment(s: string, length?: number) {
  const bytes = Buffer.from(s, "base64");
  if (!s || bytes.toString("base64") !== s || (length !== undefined && bytes.length !== length)) throw new Error("unsupported ciphertext encoding");
  return bytes;
}
// Only an AES-GCM authentication failure qualifies; parse/config/context errors cannot pass as proof.
function authenticationRejected(action: () => unknown): boolean {
  try { action(); return false; } catch (error) {
    if (error instanceof Error && error.message === "Unsupported state or unable to authenticate data") return true;
    throw new Error("ciphertext rejection was not an authentication failure");
  }
}
function rawAuthenticationRejected(parts: string[], replacement: Buffer, ctx: SecretContext) {
  const envelope = parts.length === 9;
  const offset = envelope ? 3 : 1;
  const iv = segment(parts[offset], 12);
  const tag = segment(parts[offset + 1], 16);
  const ciphertext = segment(parts[offset + 2], envelope ? 32 : undefined);
  let aad: string | undefined;
  if (envelope) {
    // Keep the ORIGINAL id and AAD. Relabeling an id would invalidate AAD even with unchanged key bytes.
    aad = `flowline:v2:kek:workspace:${parts[2]}:flowline:v2:connection:${ctx.rowId}:workspace:${ctx.workspaceId}:${ctx.provider}:credentials`;
  } else if (parts[0] === "v2") {
    aad = `flowline:v2:connection:${ctx.rowId}:${ctx.workspaceId}:${ctx.provider}:credentials`;
  }
  return authenticationRejected(() => {
    const decipher = createDecipheriv("aes-256-gcm", replacement, iv, { authTagLength: 16 });
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    // Never retain plaintext, including if a wrong-key check unexpectedly succeeds.
    const first = decipher.update(ciphertext);
    first.fill(0);
    const last = decipher.final();
    last.fill(0);
  });
}

export function verifyOldCiphertextRows(rows: OldCipherRow[], replacement: Buffer, crypto: CryptoApi = appCrypto, exposedId = EXPOSED_WORKSPACE_KEY_ID): OldCipherResult {
  const replacementId = keyId(replacement);
  if (replacement.length !== 32 || replacementId === exposedId) throw new Error("replacement must differ from exposed key");
  const result: OldCipherResult = { candidateCount: 0, supportedCount: 0, rejectedCount: 0, unsupportedV1MarkerCount: 0, unsupportedFormatCount: 0, inferredLegacyV1Count: 0 };
  for (const row of rows) {
    // Include malformed/unknown rows marked with the old id, rather than silently filtering them out.
    const embeddedOld = row.secretEnc.startsWith(`v2.a256gcm-kw.${exposedId}.`);
    if (row.keyId !== exposedId && !embeddedOld) continue;
    result.candidateCount++;
    if (row.secretEnc.length > (row.secretEnc.startsWith("v1.") ? 32 * 1024 * 1024 : 64 * 1024)) throw new Error("unsupported persisted ciphertext size");
    const parts = row.secretEnc.split(".");
    const legacy = parts[0] === "v1" && parts.length === 4;
    const waveA = parts[0] === "v2" && parts.length === 4;
    const envelope = parts[0] === "v2" && parts[1] === "a256gcm-kw" && parts.length === 9;
    if (!legacy && !waveA && !envelope) { result.unsupportedFormatCount++; continue; }
    const inferredLegacy = row.legacyCrypto === null && row.legacyProvenance === "inferred-old-schema-v1";
    if (inferredLegacy && !legacy) throw new Error("old schema inference is restricted to v1");
    if (legacy && row.legacyCrypto !== true && !inferredLegacy) { result.unsupportedV1MarkerCount++; continue; }
    const ctx = context(row);
    // Check context syntax even for legacy rows. No arbitrary string from a row is logged.
    if ([ctx.rowId, ctx.workspaceId, ctx.provider].some((s) => !s || s.length > 200 || /[\s:]/.test(s))) throw new Error("unsupported persisted context");
    if (envelope && (crypto.envelopeKeyId(row.secretEnc) !== exposedId || row.keyId !== exposedId)) throw new Error("persisted envelope identity mismatch");
    if (!rawAuthenticationRejected(parts, replacement, ctx)) throw new Error("replacement key authenticated old ciphertext");
    // Independently exercise app opening: an envelope can fail at its missing-old-key guard.
    let rejected: boolean;
    if (legacy) rejected = authenticationRejected(() => crypto.decryptLegacyV1(row.secretEnc, replacementId));
    else if (waveA) rejected = authenticationRejected(() => crypto.decryptSecretV2(row.secretEnc, replacementId, ctx));
    else {
      try { crypto.decryptSecretV2(row.secretEnc, row.keyId, ctx); rejected = false; }
      catch (error) {
        if (!(error instanceof CryptoConfigError) || error.message !== `Encryption key ${exposedId} is not available`) throw new Error("unexpected app envelope rejection");
        rejected = true;
      }
    }
    if (!rejected) throw new Error("replacement app opened old ciphertext");
    result.supportedCount++;
    result.rejectedCount++;
    if (inferredLegacy) result.inferredLegacyV1Count++;
  }
  if (!result.candidateCount || result.supportedCount !== result.candidateCount || result.rejectedCount !== result.candidateCount) throw new Error("old ciphertext rejection proof incomplete");
  return result;
}

type DbRow = { id: string; workspace_id: string; provider: string; secret_enc: string; key_id: string; legacy_crypto?: boolean | null };
export type ConnectionSchema = { legacyCryptoColumn: boolean; legacyProvenance: "explicit-column" | "inferred-old-schema-v1" };
export async function detectConnectionSchema(client: PgClient): Promise<ConnectionSchema> {
  const columns = (await client.query<{ column_name: string; data_type: string }>("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'connection' ORDER BY ordinal_position")).rows;
  const names = new Set(columns.map((c) => c.column_name));
  if (["id", "workspace_id", "provider", "secret_enc", "key_id"].some((name) => !names.has(name))) throw new Error("required connection columns missing");
  const marker = columns.find((c) => c.column_name === "legacy_crypto");
  if (marker && marker.data_type !== "boolean") throw new Error("invalid legacy marker column type");
  return { legacyCryptoColumn: Boolean(marker), legacyProvenance: marker ? "explicit-column" : "inferred-old-schema-v1" };
}
function mapRow(row: DbRow, schema?: ConnectionSchema): OldCipherRow {
  // Do not manufacture true/false markers for a missing column: retain null plus explicit inference provenance.
  return { id: row.id, workspaceId: row.workspace_id, provider: row.provider, secretEnc: row.secret_enc, keyId: row.key_id, legacyCrypto: schema?.legacyCryptoColumn === false ? null : row.legacy_crypto ?? null, legacyProvenance: schema?.legacyProvenance ?? "explicit-column" };
}
function digest(rows: DbRow[]) { return createHash("sha256").update(JSON.stringify(rows)).digest("hex"); }
async function readOld(client: PgClient, exposedId: string, schema: ConnectionSchema) {
  const marker = schema.legacyCryptoColumn ? ", legacy_crypto" : "";
  return (await client.query<DbRow>(`SELECT id::text, workspace_id::text, provider, secret_enc, key_id${marker} FROM public.connection WHERE key_id = $1 OR secret_enc LIKE $2 ORDER BY id`, [exposedId, `v2.a256gcm-kw.${exposedId}.%`])).rows;
}

export async function verifySyntheticPersistence(client: PgClient, replacementId: string): Promise<void> {
  const rowId = randomUUID(), workspaceId = randomUUID();
  const provider = "openai";
  const ctx = context({ id: rowId, workspaceId, provider, secretEnc: "", keyId: "", legacyCrypto: false });
  const synthetic = { type: "api_key", token: "synthetic-dv2-02-verifier-credential", settings: {} };
  const encrypted = encryptSecretV2(synthetic, ctx);
  if (encrypted.keyId !== replacementId || envelopeKeyId(encrypted.ciphertext) !== replacementId) throw new Error("synthetic encryption identity mismatch");
  let committed = false, commitAttempted = false;
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO workspace (id, name, slug) VALUES ($1, $2, $3)", [workspaceId, "Synthetic DV2-02 proof", `dv2-02-${workspaceId}`]);
    await client.query("INSERT INTO connection (id, workspace_id, provider, label, auth_type, account_id, account_label, secret_enc, key_id, legacy_crypto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)", [rowId, workspaceId, provider, "Synthetic DV2-02 proof", "api_key", "synthetic", "synthetic", encrypted.ciphertext, encrypted.keyId]);
    commitAttempted = true;
    await client.query("COMMIT");
    committed = true;
    const stored = (await client.query<DbRow>("SELECT id::text, workspace_id::text, provider, secret_enc, key_id, legacy_crypto FROM connection WHERE id = $1 AND workspace_id = $2", [rowId, workspaceId])).rows;
    const value = stored[0];
    if (stored.length !== 1 || value.id !== rowId || value.workspace_id !== workspaceId || value.provider !== provider || value.key_id !== replacementId || value.legacy_crypto !== false || value.secret_enc !== encrypted.ciphertext) throw new Error("persisted synthetic row mismatch");
    const opened = openSecret({ ciphertext: value.secret_enc, keyId: value.key_id, legacy: value.legacy_crypto }, context(mapRow(value)));
    if (JSON.stringify(opened) !== JSON.stringify(synthetic)) throw new Error("persisted app crypto roundtrip mismatch");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("synthetic connection persistence failed");
  } finally {
    // Exact generated workspace only; cascade removes only our synthetic connection. Never drop a DB/table.
    if (commitAttempted) {
      try {
        const removed = await client.query("DELETE FROM workspace WHERE id = $1 AND slug = $2", [workspaceId, `dv2-02-${workspaceId}`]);
        if (removed.rowCount !== 1 && (committed || removed.rowCount !== 0)) throw new Error("cleanup row mismatch");
      } catch { throw new Error("synthetic fixture cleanup failed"); }
    }
  }
}

export async function verifyDatabases(options: PublicOptions, env: ProcessEnv, replacement: Buffer, makeClient: (url: URL, readOnly: boolean) => PgClient, exposedId = EXPOSED_WORKSPACE_KEY_ID) {
  const newUrl = validateProcessEnvironment(options, env);
  const configured = keyBytes(env.FLOWLINE_ENCRYPTION_KEY);
  try {
    if (!configured.equals(replacement) || currentKeyId("workspace") !== keyId(replacement)) throw new Error("active replacement key mismatch");
  } finally { configured.fill(0); }
  const oldUrl = new URL(newUrl); oldUrl.pathname = `/${options.oldDatabase}`;
  const oldClient = makeClient(oldUrl, true), newClient = makeClient(newUrl, false);
  try {
    await oldClient.connect();
    await oldClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if ((await oldClient.query<{ name: string }>("SELECT current_database() AS name")).rows[0]?.name !== options.oldDatabase) throw new Error("old database identity mismatch");
    const oldSchema = await detectConnectionSchema(oldClient);
    const before = await readOld(oldClient, exposedId, oldSchema);
    const oldCiphertext = verifyOldCiphertextRows(before.map((row) => mapRow(row, oldSchema)), replacement, appCrypto, exposedId);
    await oldClient.query("ROLLBACK");
    await newClient.connect();
    if ((await newClient.query<{ name: string }>("SELECT current_database() AS name")).rows[0]?.name !== options.newDatabase) throw new Error("new database identity mismatch");
    const newSchema = await detectConnectionSchema(newClient);
    if (!newSchema.legacyCryptoColumn) throw new Error("new database requires current legacy marker schema");
    await verifySyntheticPersistence(newClient, keyId(replacement));
    await oldClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const afterSchema = await detectConnectionSchema(oldClient);
    if (JSON.stringify(oldSchema) !== JSON.stringify(afterSchema)) throw new Error("old schema changed during proof");
    const after = await readOld(oldClient, exposedId, afterSchema);
    if (digest(before) !== digest(after)) throw new Error("preserved old connection rows changed");
    await oldClient.query("ROLLBACK");
    return { oldCiphertext, oldSchema, newSchema, oldConnectionRowsUnchanged: true, syntheticConnectionSchemaPersistence: true, syntheticFixtureCleaned: true };
  } catch { throw new Error("database proof failed"); }
  finally {
    await oldClient.query("ROLLBACK").catch(() => undefined);
    await Promise.all([oldClient.end().catch(() => undefined), newClient.end().catch(() => undefined)]);
  }
}

// Pure audit processor for synthetic tests; never return parsed values or key identities.
export function auditEnvironment(env: ProcessEnv, exposedId = EXPOSED_WORKSPACE_KEY_ID) {
  let invalidKeyCount = 0, affectedKeyCount = 0;
  for (const name of ["FLOWLINE_ENCRYPTION_KEY", "FLOWLINE_PLATFORM_ENCRYPTION_KEY", "FLOWLINE_ENCRYPTION_KEYS_OLD", "FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD"]) {
    for (const value of (env[name] ?? "").split(",").filter((s) => s.trim())) {
      let bytes: Buffer | undefined;
      try { bytes = keyBytes(value); if (keyId(bytes) === exposedId) affectedKeyCount++; }
      catch { invalidKeyCount++; } finally { bytes?.fill(0); }
    }
  }
  return { affectedKeyCount, invalidKeyCount, oldFallbackPresent: Boolean(env.FLOWLINE_ENCRYPTION_KEYS_OLD?.trim() || env.FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD?.trim()) };
}
export function parseNamedEnvironmentBytes(bytes: Buffer): ProcessEnv {
  if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes.length % 2 !== 0) throw new Error("unsupported named environment encoding");
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8").replace(/^\uFEFF/, "");
  if (text.includes("\0") || text.includes("\uFFFD")) throw new Error("unsupported named environment encoding");
  // Required dotenv subset: blank/comment lines and unique NAME=value assignments,
  // optional horizontal whitespace, single-line single/double quotes, inline comments,
  // or empty/unquoted values. No export, multiline quotes, backtick quoting or garbage lines.
  // Validate the ENTIRE file before the permissive Node parser can drop malformed fallbacks.
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (/^[ \t]*(?:#.*)?$/.test(line)) continue;
    const assignment = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/.exec(line);
    if (!assignment || line.includes("\r") || names.has(assignment[1])) throw new Error("invalid dotenv syntax");
    names.add(assignment[1]);
    const value = assignment[2];
    if (value.startsWith("'") || value.startsWith('"')) {
      const closing = value.indexOf(value[0], 1);
      if (closing < 0 || !/^[ \t]*(?:#.*)?$/.test(value.slice(closing + 1))) throw new Error("invalid dotenv syntax");
    } else if (/["'`]/.test(value.split("#", 1)[0])) throw new Error("invalid dotenv syntax");
  }
  const parsed = parseEnv(text);
  if (Object.keys(parsed).length !== names.size || [...names].some((name) => !Object.hasOwn(parsed, name))) throw new Error("dotenv parser omitted an assignment");
  return parsed;
}
function namedEnvironment(name: typeof NAMED_FILES[number]): ProcessEnv | null {
  const path = resolve(PARENT, name);
  if (!existsSync(path)) return null;
  // Refuse symlinks/junctions escaping the named checkout. No recursive scan.
  const root = realpathSync(resolve(PARENT, name.split("/")[0]));
  if (!realpathSync(path).startsWith(`${root}${sep}`) || realpathSync(path).toLowerCase() !== path.toLowerCase()) throw new Error("named file escapes its exact path");
  const bytes = readFileSync(path);
  try { return parseNamedEnvironmentBytes(bytes); } finally { bytes.fill(0); }
}
export function auditNamedEnvironments(read: (name: typeof NAMED_FILES[number]) => ProcessEnv | null) {
  return NAMED_FILES.map((name) => {
    const env = read(name);
    return { source: name, exists: env !== null, ...(env ? auditEnvironment(env) : { status: "ABSENT" }) };
  });
}
function checkedSource() {
  const expected = execFileSync("git", ["show", `${CANDIDATE_SHA}:src/server/crypto.ts`], { cwd: WORKTREE, stdio: ["ignore", "pipe", "ignore"] });
  const actual = readFileSync(resolve(WORKTREE, "src/server/crypto.ts"));
  if (expected.toString().replaceAll("\r\n", "\n") !== actual.toString().replaceAll("\r\n", "\n")) throw new Error("candidate crypto source mismatch");
  return { candidateSha: CANDIDATE_SHA, worktreeBaseSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: WORKTREE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), cryptoSourceSha256: createHash("sha256").update(expected).digest("hex") };
}
export async function runVerification(argv: string[]) {
  const source = checkedSource();
  if (argv.length === 1 && argv[0] === "--audit-named-envs") {
    const files = auditNamedEnvironments(namedEnvironment);
    return { status: "AUDIT_ONLY", ...source, files, limitations: ["Named file audit only; staging containers and historical rotations are not currently reverified."] };
  }
  const target = argv[0];
  if (target !== "--primary" && target !== "--aihub") throw new Error("choose a named disposable target");
  const root = target === "--primary" ? "FlowLine" : "FL-wt-aihub";
  const options = parsePublicOptions(argv.slice(1));
  const record = JSON.parse(readFileSync(resolve(PRIMARY, "artifacts/beta-execution/20260930T122429Z/key-rotation.json"), "utf8")) as { environments: { root: string; oldDatabase: string; newDatabase: string; workspaceKeyId: string }[] };
  const recorded = record.environments.filter((r) => r.root === root);
  if (recorded.length !== 1 || recorded[0].oldDatabase !== options.oldDatabase || recorded[0].newDatabase !== options.newDatabase) throw new Error("database pair differs from named rotation record");
  const env = namedEnvironment(`${root}/.env.test`);
  if (!env) throw new Error("named test environment absent");
  validateProcessEnvironment(options, env);
  const replacement = keyBytes(env.FLOWLINE_ENCRYPTION_KEY);
  try {
    assertReplacementIdentity(keyId(replacement), recorded[0].workspaceKeyId);
    // Only workspace values are needed by app crypto; ignore inherited shell fallback/key variables.
    process.env.FLOWLINE_ENCRYPTION_KEY = env.FLOWLINE_ENCRYPTION_KEY;
    process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = "";
    if (currentKeyId("workspace") !== keyId(replacement)) throw new Error("active app identity mismatch");
    const { Client } = localRequire("pg") as { Client: new (config: unknown) => PgClient & { on(event: "error", listener: () => void): void } };
    const proof = await verifyDatabases(options, env, replacement, (url, readOnly) => {
      const client = new Client({ connectionString: url.toString(), application_name: "dv2-02-reviewed-proof", connectionTimeoutMillis: 5000, query_timeout: 10000, options: `-c statement_timeout=10000 -c lock_timeout=3000${readOnly ? " -c default_transaction_read_only=on" : ""}` });
      // Never let an asynchronous pg event print its raw Error/connection details.
      client.on("error", () => undefined);
      return client;
    });
    return { status: "PASS", ...source, target: root, ...proof, replacementIdentityMatchesRecord: true, activeOldKeyFallbackAbsent: true, limitations: ["Connection ciphertext only; all selected candidates must be supported. Old keys are never loaded, so historical ciphertext validity cannot be independently reauthenticated.", "If the old schema has no legacy_crypto column, v1 provenance is inferred from schema metadata and format only; no persisted legacy marker or migration history is claimed. Raw AES-GCM and app decryptLegacyV1 rejection remain required for every inferred row.", "Persistence uses app encryptSecretV2/openSecret and the real connection/workspace schema; no HTTP/provider/browser proof.", "Old DB is read-only; preservation comparison covers only selected old connection rows. No database creation, migration or rotation is performed."] };
  } finally { replacement.fill(0); delete process.env.FLOWLINE_ENCRYPTION_KEY; delete process.env.FLOWLINE_ENCRYPTION_KEYS_OLD; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVerification(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(() => {
    process.stderr.write("DV2-02 proof INCOMPLETE; configuration, ciphertext and database errors suppressed.\n"); process.exitCode = 1;
  });
}
