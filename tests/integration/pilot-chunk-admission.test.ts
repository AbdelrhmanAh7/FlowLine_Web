import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
const claimFence = vi.hoisted(() => ({ afterAdmission: undefined as undefined | ((id: string) => Promise<void>) }));
vi.mock("@/server/knowledge-storage", async importOriginal => {
  const original = await importOriginal<typeof import("@/server/knowledge-storage")>();
  return { ...original, admitKnowledgeChunks: async (...args: Parameters<typeof original.admitKnowledgeChunks>) => {
    await original.admitKnowledgeChunks(...args);
    await claimFence.afterAdmission?.(args[2]);
  } };
});
import { db, schema } from "@/db";
import { addSource, deleteSource, indexNextSource, reindexSource, searchKnowledge } from "@/server/knowledge";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

const owned: string[] = [];
afterEach(async () => {
  claimFence.afterAdmission = undefined;
  vi.unstubAllEnvs();
  for (const id of owned.splice(0)) await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
});
afterAll(closeDb);
async function setup() {
  const user = await makeUser("chunk-owner");
  const ws = await createWorkspace(user, unique("Chunk storage")); owned.push(ws.id);
  return { user, ws };
}
async function limits(workspace: number, installation: number) {
  const [stored] = await db.select({ n: sql<string>`coalesce(sum(octet_length(${schema.knowledgeChunk.text})),0)::text` }).from(schema.knowledgeChunk);
  vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_CHUNK_BYTES", String(workspace));
  vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", String(BigInt(stored!.n) + BigInt(installation)));
}
const source = (user: Awaited<ReturnType<typeof makeUser>>, wid: string, text: string) => addSource(db, user, wid, { name: "synthetic.txt", mime: "text/plain", kind: "text", bytes: Buffer.from(text) });
const status = async (id: string) => (await db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.id, id)))[0]!;
const chunks = (id: string) => db.select().from(schema.knowledgeChunk).where(eq(schema.knowledgeChunk.sourceId, id));
async function drain() { while (await indexNextSource(db, unique("chunk-worker"))) { /* synthetic isolated database */ } }
async function change(id: string, text: string) {
  const s = await status(id);
  await db.update(schema.fileObject).set({ data: Buffer.from(text), size: Buffer.byteLength(text) }).where(eq(schema.fileObject.id, s.fileId!));
}

