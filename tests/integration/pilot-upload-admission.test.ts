import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { consumeAccountToken } from "@/server/email/flows";
import { sha256Hex } from "@/server/crypto";
import { createFlow, softDeleteFlow } from "@/server/flows";
import { approveBlueprint, generateDeterministic } from "@/server/company-builder/blueprints";
import { install } from "@/server/company-builder/install";
import { answer, createSession } from "@/server/company-builder/sessions";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

const owned: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  const ids = owned.splice(0);
  try {
    await assertCounters(ids);
  } finally {
    for (const id of ids) await db.delete(schema.workspace).where(eq(schema.workspace.id, id));
  }
  await assertCounters(ids);
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
async function assertCounters(workspaceIds: string[]) {
  const [total] = await db.select({ bytes: sql<string>`coalesce(sum(octet_length(${schema.fileObject.data})), 0)::text`, count: sql<string>`count(*)::text` }).from(schema.fileObject);
  const [installation] = await db.select().from(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, "installation"));
  expect(installation).toMatchObject({ totalBytes: BigInt(total!.bytes), fileCount: BigInt(total!.count) });
  for (const id of workspaceIds) {
    const stored = await files(id);
    const [counter] = await db.select().from(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, id));
    const [workspace] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, id));
    if (!workspace) expect(counter).toBeUndefined();
    else if (stored.length || counter) expect(counter).toMatchObject({ totalBytes: BigInt(stored.reduce((n, f) => n + f.data.length, 0)), fileCount: BigInt(stored.length) });
  }
}
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

  it("many concurrent admissions cannot exceed workspace or installation capacity", async () => {
    const a = await setup();
    const b = await setup();
    await limits(6, 10);
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => {
      const { user, ws } = i % 2 ? a : b;
      return db.transaction(tx => insertRetainedFile(tx, { workspaceId: ws.id, name: "race", mime: "text/plain", data: Buffer.from("12"), createdBy: user.id }));
    }));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(5);
    for (const outcome of outcomes) if (outcome.status === "rejected") {
      expect(outcome.reason.status).toBe(413);
      expect(["UPLOAD_WORKSPACE_STORAGE_LIMIT", "UPLOAD_INSTALLATION_STORAGE_LIMIT"]).toContain(outcome.reason.code);
    }
    const aFiles = await files(a.ws.id);
    const bFiles = await files(b.ws.id);
    expect(aFiles.length + bFiles.length).toBe(5);
    expect(aFiles.length * 2).toBeLessThanOrEqual(6);
    expect(bFiles.length * 2).toBeLessThanOrEqual(6);
    await assertCounters([a.ws.id, b.ws.id]);
  });

  it("direct inserts, byte changes, workspace moves and deletes maintain counters in their transaction", async () => {
    const a = await setup();
    const b = await setup();
    const [file] = await db.insert(schema.fileObject).values({ workspaceId: a.ws.id, name: "direct", mime: "text/plain", size: 0, sha256: "synthetic", data: Buffer.from("1234"), createdBy: a.user.id }).returning();
    await assertCounters([a.ws.id, b.ws.id]);
    await db.update(schema.fileObject).set({ data: Buffer.from("123456"), workspaceId: b.ws.id }).where(eq(schema.fileObject.id, file!.id));
    await assertCounters([a.ws.id, b.ws.id]);
    await expect(db.transaction(async tx => {
      await tx.delete(schema.fileObject).where(eq(schema.fileObject.id, file!.id));
      const [counter] = await tx.select().from(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, b.ws.id));
      expect(counter).toMatchObject({ totalBytes: 0n, fileCount: 0n });
      throw new Error("synthetic delete rollback");
    })).rejects.toThrow("synthetic delete rollback");
    expect(await files(b.ws.id)).toHaveLength(1);
    await assertCounters([a.ws.id, b.ws.id]);
    await db.delete(schema.fileObject).where(eq(schema.fileObject.id, file!.id));
    await assertCounters([a.ws.id, b.ws.id]);
  });

  it("workspace cascades free only that workspace's capacity and remove its counter", async () => {
    const a = await setup();
    const b = await setup();
    await limits(100, 1024);
    await source(a.user, a.ws.id, "1234");
    await source(a.user, a.ws.id, "56");
    await source(b.user, b.ws.id, "789");
    await assertCounters([a.ws.id, b.ws.id]);
    await db.transaction(async tx => {
      await tx.delete(schema.workspace).where(eq(schema.workspace.id, a.ws.id));
      expect(await tx.select().from(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, a.ws.id))).toHaveLength(0);
      expect(await tx.select().from(schema.fileObject).where(eq(schema.fileObject.workspaceId, a.ws.id))).toHaveLength(0);
    });
    expect(await files(b.ws.id)).toHaveLength(1);
    await assertCounters([a.ws.id, b.ws.id]);
  });

  it("account deletion's sole-member workspace cascade maintains installation totals", async () => {
    const a = await setup();
    const b = await setup();
    await limits(100, 1024);
    await source(a.user, a.ws.id, "1234");
    await source(b.user, b.ws.id, "5678");
    const token = randomBytes(32).toString("base64url");
    await db.insert(schema.emailToken).values({ userId: a.user.id, tokenHash: sha256Hex(token), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
    expect(await consumeAccountToken("delete", token, undefined, a.user.id)).toBe("done");
    expect(await files(a.ws.id)).toHaveLength(0);
    expect(await files(b.ws.id)).toHaveLength(1);
    await assertCounters([a.ws.id, b.ws.id]);
  });

  it("flow deletion and a creator user deletion leave retained bytes accounted for", async () => {
    const { user, ws } = await setup();
    await limits(100, 1024);
    await source(user, ws.id, "1234");
    const flow = await createFlow(user, ws.id, { name: "Retained references" });
    await softDeleteFlow(flow!.id);
    await assertCounters([ws.id]);
    await db.delete(schema.flow).where(eq(schema.flow.id, flow!.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
    expect(await files(ws.id)).toMatchObject([{ createdBy: null }]);
    await assertCounters([ws.id]);
  });

  it("fails closed if the installation counter is missing", async () => {
    const { user, ws } = await setup();
    await expect(db.transaction(async tx => {
      await tx.delete(schema.retainedFileCounter).where(eq(schema.retainedFileCounter.scope, "installation"));
      await insertRetainedFile(tx, { workspaceId: ws.id, name: "missing counter", mime: "text/plain", data: Buffer.from("x"), createdBy: user.id });
    })).rejects.toMatchObject({ status: 503, code: "UPLOAD_STORAGE_CONFIG" });
    expect(await files(ws.id)).toHaveLength(0);
  });

  it("backfills actual bytes/counts atomically and recovers from a backfill failure", async () => {
    // Replay the generated migration against isolated pre-migration fixtures.
    // Only its explicit public.workspace FK is redirected to the fixture schema.
    const name = `retained_backfill_${randomUUID().replaceAll("-", "")}`;
    const migration = readFileSync(new URL("../../drizzle/0024_warm_loki.sql", import.meta.url), "utf8")
      .replace('"public"."workspace"', `"${name}"."workspace"`).split("--> statement-breakpoint");
    await db.transaction(async tx => {
      await tx.execute(sql.raw(`CREATE SCHEMA "${name}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${name}"`));
      await tx.execute(sql`CREATE TABLE workspace (id uuid PRIMARY KEY)`);
      await tx.execute(sql`CREATE TABLE file_object (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE, data bytea NOT NULL, size integer NOT NULL)`);
      const a = randomUUID();
      const b = randomUUID();
      await tx.execute(sql`INSERT INTO workspace VALUES (${a}), (${b})`);
      await tx.execute(sql`INSERT INTO file_object VALUES (${randomUUID()}, ${a}, ${Buffer.from("1234")}, 0), (${randomUUID()}, ${a}, ${Buffer.alloc(0)}, 900), (${randomUUID()}, ${b}, ${Buffer.from("56")}, 1)`);
      await expect(tx.transaction(async savepoint => {
        // Fail immediately after backfill, before the trigger is installed.
        for (const statement of migration.slice(0, 4)) await savepoint.execute(sql.raw(statement));
        await savepoint.execute(sql`UPDATE retained_file_counter SET total_bytes = -1 WHERE scope = 'installation'`);
      })).rejects.toThrow();
      expect((await tx.execute(sql`SELECT to_regclass('retained_file_counter') AS table_name`)).rows[0]!.table_name).toBeNull();
      for (const statement of migration) await tx.execute(sql.raw(statement));
      const counters = (await tx.execute(sql`SELECT scope, total_bytes::text AS bytes, file_count::text AS count FROM retained_file_counter ORDER BY scope`)).rows;
      expect(counters).toEqual([
        { scope: a, bytes: "4", count: "2" }, { scope: b, bytes: "2", count: "1" }, { scope: "installation", bytes: "6", count: "3" },
      ].sort((x, y) => x.scope.localeCompare(y.scope)));
      await tx.execute(sql`DELETE FROM workspace WHERE id = ${a}`);
      expect((await tx.execute(sql`SELECT total_bytes::text AS bytes, file_count::text AS count FROM retained_file_counter WHERE scope = 'installation'`)).rows).toEqual([{ bytes: "2", count: "1" }]);
      await tx.execute(sql.raw(`DROP SCHEMA "${name}" CASCADE`));
    });
  });
});
