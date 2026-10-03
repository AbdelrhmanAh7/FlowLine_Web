import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { schema } from "@/db";
import { extractKnowledge, KnowledgeExtractionError, KNOWLEDGE_MAX_CHUNKS } from "./knowledge-extract";
import type { CurrentUser } from "./access";
import { audit, userActor } from "./audit";
import { HttpError, notFound } from "./http";
import { insertRetainedFile } from "./retained-files";
import { admitKnowledgeIndex, lockKnowledgeAdmission } from "./knowledge-admission";

/**
 * Knowledge: workspace documents indexed into chunks and retrieved with PostgreSQL full-text search
 * (to_tsvector / websearch-style OR query / ts_rank_cd). No embedding model is used or claimed.
 * Retrieval re-checks the source ACL on every query (workspace, not deleted, enabled, ready, and the
 * caller's allowed-source list), so revoking access takes effect immediately — there is no cache.
 */
export const KNOWLEDGE_MAX_BYTES = 5 * 1024 * 1024;
export { KNOWLEDGE_MAX_CHUNKS } from "./knowledge-extract";

const TYPES: Record<string, "text" | "markdown" | "csv" | "json" | "pdf"> = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/csv": "csv",
  "application/json": "json",
  "application/pdf": "pdf",
};

export function detectType(name: string, mime: string, bytes: Buffer): keyof typeof TYPES | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "csv") return "text/csv";
  if (ext === "json") return "application/json";
  if (ext === "txt") return "text/plain";
  return mime in TYPES && mime !== "application/pdf" ? (mime as keyof typeof TYPES) : null;
}

export function publicSource(s: typeof schema.knowledgeSource.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    mime: s.mime,
    size: s.size,
    status: s.status,
    error: s.error,
    chunkCount: s.chunkCount,
    enabled: s.enabled,
    createdAt: s.createdAt,
    indexedAt: s.indexedAt,
  };
}

export async function listSources(db: Db, workspaceId: string) {
  const rows = await db
    .select()
    .from(schema.knowledgeSource)
    .where(and(eq(schema.knowledgeSource.workspaceId, workspaceId), isNull(schema.knowledgeSource.deletedAt)))
    .orderBy(desc(schema.knowledgeSource.createdAt));
  return rows.map(publicSource);
}

/** Adds a source (uploaded file or pasted text). Validation happens here; indexing happens in the worker. */
export async function addSource(db: Db, user: CurrentUser, workspaceId: string, input: { name: string; bytes: Buffer; mime: string; kind: "file" | "text" }) {
  if (input.bytes.length === 0) throw new HttpError(400, "EMPTY_SOURCE", "The file or text is empty");
  if (input.bytes.length > KNOWLEDGE_MAX_BYTES) throw new HttpError(413, "SOURCE_TOO_LARGE", "Knowledge sources are limited to 5MB");
  const mime = input.kind === "text" ? "text/plain" : detectType(input.name, input.mime, input.bytes);
  if (!mime) throw new HttpError(415, "UNSUPPORTED_TYPE", "Upload text, Markdown, CSV, JSON or PDF");
  const name = input.name.trim().slice(0, 120) || "Untitled";
  return db.transaction(async (tx) => {
    await admitKnowledgeIndex(tx, workspaceId);
    const file = await insertRetainedFile(tx, { workspaceId, name, mime, data: input.bytes, createdBy: user.id });
    const [src] = await tx
      .insert(schema.knowledgeSource)
      .values({ workspaceId, name, kind: mime === "text/csv" ? "table" : input.kind, fileId: file!.id, mime, size: input.bytes.length, status: "pending", createdBy: user.id })
      .returning();
    await tx.execute(sql`select pg_notify('flowline_runs', 'knowledge')`);
    return publicSource(src!);
  });
}

export async function requireSource(db: Db, workspaceId: string, sourceId: string) {
  const [s] = await db
    .select()
    .from(schema.knowledgeSource)
    .where(and(eq(schema.knowledgeSource.id, sourceId), eq(schema.knowledgeSource.workspaceId, workspaceId), isNull(schema.knowledgeSource.deletedAt)));
  if (!s) throw notFound("Knowledge source not found");
  return s;
}

