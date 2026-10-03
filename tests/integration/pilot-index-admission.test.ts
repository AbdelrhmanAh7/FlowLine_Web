import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => holder.headers, cookies: async () => ({ get: () => undefined }) }));
import { db, schema } from "@/db";
import { POST } from "@/app/api/workspaces/[wid]/knowledge/route";
import { PATCH } from "@/app/api/workspaces/[wid]/knowledge/[sid]/route";
import type { CompanyBlueprint } from "@/company-builder/model";
import { approveBlueprint, generateDeterministic } from "@/server/company-builder/blueprints";
import { install } from "@/server/company-builder/install";
import { answer, createSession } from "@/server/company-builder/sessions";
import { auth } from "@/lib/auth";
import { addSource, deleteSource, indexNextSource, reindexSource } from "@/server/knowledge";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

const owned: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const id of owned.splice(0)) await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
});
afterAll(closeDb);
async function as(user: { id: string }) {
  const session = await (await auth.$context).internalAdapter.createSession(user.id);
  const cookie = await ssoSessionCookie(session.token);
  holder.headers = new Headers({ cookie: `${cookie.name}=${cookie.value}` });
}
async function setup() {
  const user = await makeUser("index-owner");
  const ws = await createWorkspace(user, unique("Index admission"));
  owned.push(ws.id);
  await as(user);
  return { user, ws };
}
async function limits(workspace: number, installation: number) {
  const queued = await db.execute<{ n: string }>(sql`select count(*)::text as n from knowledge_source where deleted_at is null and status in ('pending', 'indexing')`);
  vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", String(workspace));
  vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_QUEUED", String(BigInt(queued.rows[0]!.n) + BigInt(installation)));
}
const source = (user: Awaited<ReturnType<typeof makeUser>>, wid: string, name = "queued.txt") => addSource(db, user, wid, { name, mime: "text/plain", kind: "text", bytes: Buffer.from("Synthetic searchable queue admission content") });
const rows = (wid: string) => db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.workspaceId, wid));
const files = (wid: string) => db.select().from(schema.fileObject).where(eq(schema.fileObject.workspaceId, wid));
const post = (wid: string) => POST(new Request(`http://localhost:3100/api/workspaces/${wid}/knowledge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "API text", text: "synthetic queue input" }) }), { params: Promise.resolve({ wid }) });

describe("atomic knowledge queue admission", () => {
  it("simultaneous API and service additions admit exactly one slot and roll back the denied file", async () => {
    const { user, ws } = await setup();
    await limits(1, 100);
    const outcomes = await Promise.allSettled([source(user, ws.id), post(ws.id)]);
    expect(outcomes.map(r => r.status === "rejected" ? r.reason.status : r.value instanceof Response ? r.value.status : 201).sort()).toEqual([201, 429]);
    const denied = outcomes.find(r => r.status === "rejected" || r.value instanceof Response && r.value.status === 429)!;
    expect(denied.status === "rejected" ? denied.reason.code : (await (denied.value as Response).json()).error.code).toBe("KNOWLEDGE_WORKSPACE_QUEUE_LIMIT");
    expect(await rows(ws.id)).toHaveLength(1);
    expect(await files(ws.id)).toHaveLength(1);
  });
  it("installation admission serializes different workspaces", async () => {
    const a = await setup(); const b = await setup();
    await limits(10, 1);
    const outcomes = await Promise.allSettled([source(a.user, a.ws.id), source(b.user, b.ws.id)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const denied = outcomes.find(r => r.status === "rejected")! as PromiseRejectedResult;
    expect(denied.reason).toMatchObject({ status: 429, code: "KNOWLEDGE_INSTALLATION_QUEUE_LIMIT" });
    expect((await rows(a.ws.id)).length + (await rows(b.ws.id)).length).toBe(1);
    expect((await files(a.ws.id)).length + (await files(b.ws.id)).length).toBe(1);
  });
  it("real worker completion frees a slot, and reindexing a ready source must readmit", async () => {
    const { user, ws } = await setup(); await limits(1, 100);
    const first = await source(user, ws.id);
    while (await indexNextSource(db, unique("queue-index"))) { /* isolated synthetic database */ }
    expect((await rows(ws.id))[0]!.status).toBe("ready");
    const second = await source(user, ws.id);
    await expectHttpError(reindexSource(db, ws.id, first.id), 429, "KNOWLEDGE_WORKSPACE_QUEUE_LIMIT");
    expect((await rows(ws.id)).find(s => s.id === first.id)!.status).toBe("ready");
    await deleteSource(db, user, ws.id, second.id);
    expect((await reindexSource(db, ws.id, first.id)).status).toBe("pending");
  });
  it("reindexing an already queued or indexing source does not count itself twice", async () => {
    const { user, ws } = await setup(); await limits(1, 100);
    const first = await source(user, ws.id);
    expect((await reindexSource(db, ws.id, first.id)).status).toBe("pending");
    await db.update(schema.knowledgeSource).set({ status: "indexing", lockedBy: "synthetic-old-claim" }).where(eq(schema.knowledgeSource.id, first.id));
    const reset = await reindexSource(db, ws.id, first.id);
    expect(reset.status).toBe("pending");
    expect(await rows(ws.id)).toHaveLength(1);
    expect((await rows(ws.id))[0]!.lockedBy).toBeNull();
    await expectHttpError(source(user, ws.id), 429, "KNOWLEDGE_WORKSPACE_QUEUE_LIMIT");
  });
  it("concurrent reindex of two ready sources consumes at most one pending slot", async () => {
    const { user, ws } = await setup();
    const a = await source(user, ws.id); const b = await source(user, ws.id);
    await db.update(schema.knowledgeSource).set({ status: "ready" }).where(eq(schema.knowledgeSource.workspaceId, ws.id));
    await limits(1, 100);
    const outcomes = await Promise.allSettled([reindexSource(db, ws.id, a.id), reindexSource(db, ws.id, b.id)]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((outcomes.find(r => r.status === "rejected")! as PromiseRejectedResult).reason.code).toBe("KNOWLEDGE_WORKSPACE_QUEUE_LIMIT");
    expect((await rows(ws.id)).filter(s => s.status === "pending")).toHaveLength(1);
  });
  it("invalid limits fail closed without retaining a file; failed sources free their slot", async () => {
    const { user, ws } = await setup(); await limits(1, 100);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", "0");
    await expectHttpError(source(user, ws.id), 503, "KNOWLEDGE_QUEUE_CONFIG");
    expect(await files(ws.id)).toHaveLength(0);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", "1");
    const first = await source(user, ws.id);
    await db.update(schema.knowledgeSource).set({ status: "failed" }).where(eq(schema.knowledgeSource.id, first.id));
    expect((await source(user, ws.id)).status).toBe("pending");
  });
  it("nonmembers and deleted sources remain 404 before quota disclosure or reactivation", async () => {
    const { user, ws } = await setup(); await limits(1, 100);
    const first = await source(user, ws.id);
    await as(await makeUser("index-outsider"));
    expect((await post(ws.id)).status).toBe(404);
    const req = new Request("http://localhost:3100/knowledge", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reindex: true }) });
    expect((await PATCH(req, { params: Promise.resolve({ wid: ws.id, sid: first.id }) })).status).toBe(404);
    await deleteSource(db, user, ws.id, first.id);
    await expectHttpError(reindexSource(db, ws.id, first.id), 404, "NOT_FOUND");
    expect((await source(user, ws.id)).status).toBe("pending");
  });
  it("Company Builder fixtures share queue admission and roll back the denied step", async () => {
    const { user, ws } = await setup();
    const session = await createSession(user, ws.id);
    for (const [questionId, value] of [
      ["offering", "Office cleaning requests arrive by email"], ["first_outcome", "customer"], ["situation", "improve"],
      ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_details", ["service", "date", "phone"]],
      ["team", "small"], ["tools", ["gmail"]], ["cust_next", "reply"], ["cust_services", "office cleaning"],
      ["cust_info", "Approved policy information that is longer than one byte."], ["other_areas", ["finance"]],
    ] as [string, unknown][]) {
      const [row] = await db.select().from(schema.cbSession).where(eq(schema.cbSession.id, session.id));
      await answer(ws.id, session.id, { questionId, value, unknown: false, revision: row!.revision });
    }
    const { row: blueprint } = await generateDeterministic(user, ws.id, session.id, "en");
    await approveBlueprint(user, ws.id, blueprint.id);
    // The current planner installs workflows only. Model an existing approved agent
    // fixture to exercise the retained-file branch without enabling a new product feature.
    const fixture = blueprint.body as CompanyBlueprint;
    await db.update(schema.cbBlueprint).set({ body: { ...fixture, tasks: fixture.tasks.map(task => ({ ...task, kind: "agent" as const, availability: "operational" as const })) } }).where(eq(schema.cbBlueprint.id, blueprint.id));
    const occupied = await source(user, ws.id);
    await limits(1, 100);
    await expectHttpError(install(user, ws.id, blueprint.id, { locale: "en" }), 429, "KNOWLEDGE_WORKSPACE_QUEUE_LIMIT");
    expect(await files(ws.id)).toHaveLength(1);
    expect((await rows(ws.id)).map(s => s.id)).toEqual([occupied.id]);
    const [installation] = await db.select().from(schema.cbInstallation).where(and(eq(schema.cbInstallation.workspaceId, ws.id), eq(schema.cbInstallation.blueprintId, blueprint.id)));
    expect(installation).toMatchObject({ status: "failed", error: { code: "KNOWLEDGE_WORKSPACE_QUEUE_LIMIT" } });
    expect((await db.execute(sql`select count(*)::int as n from ${schema.cbInstalledItem} where ${schema.cbInstalledItem.installationId} = ${installation!.id} and ${schema.cbInstalledItem.kind} = 'knowledge'`)).rows[0]!.n).toBe(0);
  });
});
