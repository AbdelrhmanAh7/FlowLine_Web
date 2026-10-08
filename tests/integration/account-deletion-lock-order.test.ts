import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { HttpError } from "@/server/http";
import { completeSso, ssoProviderId } from "@/server/sso";
import { createFlow } from "@/server/flows";
import { enqueueRun } from "@/server/runs";
import { createWorkspace } from "@/server/workspaces";
import { addMember, closeDb, makeUser, unique } from "./helpers";
import { makeVerifiedUser } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt } from "./federation-fixture";
import { blockedByObserver, connect, pauseAfter } from "./pg-lock-helpers";

// Written for CI (two real PostgreSQL connections); NOT executed locally.
//
// Issue #47: `consumeAccountToken("delete")` locked the user's workspaces FOR UPDATE, wrote its audit rows and only
// then deleted the user row. A workspace SSO sign-in of the same user locks the user row first and inserts its own
// `sso.signin` audit row last, which takes a key-share lock on the workspace row. Each held what the other needed next,
// so one of them was aborted with 40P01. Deletion now locks the user row FOR UPDATE before any workspace row (the
// user-before-workspace order in docs/security/FEDERATED_MFA.md, "Lock order"); the workspace locks stay FOR UPDATE
// because sole-member workspaces are deleted with the account (tests/integration/retained-file-locking.test.ts).
//
// Each test runs the REAL production functions, one per dedicated connection, pauses the first one right after a lock
// it holds, observes the second waiting through pg_blocking_pids and then requires both to finish without a deadlock.

afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => { mockTenantIdp(); });
afterAll(closeDb);

type TransactionRunner = Pick<typeof db, "transaction">;

/** Routes every `db.transaction` made inside `run(target, fn)` to that connection (same technique as
 * federated-lock-order.test.ts), so two production functions run at once without a test hook in production code. */
function routeTransactions() {
  const route = new AsyncLocalStorage<TransactionRunner>();
  const original = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementation(((callback: never, config?: never) => {
    const target = route.getStore();
    return target ? target.transaction(callback, config) : original(callback, config);
  }) as never);
  return { run: <T>(target: TransactionRunner, work: () => Promise<T>) => route.run(target, work), restore: () => spy.mockRestore() };
}

/** A verified user (no TOTP, so the SSO callback takes the direct sign-in branch) who is a viewer of a workspace with
 * SSO configured and already linked to its IdP, owns a sole-member workspace, and holds a valid account-deletion token. */
async function fixture() {
  const { ws } = await configuredTenant();
  const user = await makeVerifiedUser("delete-during-sso");
  await addMember(ws.id, user.id, "viewer");
  const solo = await createWorkspace(user, unique("Solo"));
  const subject = `subject-${randomUUID()}`;
  await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: subject });
  const attempt = await oidcAttempt(ws.slug, user.email, undefined, subject);
  // The unissued session the sign-in would create is made up front: its insert takes a key-share lock on the user row
  // outside the transaction, and the test observes the transaction's own user-row wait instead.
  const ctx = await auth.$context;
  const unissued = await ctx.internalAdapter.createSession(user.id);
  vi.spyOn(ctx.internalAdapter, "createSession").mockResolvedValueOnce(unissued);
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId: user.id, tokenHash: sha256Hex(token), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
  return { ws, solo, user, attempt, unissued, token };
}

async function auditActions(workspaceId: string, userId: string) {
  return (await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, workspaceId), eq(schema.auditEvent.targetId, userId)))).map((e) => e.action);
}