describe("atomic indexed text storage", () => {
  it("concurrent workers admit only one source when their combined text exceeds workspace capacity", async () => {
    const { user, ws } = await setup(); await limits(6, 10000);
    const a = await source(user, ws.id, "aaaa"); const b = await source(user, ws.id, "bbbb");
    await Promise.all([indexNextSource(db, unique("chunk-a")), indexNextSource(db, unique("chunk-b"))]); await drain();
    const states = [await status(a.id), await status(b.id)];
    expect(states.map(s => s.status).sort()).toEqual(["failed", "ready"]);
    const denied = states.find(s => s.status === "failed")!;
    expect(denied.error).toBe("KNOWLEDGE_WORKSPACE_CHUNK_STORAGE_LIMIT");
    expect(await chunks(denied.id)).toHaveLength(0);
    expect((await chunks(a.id)).concat(await chunks(b.id)).reduce((n, c) => n + Buffer.byteLength(c.text), 0)).toBe(4);
  });
  it("installation text capacity is shared across workspaces", async () => {
    const a = await setup(); const b = await setup(); await limits(10000, 6);
    const sa = await source(a.user, a.ws.id, "aaaa"); const sb = await source(b.user, b.ws.id, "bbbb");
    await Promise.all([indexNextSource(db, unique("global-a")), indexNextSource(db, unique("global-b"))]); await drain();
    const states = [await status(sa.id), await status(sb.id)];
    expect(states.map(s => s.status).sort()).toEqual(["failed", "ready"]);
    expect(states.find(s => s.status === "failed")!.error).toBe("KNOWLEDGE_INSTALLATION_CHUNK_STORAGE_LIMIT");
    expect((await chunks(sa.id)).concat(await chunks(sb.id)).reduce((n,c) => n + Buffer.byteLength(c.text),0)).toBe(4);
  });
  it("reindex counts replacement bytes, preserves old generation on denial and hides failed sources", async () => {
    const { user, ws } = await setup(); await limits(5, 10000);
    const first = await source(user, ws.id, "aaaa"); await drain();
    const initialGeneration = (await status(first.id)).generation;
    await change(first.id, "bbbbb"); await reindexSource(db, ws.id, first.id); await drain();
    expect(await status(first.id)).toMatchObject({ status: "ready", generation: initialGeneration + 1 });
    expect((await chunks(first.id)).map(c => c.text)).toEqual(["bbbbb"]);
    const old = await chunks(first.id);
    await change(first.id, "cccccc"); await reindexSource(db, ws.id, first.id); await drain();
    expect(await status(first.id)).toMatchObject({ status: "failed", generation: initialGeneration + 1, error: "KNOWLEDGE_WORKSPACE_CHUNK_STORAGE_LIMIT" });
    expect(await chunks(first.id)).toEqual(old);
    expect(await searchKnowledge(db, ws.id, "bbbbb")).toEqual([]);
  });
  it("deleting indexed content frees capacity", async () => {
    const { user, ws } = await setup(); await limits(4, 10000);
    const first = await source(user, ws.id, "aaaa"); await drain();
    const second = await source(user, ws.id, "bbbb"); await drain();
    expect((await status(second.id)).status).toBe("failed");
    await deleteSource(db, user, ws.id, first.id);
    expect(await chunks(first.id)).toHaveLength(0);
    await reindexSource(db, ws.id, second.id); await drain();
    expect((await status(second.id)).status).toBe("ready");
  });
  it("counts actual UTF-8 bytes and persists invalid configuration without losing old chunks", async () => {
    const { user, ws } = await setup(); await limits(1, 10000);
    const first = await source(user, ws.id, "\u0623"); await drain();
    expect(await status(first.id)).toMatchObject({ status: "failed", error: "KNOWLEDGE_WORKSPACE_CHUNK_STORAGE_LIMIT" });
    expect(await chunks(first.id)).toHaveLength(0);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_CHUNK_BYTES", "2");
    await reindexSource(db, ws.id, first.id); await drain();
    const old = await chunks(first.id); expect(old).toHaveLength(1);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", "0");
    await reindexSource(db, ws.id, first.id); await drain();
    expect(await status(first.id)).toMatchObject({ status: "failed", error: "KNOWLEDGE_CHUNK_STORAGE_CONFIG" });
    expect(await chunks(first.id)).toEqual(old);
  });
  it("a lost worker claim preserves the old generation without inserting replacement chunks", async () => {
    const { user, ws } = await setup(); await limits(10, 10000);
    const first = await source(user, ws.id, "aaaa"); await drain();
    const old = await chunks(first.id);
    await change(first.id, "bbbbb"); await reindexSource(db, ws.id, first.id);
    claimFence.afterAdmission = async id => {
      if (id === first.id) await db.update(schema.knowledgeSource).set({ lockedBy: "synthetic-replacement-owner" }).where(eq(schema.knowledgeSource.id, id));
    };
    await drain();
    expect(await chunks(first.id)).toEqual(old);
    expect(await status(first.id)).toMatchObject({ status: "indexing", generation: old[0]!.generation, lockedBy: "synthetic-replacement-owner" });
  });
  it("deletion while a worker waits for admission cannot recreate chunks", async () => {
    const { user, ws } = await setup(); await limits(10, 10000);
    const first = await source(user, ws.id, "aaaa"); await drain();
    await reindexSource(db, ws.id, first.id);
    claimFence.afterAdmission = async id => {
      if (id === first.id) await deleteSource(db, user, ws.id, id);
    };
    await drain();
    expect((await status(first.id)).deletedAt).not.toBeNull();
    expect(await chunks(first.id)).toHaveLength(0);
  });
});
