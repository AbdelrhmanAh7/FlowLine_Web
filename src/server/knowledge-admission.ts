import { and, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { HttpError } from "./http";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
function limit(key: string, fallback: number): bigint {
  const value = process.env[key];
  if (value === undefined) return BigInt(fallback);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new HttpError(503, "KNOWLEDGE_QUEUE_CONFIG", "Knowledge indexing limits need administrator attention");
  return BigInt(value);
}

/** Operational admission limits, independent of subscription entitlements. */
export function knowledgeQueueLimits() {
  return {
    workspace: limit("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", 16),
    installation: limit("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_QUEUED", 64),
  };
}

export async function lockKnowledgeAdmission(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('flowline:knowledge-index-budget', 0))`);
}

/** Count after the installation lock in READ COMMITTED. Every transition into pending
 * uses this gate; pending->indexing keeps its slot, ready/failed/deleted free it.
 * Reindex excludes its own existing row, then admits exactly one slot. Acquiring
 * this lock before retained-file admission keeps one lock order across all writers.
 * The insert/update must remain in the same transaction; rollback reserves nothing.
 */
export async function admitKnowledgeIndex(tx: Tx, workspaceId: string, excludeSourceId?: string) {
  const limits = knowledgeQueueLimits();
  await lockKnowledgeAdmission(tx);
  const [queued] = await tx.select({
    installation: sql<string>`count(*)::text`,
    workspace: sql<string>`count(*) filter (where ${schema.knowledgeSource.workspaceId} = ${workspaceId})::text`,
  }).from(schema.knowledgeSource).where(and(
    isNull(schema.knowledgeSource.deletedAt),
    sql`${schema.knowledgeSource.status} in ('pending', 'indexing')`,
    excludeSourceId ? sql`${schema.knowledgeSource.id} <> ${excludeSourceId}` : undefined,
  ));
  if (BigInt(queued!.workspace) + 1n > limits.workspace) throw new HttpError(429, "KNOWLEDGE_WORKSPACE_QUEUE_LIMIT", "This workspace's knowledge indexing queue is full");
  if (BigInt(queued!.installation) + 1n > limits.installation) throw new HttpError(429, "KNOWLEDGE_INSTALLATION_QUEUE_LIMIT", "Knowledge indexing is busy; try again after queued sources finish");
}
