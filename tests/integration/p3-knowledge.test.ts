import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { stopSandbox } from "@/engine/sandbox";
import { addSource, deleteSource, indexNextSource, listSources, reindexSource, searchKnowledge, setEnabled } from "@/server/knowledge";
import { createWorkspace } from "@/server/workspaces";
import { makePdf } from "../fixtures/pdf";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

afterAll(async () => {
  stopSandbox();
  await closeDb();
});

async function setup(name: string) {
  const user = await makeUser("kn");
  const ws = await createWorkspace(user, unique(name));
  return { user, ws };
}
async function indexAll() {
  while (await indexNextSource(db, unique("idx"))) {
    /* drain */
  }
}
const status = async (id: string) => (await db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.id, id)))[0]!;

describe("knowledge sources", () => {
  it("indexes text, Markdown, CSV (row-aware), JSON and PDF; retrieval returns source, chunk, citation and score", async () => {
    const { user, ws } = await setup("Kn");
    const policy = await addSource(db, user, ws.id, { name: "Refund policy", kind: "text", mime: "text/plain", bytes: Buffer.from("Refunds are available within 30 days of purchase.\n\nEnterprise customers get a dedicated account manager.") });
    const md = await addSource(db, user, ws.id, { name: "handbook.md", kind: "file", mime: "text/markdown", bytes: Buffer.from("# On-call\n\nThe on-call rotation changes every Monday at 09:00 Cairo time.") });
    const csv = await addSource(db, user, ws.id, { name: "kpis.csv", kind: "file", mime: "text/csv", bytes: Buffer.from("week,revenue,signups\n2026-09-14,1200,31\n2026-09-21,1410,44\n") });
    const js = await addSource(db, user, ws.id, { name: "faq.json", kind: "file", mime: "application/json", bytes: Buffer.from(JSON.stringify([{ q: "Do you support SSO?", a: "SSO via OIDC is available on request." }])) });
    const pdf = await addSource(db, user, ws.id, { name: "contract.pdf", kind: "file", mime: "application/pdf", bytes: makePdf(["Master Services Agreement", "Termination requires ninety days written notice."]) });
    expect(policy.status).toBe("pending");
    await indexAll();
    for (const s of [policy, md, csv, js, pdf]) expect((await status(s.id)).status).toBe("ready");
    expect((await status(csv.id)).chunkCount).toBe(2);
    expect((await status(csv.id)).kind).toBe("table");

    const refund = await searchKnowledge(db, ws.id, "How many days do I have for a refund?");
    expect(refund[0]).toMatchObject({ sourceId: policy.id, sourceName: "Refund policy" });
    expect(refund[0]!.text).toContain("30 days");
    expect(refund[0]!.score).toBeGreaterThan(0);
    expect(refund[0]!.label).toMatch(/^Refund policy · part \d+$/);
    const row = await searchKnowledge(db, ws.id, "signups for week 2026-09-21");
    expect(row[0]).toMatchObject({ sourceId: csv.id, label: "kpis.csv · row 2" });
    expect((await searchKnowledge(db, ws.id, "termination notice"))[0]).toMatchObject({ sourceId: pdf.id });
    expect((await searchKnowledge(db, ws.id, "OIDC single sign-on"))[0]).toMatchObject({ sourceId: js.id });
    expect((await searchKnowledge(db, ws.id, "on-call rotation"))[0]).toMatchObject({ sourceId: md.id });
  });

  it("bad content fails indexing with a reason; unsupported and empty uploads are refused up front", async () => {
    const { user, ws } = await setup("KnFail");
    const bad = await addSource(db, user, ws.id, { name: "broken.json", kind: "file", mime: "application/json", bytes: Buffer.from("{not json") });
    const scanned = await addSource(db, user, ws.id, { name: "scan.pdf", kind: "file", mime: "application/pdf", bytes: makePdf([]) });
    await indexAll();
    expect(await status(bad.id)).toMatchObject({ status: "failed", error: "The JSON file is not valid JSON" });
    expect((await status(scanned.id)).status).toBe("failed");
    expect((await status(scanned.id)).error).toMatch(/No (text|indexable text)/);
    await expectHttpError(addSource(db, user, ws.id, { name: "evil.exe", kind: "file", mime: "application/octet-stream", bytes: Buffer.from("MZ\x90\x00") }), 415, "UNSUPPORTED_TYPE");
    await expectHttpError(addSource(db, user, ws.id, { name: "fake.pdf", kind: "file", mime: "application/pdf", bytes: Buffer.from("not really a pdf") }), 415, "UNSUPPORTED_TYPE");
    await expectHttpError(addSource(db, user, ws.id, { name: "e.txt", kind: "file", mime: "text/plain", bytes: Buffer.alloc(0) }), 400, "EMPTY_SOURCE");
    await expectHttpError(addSource(db, user, ws.id, { name: "big.txt", kind: "file", mime: "text/plain", bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 97) }), 413, "SOURCE_TOO_LARGE");
  });

  it("delete, disable and the agent allow-list take effect immediately; other workspaces never see the content; re-index rebuilds", async () => {
    const a = await setup("KnA");
    const b = await setup("KnB");
    const s1 = await addSource(db, a.user, a.ws.id, { name: "secret plan", kind: "text", mime: "text/plain", bytes: Buffer.from("Project Nightingale launches in November.") });
    const s2 = await addSource(db, a.user, a.ws.id, { name: "public note", kind: "text", mime: "text/plain", bytes: Buffer.from("Nightingale is also a bird.") });
    await indexAll();
    expect(await searchKnowledge(db, b.ws.id, "Nightingale")).toEqual([]); // tenant isolation
    expect((await searchKnowledge(db, a.ws.id, "Nightingale")).map((h) => h.sourceId).sort()).toEqual([s1.id, s2.id].sort());
    expect((await searchKnowledge(db, a.ws.id, "Nightingale", { allowedSourceIds: [s2.id] })).map((h) => h.sourceId)).toEqual([s2.id]);
    expect(await searchKnowledge(db, a.ws.id, "Nightingale", { allowedSourceIds: [] })).toEqual([]);

    await setEnabled(db, a.user, a.ws.id, s1.id, false);
    expect((await searchKnowledge(db, a.ws.id, "Nightingale")).map((h) => h.sourceId)).toEqual([s2.id]);
    await setEnabled(db, a.user, a.ws.id, s1.id, true);

    await reindexSource(db, a.ws.id, s1.id);
    expect((await status(s1.id)).status).toBe("pending");
    await indexAll();
    const after = await status(s1.id);
    expect(after.status).toBe("ready");
    const chunks = await db.select().from(schema.knowledgeChunk).where(eq(schema.knowledgeChunk.sourceId, s1.id));
    expect(new Set(chunks.map((c) => c.generation))).toEqual(new Set([after.generation])); // old generation dropped

    await deleteSource(db, a.user, a.ws.id, s1.id);
    expect((await searchKnowledge(db, a.ws.id, "Nightingale November")).map((h) => h.sourceId)).toEqual([s2.id]);
    expect((await listSources(db, a.ws.id)).map((s) => s.id)).toEqual([s2.id]);
    await expectHttpError(deleteSource(db, b.user, b.ws.id, s2.id), 404); // another workspace can't touch it
  });
});