for (const first of ["sso", "deletion"] as const) {
  describe(`account deletion and the user's own workspace SSO sign-in (${first} holds its locks first)`, () => {
    it(`@issue-47 ${first === "sso" ? "AC1" : "AC2"}: finishes both without a deadlock, the second waiting at the user row`, async () => {
      const f = await fixture();
      const ssoClient = await connect();
      const deleteClient = await connect();
      const routing = routeTransactions();
      const ssoDb = drizzle(ssoClient, { schema });
      const deleteDb = drizzle(deleteClient, { schema });
      const pid = async (client: typeof ssoClient) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      const startSso = () => routing.run(ssoDb, () => completeSso(f.attempt));
      const startDeletion = () => routing.run(deleteDb, () => consumeAccountToken("delete", f.token, undefined, f.user.id));
      // SSO first: pause right after it locked the user row. Deletion first: pause right after it locked the workspaces,
      // the point where it used to hold the workspace rows WITHOUT the user row.
      const holder = first === "sso"
        ? { client: ssoClient, pause: pauseAfter(ssoClient, /from "user"[\s\S]*for share/i), start: startSso }
        : { client: deleteClient, pause: pauseAfter(deleteClient, /from "workspace"[\s\S]*for update/i), start: startDeletion };
      const waiter = first === "sso" ? { client: deleteClient, start: startDeletion } : { client: ssoClient, start: startSso };
      let holding: Promise<unknown> | undefined;
      let waiting: Promise<unknown> | undefined;
      try {
        const waiterPid = await pid(waiter.client);
        holding = holder.start();
        void holding.catch(() => {}); // observed below even if a barrier assertion fails first
        await Promise.race([holder.pause.reached, holding.then(() => { throw new Error("The first transaction finished without reaching its lock barrier"); })]);
        let finished = false;
        waiting = waiter.start().finally(() => { finished = true; });
        void waiting.catch(() => {});
        const wait = await blockedByObserver(holder.client, waiterPid, () => finished);
        // The waiter holds nothing the holder still needs. Old order, SSO first: deletion locked the workspace and
        // waited at `delete from "user"`; deletion first: SSO waited at its audit insert (workspace key-share). Either
        // way the resumed holder then needed the waiter's lock and PostgreSQL aborted one with 40P01.
        expect(wait.query).toMatch(/^select[\s\S]*from "user"[\s\S]*for (no key update|update|share)/i);
        holder.pause.resume();
        const [sso, deletion] = await Promise.allSettled(first === "sso" ? [holding, waiting] : [waiting, holding]);
        expect(deletion).toEqual({ status: "fulfilled", value: "done" });
        if (first === "sso") {
          expect(sso).toMatchObject({ status: "fulfilled", value: { sessionToken: f.unissued.token } });
        } else {
          // The sign-in found its user gone: an ordinary refusal, never a deadlock abort.
          expect(sso.status).toBe("rejected");
          const reason = (sso as PromiseRejectedResult).reason;
          expect(reason).toBeInstanceOf(HttpError);
          expect(reason).toMatchObject({ status: 403, code: "SSO_LINK_INVALID" });
        }
      } finally {
        holder.pause.resume();
        await Promise.allSettled([holding, waiting]);
        holder.pause.restore();
        routing.restore();
        await Promise.all([ssoClient.end(), deleteClient.end()]);
      }
      // The account, its sessions and its sole-member workspace are gone; the shared workspace keeps its deletion audit
      // record, plus the sign-in record when the sign-in committed first.
      expect(await db.select().from(schema.user).where(eq(schema.user.id, f.user.id))).toHaveLength(0);
      expect(await db.select().from(schema.session).where(eq(schema.session.userId, f.user.id))).toHaveLength(0);
      expect(await db.select().from(schema.workspace).where(eq(schema.workspace.id, f.solo.id))).toHaveLength(0);
      expect(await db.select().from(schema.workspace).where(eq(schema.workspace.id, f.ws.id))).toHaveLength(1);
      const actions = await auditActions(f.ws.id, f.user.id);
      expect(actions.filter((a) => a === "account.deleted")).toHaveLength(1);
      expect(actions.filter((a) => a === "sso.signin")).toHaveLength(first === "sso" ? 1 : 0);
    });
  });
}

// The user-row lock must not create a new cycle with the user's ordinary work. enqueueRun (like startAgentRun) locks
// the workspace FOR UPDATE and then inserts rows whose created_by references the user, i.e. a key-share lock on the
// user row. A deletion holding the user row FOR UPDATE while waiting for that workspace deadlocked with it, so deletion
// takes the user row FOR NO KEY UPDATE: it still excludes the SSO paths' FOR SHARE / FOR UPDATE, not key-share.

/** A shared workspace (owned by someone else, so it survives) with a runnable flow, the user as its editor, a
 * sole-member workspace of the user and a valid account-deletion token. */
