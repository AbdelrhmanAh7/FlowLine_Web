import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => holder.headers, cookies: async () => ({ get: () => undefined }) }));
import { db, schema } from "@/db";
import { POST as uploadPOST } from "@/app/api/workspaces/[wid]/files/route";
import { auth } from "@/lib/auth";
import type { CompanyBlueprint } from "@/company-builder/model";
import { addSource, deleteSource } from "@/server/knowledge";
import { insertRetainedFile } from "@/server/retained-files";
import { ssoSessionCookie } from "@/server/sso";
import { createWorkspace } from "@/server/workspaces";
import { approveBlueprint, generateDeterministic } from "@/server/company-builder/blueprints";
import { install } from "@/server/company-builder/install";
import { answer, createSession } from "@/server/company-builder/sessions";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

const owned: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const id of owned.splice(0)) await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
});
afterAll(closeDb);
async function setup() {
  const user = await makeUser("storage-owner");
  const ws = await createWorkspace(user, unique("Storage"));
  owned.push(ws.id);
  await as(user);
  return { user, ws };
}
async function as(user: { id: string }) {
  const session = await (await auth.$context).internalAdapter.createSession(user.id);
  const cookie = await ssoSessionCookie(session.token);
  holder.headers = new Headers({ cookie: `${cookie.name}=${cookie.value}` });
}
async function limits(workspace: number, installation: number) {
  const [stored] = await db.select({ total: sql<string>`coalesce(sum(octet_length(${schema.fileObject.data})), 0)::text` }).from(schema.fileObject);
  vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", String(workspace));
  vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES", String(BigInt(stored!.total) + BigInt(installation)));
}
const files = (workspaceId: string) => db.select().from(schema.fileObject).where(eq(schema.fileObject.workspaceId, workspaceId));
const source = (user: Awaited<ReturnType<typeof makeUser>>, workspaceId: string, text: string) => addSource(db, user, workspaceId, { name: "retained.txt", mime: "text/plain", kind: "text", bytes: Buffer.from(text) });
async function upload(workspaceId: string, text: string) {
  const body = new FormData();
  body.append("file", new File([text], "upload.txt", { type: "text/plain" }));
  return uploadPOST(new Request(`http://localhost:3100/api/workspaces/${workspaceId}/files`, { method: "POST", body }), { params: Promise.resolve({ wid: workspaceId }) });
}

describe("atomic retained upload admission", () => {
  it("concurrent knowledge and file-route uploads share the workspace budget", async () => {
    const { user, ws } = await setup();
    await limits(6, 1024);
    const outcomes = await Promise.allSettled([upload(ws.id, "1234"), source(user, ws.id, "5678")]);
    const statuses = outcomes.map(result => result.status === "rejected" ? result.reason.status : result.value instanceof Response ? result.value.status : 201);
    expect(statuses.sort()).toEqual([201, 413]);
    const denied = outcomes.find(result => result.status === "rejected" || (result.value instanceof Response && result.value.status === 413))!;
    const code = denied.status === "rejected" ? denied.reason.code : ((await (denied.value as Response).json()).error.code);
    expect(code).toBe("UPLOAD_WORKSPACE_STORAGE_LIMIT");
    const stored = await files(ws.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.data.length).toBe(4);
  });

  it("simultaneous uploads in different workspaces share the installation budget", async () => {
    const a = await setup();
    const b = await setup();
    await limits(100, 6);
    const outcomes = await Promise.allSettled([source(a.user, a.ws.id, "1234"), upload(b.ws.id, "5678")]);
    expect(outcomes.map(r => r.status === "rejected" ? r.reason.status : r.value instanceof Response ? r.value.status : 201).sort()).toEqual([201, 413]);
    const denied = outcomes.find(r => r.status === "rejected" || (r.value instanceof Response && r.value.status === 413))!;
    expect(denied.status === "rejected" ? denied.reason.code : (await (denied.value as Response).json()).error.code).toBe("UPLOAD_INSTALLATION_STORAGE_LIMIT");
    expect((await files(a.ws.id)).length + (await files(b.ws.id)).length).toBe(1);
  });

  it("deleting a retained knowledge source frees capacity for another upload", async () => {
    const { user, ws } = await setup();
    await limits(6, 1024);
    const first = await source(user, ws.id, "123456");
    await expectHttpError(source(user, ws.id, "x"), 413, "UPLOAD_WORKSPACE_STORAGE_LIMIT");
    await deleteSource(db, user, ws.id, first.id);
    expect(await files(ws.id)).toHaveLength(0);
    expect((await upload(ws.id, "abcdef")).status).toBe(201);
    expect((await files(ws.id))[0]!.data.length).toBe(6);
  });

  it("counts actual retained bytes even when legacy size metadata understates them", async () => {
    const { user, ws } = await setup();
    await limits(6, 1024);
    await db.insert(schema.fileObject).values({ workspaceId: ws.id, name: "legacy", mime: "text/plain", size: 0, sha256: "synthetic", data: Buffer.from("1234"), createdBy: user.id });
    await expectHttpError(source(user, ws.id, "abc"), 413, "UPLOAD_WORKSPACE_STORAGE_LIMIT");
    expect(await files(ws.id)).toHaveLength(1);
  });

  it("rollbacks leave no reservation; invalid configuration fails closed", async () => {
    const { user, ws } = await setup();
    await limits(4, 1024);
    await expect(db.transaction(async tx => {
      await insertRetainedFile(tx, { workspaceId: ws.id, name: "rolled back", mime: "text/plain", data: Buffer.from("1234"), createdBy: user.id });
      throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect((await upload(ws.id, "1234")).status).toBe(201);
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", "0");
    expect((await upload(ws.id, "x")).status).toBe(503);
    expect(await files(ws.id)).toHaveLength(1);
  });

  it("keeps non-member uploads at 404 before revealing storage state", async () => {
    const { user, ws } = await setup();
    await limits(1, 1024);
    await source(user, ws.id, "a");
    await as(await makeUser("storage-outsider"));
    expect((await upload(ws.id, "x")).status).toBe(404);
    expect(await files(ws.id)).toHaveLength(1);
  });

  it("Company Builder knowledge fixtures use the same budget and roll back their failed step", async () => {
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
    await limits(1, 1024);
    await expectHttpError(install(user, ws.id, blueprint.id, { locale: "en" }), 413, "UPLOAD_WORKSPACE_STORAGE_LIMIT");
    expect(await files(ws.id)).toHaveLength(0);
    expect(await db.select().from(schema.knowledgeSource).where(eq(schema.knowledgeSource.workspaceId, ws.id))).toHaveLength(0);
    const [installation] = await db.select().from(schema.cbInstallation).where(and(eq(schema.cbInstallation.workspaceId, ws.id), eq(schema.cbInstallation.blueprintId, blueprint.id)));
    expect(installation).toMatchObject({ status: "failed", error: { code: "UPLOAD_WORKSPACE_STORAGE_LIMIT" } });
    expect((await db.execute(sql`select count(*)::int as n from ${schema.cbInstalledItem} where ${schema.cbInstalledItem.installationId} = ${installation!.id} and ${schema.cbInstalledItem.kind} = 'knowledge'`)).rows[0]!.n).toBe(0);
  });
});
