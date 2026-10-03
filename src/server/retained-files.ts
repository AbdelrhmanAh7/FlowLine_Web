import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { HttpError } from "./http";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type FileInput = Pick<typeof schema.fileObject.$inferInsert, "workspaceId" | "name" | "mime" | "createdBy"> & { data: Buffer };
const MIB = 1024 * 1024;

function limit(key: string, fallback: number): bigint {
  const value = process.env[key];
  if (value === undefined) return BigInt(fallback);
  const parsed = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed)) throw new HttpError(503, "UPLOAD_STORAGE_CONFIG", "Upload storage limits need administrator attention");
  return BigInt(parsed);
}

/** Operational raw-byte circuit breakers, independent of subscription entitlements. */
export function retainedFileLimits() {
  return {
    workspace: limit("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", 100 * MIB),
    installation: limit("FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES", 512 * MIB),
  };
}

/** MUST precede workspace/source/file row locks in every transaction that can write
 * retained files, including parent deletes. The row trigger runs too late to enforce
 * that order. See docs/security/RETAINED_UPLOAD_ACCOUNTING.md.
 */
export async function lockRetainedFileAccounting(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('flowline:retained-upload-budget', 0))`);
  const [installation] = await tx.select().from(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, "installation")).for("update");
  // The migration seeds the singleton. Missing accounting must never fail open.
  if (!installation) throw new HttpError(503, "UPLOAD_STORAGE_CONFIG", "Upload storage limits need administrator attention");
  return installation;
}

/** Keep the admission advisory lock to coordinate with pre-counter upload writers.
 * Lock two indexed counter rows, installation first (the same order as the DB trigger).
 * The file trigger maintains actual bytea bytes and counts on insert/update/delete,
 * including workspace cascades. The locks last through insertion/commit, so waiting
 * admissions see committed totals under READ COMMITTED. Rollbacks undo both file and
 * counters. Admission never scans file rows; chunks/row overhead remain unaccounted.
 */
export async function insertRetainedFile(tx: Tx, input: FileInput) {
  const limits = retainedFileLimits();
  const installation = await lockRetainedFileAccounting(tx);
  const counter = schema.retainedFileCounter;
  await tx.insert(counter).values({ scope: input.workspaceId, workspaceId: input.workspaceId }).onConflictDoNothing();
  const [workspace] = await tx.select().from(counter).where(eq(counter.scope, input.workspaceId)).for("update");
  const bytes = BigInt(input.data.length);
  if (workspace!.totalBytes + bytes > limits.workspace) throw new HttpError(413, "UPLOAD_WORKSPACE_STORAGE_LIMIT", "This workspace's retained upload storage is full");
  if (installation.totalBytes + bytes > limits.installation) throw new HttpError(413, "UPLOAD_INSTALLATION_STORAGE_LIMIT", "Retained upload storage is full; contact the administrator");
  const [file] = await tx.insert(schema.fileObject).values({ ...input, size: input.data.length, sha256: createHash("sha256").update(input.data).digest("hex") })
    .returning({ id: schema.fileObject.id, name: schema.fileObject.name, mime: schema.fileObject.mime, size: schema.fileObject.size });
  return file!;
}
