import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export class KnowledgeStorageError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "KnowledgeStorageError"; }
}
function limit(key: string, fallback: number) {
  const value = process.env[key];
  if (value === undefined) return BigInt(fallback);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new KnowledgeStorageError("KNOWLEDGE_CHUNK_STORAGE_CONFIG");
  return BigInt(value);
}
/** Operational text-byte limits; exclude indexes/row overhead and subscription promises. */
export function knowledgeChunkLimits() {
  return {
    workspace: limit("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_CHUNK_BYTES", 128 * 1024 * 1024),
    installation: limit("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", 512 * 1024 * 1024),
  };
}

/** Serialize final indexing writes across workspaces. Count actual stored UTF-8 text
 * after the lock; the caller replaces ALL this source's generations in this same tx.
 * A failed quota or lost worker claim rolls back both old-chunk deletion and inserts.
 * Deletion only frees capacity and needs no admission lock. */
export async function admitKnowledgeChunks(tx: Tx, workspaceId: string, sourceId: string, texts: readonly string[]) {
  const limits = knowledgeChunkLimits();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('flowline:knowledge-chunk-budget', 0))`);
  const [stored] = await tx.select({
    installation: sql<string>`coalesce(sum(octet_length(${schema.knowledgeChunk.text})), 0)::text`,
    workspace: sql<string>`coalesce(sum(case when ${schema.knowledgeChunk.workspaceId} = ${workspaceId} then octet_length(${schema.knowledgeChunk.text}) else 0 end), 0)::text`,
  }).from(schema.knowledgeChunk).where(sql`${schema.knowledgeChunk.sourceId} <> ${sourceId}`);
  const bytes = texts.reduce((total, text) => total + BigInt(Buffer.byteLength(text, "utf8")), 0n);
  if (BigInt(stored!.workspace) + bytes > limits.workspace) throw new KnowledgeStorageError("KNOWLEDGE_WORKSPACE_CHUNK_STORAGE_LIMIT");
  if (BigInt(stored!.installation) + bytes > limits.installation) throw new KnowledgeStorageError("KNOWLEDGE_INSTALLATION_CHUNK_STORAGE_LIMIT");
}
