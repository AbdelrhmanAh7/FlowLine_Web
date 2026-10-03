import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { addSource, deleteSource } from "@/server/knowledge";
import { insertRetainedFile, lockRetainedFileAccounting } from "@/server/retained-files";
import { createWorkspace } from "@/server/workspaces";
import { closeDb, makeUser, unique } from "./helpers";

const owned: string[] = [];
beforeEach(() => {
  vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", "9007199254740991");
  vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES", "9007199254740991");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db.transaction(async tx => {
    await lockRetainedFileAccounting(tx);
    for (const id of owned.splice(0)) await tx.delete(schema.workspace).where(eq(schema.workspace.id, id));
  });
});
afterAll(closeDb);

async function setup() {
  const user = await makeUser("accounting-lock");
  const workspace = await createWorkspace(user, unique("Accounting"));
  owned.push(workspace.id);
  const source = await addSource(db, user, workspace.id, { name: "lock.txt", mime: "text/plain", kind: "text", bytes: Buffer.from("1234") });
  return { user, workspace, source };
}

async function deleteToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId, tokenHash: sha256Hex(token), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
  return token;
}

async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
  await client.connect();
  return client;
}

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

/** Pause only AFTER the real lock-taking SQL finishes. No production test hook. */
function pauseAfter(client: Client, pattern: RegExp) {
  const reached = barrier();
  const resume = barrier();
  const original = client.query;
  let paused = false;
  client.query = new Proxy(original, {
    apply(target, receiver, args) {
      const result = Reflect.apply(target, receiver, args);
      const text = typeof args[0] === "string" ? args[0] : args[0].text;
      if (!paused && pattern.test(text)) {
        paused = true;
        return Promise.resolve(result).then(async rows => {
          reached.release();
          await resume.promise;
          return rows;
        });
      }
      return result;
    },
  });
  return { reached: reached.promise, resume: resume.release, restore: () => { client.query = original; } };
}