/** Soft-deletes the source and removes its chunks and file (retrieval stops immediately). */
export async function deleteSource(db: Db, user: CurrentUser, workspaceId: string, sourceId: string) {
  const s = await requireSource(db, workspaceId, sourceId);
  await db.transaction(async (tx) => {
    await tx.update(schema.knowledgeSource).set({ deletedAt: new Date(), enabled: false }).where(eq(schema.knowledgeSource.id, s.id));
    await tx.delete(schema.knowledgeChunk).where(eq(schema.knowledgeChunk.sourceId, s.id));
    if (s.fileId) await tx.delete(schema.fileObject).where(eq(schema.fileObject.id, s.fileId));
    await audit(tx, { workspaceId, actor: userActor(user), action: "knowledge.deleted", targetType: "knowledge_source", targetId: s.id, data: { name: s.name } });
  });
}

export async function setEnabled(db: Db, user: CurrentUser, workspaceId: string, sourceId: string, enabled: boolean) {
  const s = await requireSource(db, workspaceId, sourceId);
  const [row] = await db.update(schema.knowledgeSource).set({ enabled }).where(eq(schema.knowledgeSource.id, s.id)).returning();
  if (!enabled) await audit(db, { workspaceId, actor: userActor(user), action: "knowledge.disabled", targetType: "knowledge_source", targetId: s.id, data: { name: s.name } });
  return publicSource(row!);
}

/** Re-index: bumps the generation; the worker rebuilds chunks and drops the old generation. */
export async function reindexSource(db: Db, workspaceId: string, sourceId: string) {
  await requireSource(db, workspaceId, sourceId);
  return db.transaction(async (tx) => {
    await lockKnowledgeAdmission(tx);
    const [s] = await tx.select().from(schema.knowledgeSource)
      .where(and(eq(schema.knowledgeSource.id, sourceId), eq(schema.knowledgeSource.workspaceId, workspaceId), isNull(schema.knowledgeSource.deletedAt)))
      .for("update");
    if (!s) throw notFound("Knowledge source not found");
    if (!s.fileId) throw new HttpError(409, "NO_CONTENT", "This source has no stored content to re-index");
    await admitKnowledgeIndex(tx, workspaceId, s.id);
    const [row] = await tx.update(schema.knowledgeSource).set({ status: "pending", error: null, lockedBy: null })
      .where(eq(schema.knowledgeSource.id, s.id)).returning();
    await tx.execute(sql`select pg_notify('flowline_runs', 'knowledge')`);
    return publicSource(row!);
  });
}

/* ───────────── indexing (worker) ───────────── */

/** Claims one pending source and indexes it. Returns true if a source was processed. */
export async function indexNextSource(db: Db, workerId: string): Promise<boolean> {
  const claimed = await db.execute<{ id: string }>(sql`
    update knowledge_source set status = 'indexing', locked_by = ${workerId}
    where id = (select id from knowledge_source where status = 'pending' and deleted_at is null order by created_at for update skip locked limit 1)
    returning id`);
  const id = claimed.rows[0]?.id;
  if (!id) return false;
  const [s] = await db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.id, id));
  const mine = and(eq(schema.knowledgeSource.id, id), eq(schema.knowledgeSource.lockedBy, workerId));
  try {
    const [file] = s!.fileId ? await db.select().from(schema.fileObject).where(eq(schema.fileObject.id, s!.fileId)) : [];
    if (!file) throw new Error("The stored content is missing — upload the source again");
    const pieces = (await extractKnowledge(s!.mime ?? file.mime, file.data)).filter((p) => p.text.length > 0);
    if (pieces.length === 0) throw new Error("No indexable text was found");
    if (pieces.length > KNOWLEDGE_MAX_CHUNKS) throw new Error(`This source is too large to index (${pieces.length} chunks; limit ${KNOWLEDGE_MAX_CHUNKS})`);
    const generation = s!.generation + 1;
    await db.transaction(async (tx) => {
      for (let i = 0; i < pieces.length; i += 200) {
        await tx.insert(schema.knowledgeChunk).values(
          pieces.slice(i, i + 200).map((p, j) => ({ sourceId: id, workspaceId: s!.workspaceId, generation, ordinal: i + j, text: p.text.slice(0, 4000), locator: p.locator })),
        );
      }
      const done = await tx
        .update(schema.knowledgeSource)
        .set({ status: "ready", error: null, chunkCount: pieces.length, generation, indexedAt: new Date(), lockedBy: null })
        .where(mine)
        .returning({ id: schema.knowledgeSource.id });
      if (done.length === 0) throw new Error("lost the indexing claim");
      await tx.delete(schema.knowledgeChunk).where(and(eq(schema.knowledgeChunk.sourceId, id), lt(schema.knowledgeChunk.generation, generation)));
    });
  } catch (e) {
    await db
      .update(schema.knowledgeSource)
      .set({ status: "failed", error: e instanceof KnowledgeExtractionError ? e.code : (e as Error).message.slice(0, 300), lockedBy: null })
      .where(mine);
  }
  return true;
}

