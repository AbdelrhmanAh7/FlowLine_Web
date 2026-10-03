import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
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

/** All production file inserts use this transaction-scoped admission lock.
 * One installation lock serializes writers across routes/workspaces. The sum is
 * read AFTER acquiring it, in the default READ COMMITTED transaction, so a waiting
 * writer sees the preceding commit. Count actual bytea bytes, not caller metadata.
 * Deletes can only free capacity; they need no admission lock. No reservation can
 * survive a failed/rolled-back insert. This does not account for chunks/row overhead.
 */
export async function insertRetainedFile(tx: Tx, input: FileInput) {
  const limits = retainedFileLimits();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('flowline:retained-upload-budget', 0))`);
  const [stored] = await tx.select({
    installation: sql<string>`coalesce(sum(octet_length(${schema.fileObject.data})), 0)::text`,
    workspace: sql<string>`coalesce(sum(case when ${schema.fileObject.workspaceId} = ${input.workspaceId} then octet_length(${schema.fileObject.data}) else 0 end), 0)::text`,
  }).from(schema.fileObject);
  const bytes = BigInt(input.data.length);
  if (BigInt(stored!.workspace) + bytes > limits.workspace) throw new HttpError(413, "UPLOAD_WORKSPACE_STORAGE_LIMIT", "This workspace's retained upload storage is full");
  if (BigInt(stored!.installation) + bytes > limits.installation) throw new HttpError(413, "UPLOAD_INSTALLATION_STORAGE_LIMIT", "Retained upload storage is full; contact the administrator");
  const [file] = await tx.insert(schema.fileObject).values({ ...input, size: input.data.length, sha256: createHash("sha256").update(input.data).digest("hex") })
    .returning({ id: schema.fileObject.id, name: schema.fileObject.name, mime: schema.fileObject.mime, size: schema.fileObject.size });
  return file!;
}