/** Observe an actual PostgreSQL wait, not elapsed time as evidence of blocking. */
async function blockedByObserver(observer: Client, waiterPid: number, finished: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (finished()) throw new Error("Competing writer completed before the lock barrier was released");
    await observer.query("select pg_stat_clear_snapshot()");
    const { rows } = await observer.query<{ query: string; wait_event_type: string }>(
      "select query, wait_event_type from pg_stat_activity where pid = $1 and pg_backend_pid() = any(pg_blocking_pids(pid))", [waiterPid],
    );
    if (rows[0]?.wait_event_type === "Lock") return rows[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Competing writer did not block on the expected connection");
}

async function assertCounters() {
  // Compare all scopes, including empty surviving workspaces and the singleton.
  const result = await db.execute(sql`
    with actual as (
      select 'installation' as scope, coalesce(sum(octet_length(data)), 0)::bigint as bytes, count(*) as files from file_object
      union all
      select workspace_id::text, sum(octet_length(data))::bigint, count(*) from file_object group by workspace_id
    )
    select coalesce(a.scope, c.scope) as scope from actual a
    full join retained_file_counter c on c.scope = a.scope
    where c.scope is null or c.total_bytes <> coalesce(a.bytes, 0) or c.file_count <> coalesce(a.files, 0)
  `);
  expect(result.rows).toEqual([]);
}

describe("retained accounting lock order", () => {
  it("account deletion locks W, admission waits at accounting, then both commit without a deadlock", async () => {
    const departing = await setup();
    const surviving = await setup();
    // Deletion locks both W rows, deletes the sole-member W (firing counters),
    // and retains the shared W so the waiting upload has a valid FK after commit.
    await db.insert(schema.workspaceMember).values({ workspaceId: surviving.workspace.id, userId: departing.user.id, role: "editor" });
    const token = await deleteToken(departing.user.id);
    const deleter = await connect();
    const uploader = await connect();
    const deletionDb = drizzle(deleter, { schema });
    const uploadDb = drizzle(uploader, { schema });
    const pause = pauseAfter(deleter, /from "workspace"[\s\S]*for update/i);
    const transaction = vi.spyOn(db, "transaction").mockImplementationOnce(deletionDb.transaction.bind(deletionDb));
    let deleting: Promise<unknown> | undefined;
    let uploading: Promise<unknown> | undefined;
    try {
      const pid = (await uploader.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      deleting = consumeAccountToken("delete", token, undefined, departing.user.id);
      await Promise.race([pause.reached, deleting.then(() => { throw new Error("Deletion completed without reaching the workspace barrier"); })]);
      let finished = false;
      uploading = uploadDb.transaction(tx => insertRetainedFile(tx, { workspaceId: surviving.workspace.id, createdBy: surviving.user.id, name: "after-delete", mime: "text/plain", data: Buffer.from("12") }))
        .finally(() => { finished = true; });
      void uploading.catch(() => {}); // Observe rejection below, even if the barrier assertion fails.
      const wait = await blockedByObserver(deleter, pid, () => finished);
      expect(wait.query).toContain("pg_advisory_xact_lock");
      pause.resume();
      await expect(deleting).resolves.toBe("done");
      await expect(uploading).resolves.toMatchObject({ size: 2 });
      expect(await db.select().from(schema.workspace).where(eq(schema.workspace.id, departing.workspace.id))).toHaveLength(0);
      expect(await db.select().from(schema.fileObject).where(eq(schema.fileObject.workspaceId, surviving.workspace.id))).toHaveLength(2);
      await assertCounters();
    } finally {
      pause.resume();
      await Promise.allSettled([deleting, uploading]);
      pause.restore();
      transaction.mockRestore();
      await Promise.all([deleter.end(), uploader.end()]);
    }
  });

  it("source deletion takes accounting before its source lock, so account cascades wait safely", async () => {
    const { user, workspace, source } = await setup();
    const token = await deleteToken(user.id);
    const sourceClient = await connect();
    const accountClient = await connect();
    const sourceDb = drizzle(sourceClient, { schema });
    const accountDb = drizzle(accountClient, { schema });
    const pause = pauseAfter(sourceClient, /update "knowledge_source" set/i);
    const transaction = vi.spyOn(db, "transaction")
      .mockImplementationOnce(sourceDb.transaction.bind(sourceDb))
      .mockImplementationOnce(accountDb.transaction.bind(accountDb));
    let deletingSource: Promise<unknown> | undefined;
    let deletingAccount: Promise<unknown> | undefined;
    try {
      const pid = (await accountClient.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      deletingSource = deleteSource(db, user, workspace.id, source.id);
      await Promise.race([pause.reached, deletingSource.then(() => { throw new Error("Source deletion missed its barrier"); })]);
      let finished = false;
      deletingAccount = consumeAccountToken("delete", token, undefined, user.id).finally(() => { finished = true; });
      void deletingAccount.catch(() => {});
      const wait = await blockedByObserver(sourceClient, pid, () => finished);
      expect(wait.query).toContain("pg_advisory_xact_lock");
      pause.resume();
      await expect(deletingSource).resolves.toBeUndefined();
      await expect(deletingAccount).resolves.toBe("done");
      await assertCounters();
    } finally {
      pause.resume();
      await Promise.allSettled([deletingSource, deletingAccount]);
      pause.restore();
      transaction.mockRestore();
      await Promise.all([sourceClient.end(), accountClient.end()]);
    }
  });
});

it("migration blocks a competing committed insert between backfill and trigger installation", async () => {
  const name = `retained_live_${randomUUID().replaceAll("-", "")}`;
  const migration = readFileSync(new URL("../../drizzle/0024_warm_loki.sql", import.meta.url), "utf8")
    .replace('"public"."workspace"', `"${name}"."workspace"`).split("--> statement-breakpoint");
  const backfill = migration.findIndex(statement => statement.includes('INSERT INTO "retained_file_counter"'));
  expect(backfill).toBeGreaterThan(0);
  const migrator = await connect();
  const writer = await connect();
  let inserting: Promise<unknown> | undefined;
  try {
    // Fixtures are COMMITTED and visible to both connections before migration.
    await migrator.query("begin");
    await migrator.query(`create schema "${name}"`);
    await migrator.query(`set local search_path to "${name}"`);
    await migrator.query("create table workspace (id uuid primary key)");
    await migrator.query("create table file_object (id uuid primary key, workspace_id uuid not null references workspace(id) on delete cascade, data bytea not null, size integer not null)");
    const workspaceId = randomUUID();
    await migrator.query("insert into workspace values ($1)", [workspaceId]);
    await migrator.query("insert into file_object values ($1, $2, $3, 0)", [randomUUID(), workspaceId, Buffer.from("1234")]);
    await migrator.query("commit");

    await writer.query("begin");
    await writer.query(`set local search_path to "${name}"`);
    expect((await writer.query("select count(*)::int as n from file_object")).rows[0]!.n).toBe(1);
    const pid = (await writer.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
    await migrator.query("begin");
    await migrator.query(`set local search_path to "${name}"`);
    for (const statement of migration.slice(0, backfill + 1)) await migrator.query(statement);
    expect((await migrator.query("select count(*)::int as n from pg_trigger where tgrelid = 'file_object'::regclass and tgname = 'retained_file_counter_change'")).rows[0]!.n).toBe(0);

    let finished = false;
    inserting = (async () => {
      await writer.query("insert into file_object values ($1, $2, $3, 0)", [randomUUID(), workspaceId, Buffer.from("56")]);
      await writer.query("commit");
    })().finally(() => { finished = true; });
    void inserting.catch(() => {});
    const wait = await blockedByObserver(migrator, pid, () => finished);
    expect(wait.query).toContain("insert into file_object");

    // Release the barrier only after installing the real migration's trigger.
    for (const statement of migration.slice(backfill + 1)) await migrator.query(statement);
    await migrator.query("commit");
    await inserting;
    const { rows } = await writer.query(`
      select c.scope, c.total_bytes::text as bytes, c.file_count::text as files,
        (select coalesce(sum(octet_length(f.data)), 0)::text from "${name}".file_object f) as actual_bytes,
        (select count(*)::text from "${name}".file_object) as actual_files
      from "${name}".retained_file_counter c order by scope`);
    expect(rows).toEqual([
      { scope: workspaceId, bytes: "6", files: "2", actual_bytes: "6", actual_files: "2" },
      { scope: "installation", bytes: "6", files: "2", actual_bytes: "6", actual_files: "2" },
    ].sort((a, b) => a.scope.localeCompare(b.scope)));
  } finally {
    await migrator.query("rollback"); // Also releases locks if any barrier assertion failed.
    await Promise.allSettled([inserting]);
    await writer.query("rollback");
    await migrator.query(`drop schema if exists "${name}" cascade`);
    await Promise.all([migrator.end(), writer.end()]);
  }
});