async function runFixture() {
  const owner = await makeUser("delete-run-owner");
  const ws = await createWorkspace(owner, unique("Shared runs"));
  const flow = await createFlow(owner, ws.id, { templateId: "lead-qualifier", name: unique("Runnable") });
  const user = await makeUser("delete-during-run");
  await addMember(ws.id, user.id, "editor");
  const solo = await createWorkspace(user, unique("Solo"));
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId: user.id, tokenHash: sha256Hex(token), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
  return { ws, flow, solo, user, token };
}

for (const first of ["run", "deletion"] as const) {
  describe(`account deletion and the user's own run enqueue (${first} holds its locks first)`, () => {
    it(`@issue-47 ${first === "run" ? "AC5" : "AC6"}: finishes both without a deadlock`, async () => {
      const f = await runFixture();
      const runClient = await connect();
      const deleteClient = await connect();
      const routing = routeTransactions();
      const runDb = drizzle(runClient, { schema });
      const deleteDb = drizzle(deleteClient, { schema });
      const pid = async (client: typeof runClient) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      let runDone = false;
      const startRun = () => routing.run(runDb, () => enqueueRun(f.user, f.flow.id)).finally(() => { runDone = true; });
      const startDeletion = () => routing.run(deleteDb, () => consumeAccountToken("delete", f.token, undefined, f.user.id));
      // Run first: pause right after it locked the workspace. Deletion first: pause right after it locked the user row.
      const pause = first === "run"
        ? pauseAfter(runClient, /from "workspace"[\s\S]*for update/i)
        : pauseAfter(deleteClient, /from "user"[\s\S]*for no key update/i);
      const holder = first === "run" ? { client: runClient, start: startRun } : { client: deleteClient, start: startDeletion };
      const waiter = first === "run" ? { client: deleteClient, start: startDeletion } : { client: runClient, start: startRun };
      let holding: Promise<unknown> | undefined;
      let waiting: Promise<unknown> | undefined;
      try {
        const waiterPid = await pid(waiter.client);
        holding = holder.start();
        void holding.catch(() => {});
        await Promise.race([pause.reached, holding.then(() => { throw new Error("The first transaction finished without reaching its lock barrier"); })]);
        let finished = false;
        waiting = waiter.start().finally(() => { finished = true; });
        void waiting.catch(() => {});
        if (first === "run") {
          // Deletion waits for the workspace the run holds, holding only its user row, which the run's inserts can share.
          const wait = await blockedByObserver(holder.client, waiterPid, () => finished);
          expect(wait.query).toMatch(/^select[\s\S]*from "workspace"[\s\S]*for update/i);
        } else {
          // The run must not wait for the deletion's user-row lock at all (it did under FOR UPDATE, while holding the
          // workspace the paused deletion locks next: a deadlock once resumed).
          const probe = blockedByObserver(holder.client, waiterPid, () => finished).then((w) => w.query, () => null);
          const blockedAt = await Promise.race([waiting.then(() => null), probe]);
          expect(blockedAt).toBeNull();
          await probe;
          expect(runDone).toBe(true);
        }
        pause.resume();
        const [run, deletion] = await Promise.allSettled(first === "run" ? [holding, waiting] : [waiting, holding]);
        expect(deletion).toEqual({ status: "fulfilled", value: "done" });
        expect(run).toMatchObject({ status: "fulfilled", value: { flowId: f.flow.id, status: "queued" } });
      } finally {
        pause.resume();
        await Promise.allSettled([holding, waiting]);
        pause.restore();
        routing.restore();
        await Promise.all([runClient.end(), deleteClient.end()]);
      }
      // The run survives in the shared workspace without its creator; the account and its sole workspace are gone.
      const runs = await db.select().from(schema.run).where(eq(schema.run.flowId, f.flow.id));
      expect(runs).toHaveLength(1);
      expect(runs[0]!.createdBy).toBeNull();
      expect(await db.select().from(schema.user).where(eq(schema.user.id, f.user.id))).toHaveLength(0);
      expect(await db.select().from(schema.workspace).where(eq(schema.workspace.id, f.solo.id))).toHaveLength(0);
      expect((await auditActions(f.ws.id, f.user.id)).filter((a) => a === "account.deleted")).toHaveLength(1);
    });
  });
}
