import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { completeSso, ssoProviderId } from "@/server/sso";
import { addMember, closeDb } from "./helpers";
import { makeVerifiedUser } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt } from "./federation-fixture";
import { blockedByObserver, connect, pauseAfter, routeTransactions } from "./pg-lock-helpers";

// Two real PostgreSQL connections (watches pg_blocking_pids for lock-ordering verification).
//
// Issue #108 (part 1 of #47): a user confirms their account deletion (`consumeAccountToken("delete")`) while their own
// SSO sign-in (`completeSso`, direct branch) is in flight. The SSO transaction share-locks the user row first and inserts
// its `audit_event` last; that insert key-share locks the `workspace` row. Deletion locks every workspace of the user
// `FOR UPDATE`, then deletes the user. When deletion took the workspaces before the user (the order before #45/PR #65:
// token row, workspaces, then the user through the delete), it held W and waited for the user, while the SSO transaction
// held the user and waited for W: PostgreSQL aborted one with 40P01. Deletion now locks the user row before the
// workspaces (docs/engineering/lock-order.md, "Workspace FOR UPDATE vs SSO audit insert").
//
// Each test runs both REAL production functions, one per dedicated connection, pauses the first right after its user-row
// lock, starts the second and observes it waiting at the user row through pg_blocking_pids. Waiting there it holds no
// workspace lock, so no cycle can form. Against the old deletion order the SSO-first case fails: deletion is seen
// waiting at `delete from "user"` holding W, and on release the SSO audit insert deadlocks with it.

afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => { mockTenantIdp(); });
afterAll(closeDb);

/** A verified viewer of an SSO workspace (whose owner stays), already linked to the workspace IdP identity, with a
 * pending SSO callback for that identity and an outstanding account-deletion token. */
async function fixture() {
  const { ws } = await configuredTenant();
  const user = await makeVerifiedUser("delete-sso");
  await addMember(ws.id, user.id, "viewer");
  await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
  const deleteToken = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId: user.id, tokenHash: sha256Hex(deleteToken), purpose: "delete", expiresAt: new Date(Date.now() + 60_000) });
  const attempt = await oidcAttempt(ws.slug, user.email);
  // The session the sign-in would create is made up front: its insert key-share locks the user row outside the routed
  // transactions, so it must not be the statement that waits.
  const ctx = await auth.$context;
  const unissued = await ctx.internalAdapter.createSession(user.id);
  vi.spyOn(ctx.internalAdapter, "createSession").mockResolvedValueOnce(unissued);
  return { ws, user, deleteToken, attempt, unissued };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Runs `first` until it holds the user row, then the other, and returns both settled outcomes. */
async function race(f: Fixture, first: "sso" | "delete") {
  const [ssoClient, deleteClient] = await Promise.all([connect(), connect()]);
  const routing = routeTransactions();
  const ssoDb = drizzle(ssoClient, { schema });
  const deleteDb = drizzle(deleteClient, { schema });
  const sso = { client: ssoClient, lock: /from "user"[\s\S]*for share/i, start: () => routing.run(ssoDb, () => completeSso(f.attempt)) };
  const deletion = { client: deleteClient, lock: /from "user"[\s\S]*for update/i, start: () => routing.run(deleteDb, () => consumeAccountToken("delete", f.deleteToken, undefined, f.user.id)) };
  const [holder, waiter] = first === "sso" ? [sso, deletion] : [deletion, sso];
  const pause = pauseAfter(holder.client, holder.lock);
  let holding: Promise<unknown> | undefined;
  let waiting: Promise<unknown> | undefined;
  try {
    const waiterPid = (await waiter.client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
    holding = holder.start();
    void holding.catch(() => {});
    await Promise.race([pause.reached, holding.then(() => { throw new Error("The first transaction finished without reaching the user lock"); })]);
    let finished = false;
    waiting = waiter.start().finally(() => { finished = true; });
    void waiting.catch(() => {});
    const wait = await blockedByObserver(holder.client, waiterPid, () => finished);
    // Queued at the user row itself, holding no workspace lock for the holder to run into.
    expect(wait.query).toMatch(waiter.lock);
    pause.resume();
    const [held, waited] = await Promise.allSettled([holding, waiting]);
    return first === "sso" ? { sso: held, deletion: waited } : { sso: waited, deletion: held };
  } finally {
    pause.resume();
    await Promise.allSettled([holding, waiting]);
    pause.restore();
    routing.restore();
    await Promise.all([ssoClient.end(), deleteClient.end()]);
  }
}

async function actions(f: Fixture) {
  const events = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, f.ws.id), eq(schema.auditEvent.targetId, f.user.id)));
  return events.map((e) => e.action).sort();
}

describe("account deletion confirmation vs the user's own SSO sign-in in flight", () => {
  it("SSO holding the user row, deletion queued behind it: both commit, no deadlock", async () => {
    const f = await fixture();
    const { sso, deletion } = await race(f, "sso");
    expect(sso).toMatchObject({ status: "fulfilled", value: { sessionToken: f.unissued.token, slug: f.ws.slug } });
    expect(deletion).toEqual({ status: "fulfilled", value: "done" });
    expect(await db.select().from(schema.user).where(eq(schema.user.id, f.user.id))).toHaveLength(0);
    expect(await actions(f)).toEqual(["account.deleted", "sso.signin"]);
  });

  it("deletion holding the user row, SSO queued behind it: the account is deleted and the sign-in refused, no deadlock", async () => {
    const f = await fixture();
    const { sso, deletion } = await race(f, "delete");
    expect(deletion).toEqual({ status: "fulfilled", value: "done" });
    expect(sso).toMatchObject({ status: "rejected", reason: { status: 403, code: "SSO_LINK_INVALID" } });
    expect(await db.select().from(schema.user).where(eq(schema.user.id, f.user.id))).toHaveLength(0);
    expect(await db.select().from(schema.session).where(eq(schema.session.token, f.unissued.token))).toHaveLength(0);
    expect(await actions(f)).toEqual(["account.deleted"]);
  });
});