/* ───────────── retrieval ───────────── */

export interface Citation {
  sourceId: string;
  sourceName: string;
  ordinal: number;
  label: string;
}
export interface RetrievalHit extends Citation {
  text: string;
  score: number;
  locator: Record<string, unknown> | null;
}


function locatorLabel(loc: Record<string, unknown> | null, ordinal: number) {
  if (loc?.row) return `row ${loc.row}`;
  if (loc?.item) return `item ${loc.item}`;
  return `part ${ordinal + 1}`;
}

/**
 * Searches ready, enabled, non-deleted sources of ONE workspace. `allowedSourceIds` (agents) narrows it
 * further; an empty allow-list means no access. The ACL is evaluated in the same query — never cached.
 */
export async function searchKnowledge(db: Db, workspaceId: string, query: string, opts: { allowedSourceIds?: string[]; limit?: number } = {}): Promise<RetrievalHit[]> {
  const text = query.slice(0, 500);
  if (!text.trim()) return [];
  if (opts.allowedSourceIds && opts.allowedSourceIds.length === 0) return [];
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  // OR of the question's own lexemes, produced by the same parser/stemmer as the documents
  // (so "2026-09-21" or "refunds" match exactly as they were indexed). Stop words drop out.
  const res = await db.execute<{ q: string | null }>(
    sql`select string_agg(quote_literal(l), ' | ') as q from (select unnest(tsvector_to_array(to_tsvector('english', ${text}))) as l limit 32) t`,
  );
  const orQuery = res.rows[0]?.q;
  if (!orQuery) return [];
  const q = sql`${orQuery}::tsquery`;
  const rows = await db
    .select({
      sourceId: schema.knowledgeChunk.sourceId,
      sourceName: schema.knowledgeSource.name,
      ordinal: schema.knowledgeChunk.ordinal,
      text: schema.knowledgeChunk.text,
      locator: schema.knowledgeChunk.locator,
      score: sql<number>`ts_rank_cd(${schema.knowledgeChunk.tsv}, ${q})`,
    })
    .from(schema.knowledgeChunk)
    .innerJoin(
      schema.knowledgeSource,
      and(eq(schema.knowledgeSource.id, schema.knowledgeChunk.sourceId), eq(schema.knowledgeSource.generation, schema.knowledgeChunk.generation)),
    )
    .where(
      and(
        eq(schema.knowledgeChunk.workspaceId, workspaceId),
        eq(schema.knowledgeSource.workspaceId, workspaceId),
        isNull(schema.knowledgeSource.deletedAt),
        eq(schema.knowledgeSource.enabled, true),
        eq(schema.knowledgeSource.status, "ready"),
        opts.allowedSourceIds ? inArray(schema.knowledgeSource.id, opts.allowedSourceIds) : undefined,
        sql`${schema.knowledgeChunk.tsv} @@ ${q}`,
      ),
    )
    .orderBy(sql`ts_rank_cd(${schema.knowledgeChunk.tsv}, ${q}) desc`, schema.knowledgeChunk.ordinal)
    .limit(limit);
  return rows.map((r) => ({
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    ordinal: r.ordinal,
    text: r.text,
    locator: r.locator ?? null,
    score: Math.round(Number(r.score) * 1000) / 1000,
    label: `${r.sourceName} · ${locatorLabel(r.locator ?? null, r.ordinal)}`,
  }));
}
