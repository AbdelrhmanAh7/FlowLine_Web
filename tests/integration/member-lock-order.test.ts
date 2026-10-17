import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Client } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/server/access";
import { changeRole, removeMember } from "@/server/members";
import { completeSso, ssoProviderId } from "@/server/sso";
import { confirmSsoLink } from "@/server/sso-link";
import { addMember, closeDb } from "./helpers";
import { makeVerifiedUser, sessionFor } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt, oidcSignIn, proveSsoMailbox } from "./federation-fixture";
import { blockedByObserver, connect, pauseAfter } from "./pg-lock-helpers";

// Written for CI (two real PostgreSQL connections); NOT executed locally.
//
// Issue #42: `changeRole` and `removeMember` locked the `workspace` row FOR UPDATE and then updated or deleted the member
// row. The SSO transactions (`completeSso` direct sign-in, `confirmSsoLink`, `completeFederatedChallenge`) hold that
// member row (FOR SHARE, or FOR UPDATE in the link confirmation) and then insert an `audit_event` row, whose foreign
// key takes FOR KEY SHARE on the `workspace` row. FOR UPDATE conflicts with FOR KEY SHARE, so the membership change
// waited for the SSO transaction's member row while that transaction waited for the workspace row, and PostgreSQL
// aborted one of them with 40P01 after `deadlock_timeout`. The workspace lock is now FOR NO KEY UPDATE: it still
// serializes membership changes (it conflicts with itself and with FOR UPDATE) but does not conflict with FOR KEY SHARE.
// Rule: docs/security/FEDERATED_MFA.md, "Lock order" > "Member changes".
//
// Each test runs the REAL production functions, one per dedicated connection, and forces the interleaving that
// deadlocked: the SSO transaction is paused right AFTER it locked the member row, the membership change is then started
// and observed waiting at the member row through pg_blocking_pids (so it already holds its workspace lock), and then the
// SSO transaction resumes and inserts its audit row. Old lock: the resumed insert waits for the workspace row and the
// 40P01 abort fails one of the two promises. New lock: the insert goes through, the SSO transaction commits and the
// membership change finishes. The federated challenge completion holds the same member lock mode (FOR SHARE) as the
// direct sign-in and is not driven separately here.

afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => { mockTenantIdp(); });
afterAll(closeDb);

type TransactionRunner = Pick<typeof db, "transaction">;

/** Routes every `db.transaction` made inside `run(target, fn)` to that connection (and only those), so two production
 * functions can run at once, each on its own PostgreSQL connection, without a test hook in production code. */
function routeTransactions() {
  const route = new AsyncLocalStorage<TransactionRunner>();
  const original = db.transaction.bind(db);
  const spy = vi.spyOn(db, "transaction").mockImplementation(((callback: never, config?: never) => {
    const target = route.getStore();
    return target ? target.transaction(callback, config) : original(callback, config);
  }) as never);
  return { run: <T>(target: TransactionRunner, work: () => Promise<T>) => route.run(target, work), restore: () => spy.mockRestore() };
}

const pidOf = async (client: Client) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;

/** A tenant whose workspace owner is the actor of the membership change, and a viewer who is a member, has a verified
 * mailbox and (for the sign-in) is already bound to the workspace IdP identity. */
async function tenantWithMember() {
  const { owner, ws } = await configuredTenant();
  const member = await makeVerifiedUser("member-lock");
  await addMember(ws.id, member.id, "viewer");
  return { owner, ws, member };
}

/** The SSO side. Each case names the member-lock statement it pauses after, and the audit action it must finish with. */
const SSO_PATHS = {
  // completeSso, no local MFA: user FOR SHARE, sessions FOR SHARE, sso_config FOR UPDATE, member FOR SHARE, ..., audit insert.
  "direct sign-in (member FOR SHARE)": {
    memberLock: /from "workspace_member"[\s\S]*for share/i,
    action: "sso.signin",
    async prepare() {
      const t = await tenantWithMember();
      await db.insert(schema.account).values({ id: randomUUID(), userId: t.member.id, providerId: ssoProviderId(t.ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
      const attempt = await oidcAttempt(t.ws.slug, t.member.email);
      return { ...t, run: async () => { const result = await completeSso(attempt); expect(result.sessionToken).toBeTruthy(); } };
    },
  },
  // confirmSsoLink: pending row, user FOR UPDATE, session FOR UPDATE, factor/credential, sso_config FOR UPDATE, member FOR UPDATE, advisory lock, ..., audit insert.
  "link confirmation (member FOR UPDATE)": {
    memberLock: /from "workspace_member"[\s\S]*for update/i,
    action: "sso.link_confirmed",
    async prepare() {
      const t = await tenantWithMember();
      const session = await sessionFor(t.member);
      const proposal = await oidcSignIn(t.ws.slug, t.member.email, session);
      expect(proposal.linkRequired).toBeTruthy();
      await proveSsoMailbox(proposal.linkRequired!, session);
      return { ...t, run: async () => { expect(await confirmSsoLink(proposal.linkRequired!, session.token, {})).toEqual({ slug: t.ws.slug }); } };
    },
  },
} as const;

const CHANGES = {
  "role change": {
    waitingAt: /update "workspace_member"/i,
    action: "member.role_changed",
    start: (owner: CurrentUser, workspaceId: string, userId: string): Promise<unknown> => changeRole(owner, workspaceId, userId, "editor"),
    async expectApplied(workspaceId: string, userId: string) {
      const [m] = await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
      expect(m?.role).toBe("editor");
    },
  },
  "removal": {
    waitingAt: /delete from "workspace_member"/i,
    action: "member.removed",
    start: (owner: CurrentUser, workspaceId: string, userId: string): Promise<unknown> => removeMember(owner, workspaceId, userId),
    async expectApplied(workspaceId: string, userId: string) {
      expect(await db.select().from(schema.workspaceMember).where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)))).toHaveLength(0);
    },
  },
} as const;

for (const [ssoName, sso] of Object.entries(SSO_PATHS)) {
  for (const [changeName, change] of Object.entries(CHANGES)) {
    describe(`SSO ${ssoName} against a member ${changeName} of the same member`, () => {
      it("finishes both transactions without a deadlock, the membership change waiting at the member row", async () => {
        const f = await sso.prepare();
        const ssoClient = await connect();
        const changeClient = await connect();
        const routing = routeTransactions();
        const ssoDb = drizzle(ssoClient, { schema });
        const changeDb = drizzle(changeClient, { schema });
        // Pause only after the SSO transaction took its member lock (it holds it while paused).
        const pause = pauseAfter(ssoClient, sso.memberLock);
        let ssoRun: Promise<unknown> | undefined;
        let changeRun: Promise<unknown> | undefined;
        try {
          const changePid = await pidOf(changeClient);
          ssoRun = routing.run(ssoDb, f.run);
          void ssoRun.catch(() => {}); // observed below even if a barrier assertion fails first
          await Promise.race([pause.reached, ssoRun.then(() => { throw new Error("The SSO transaction finished without reaching its member-lock barrier"); })]);
          let finished = false;
          changeRun = routing.run(changeDb, () => change.start(f.owner, f.ws.id, f.member.id)).finally(() => { finished = true; });
          void changeRun.catch(() => {});
          // The membership change has taken its workspace lock (its first statement) and queues at the member row the
          // SSO transaction holds: this is the state in which the old FOR UPDATE workspace lock blocked the audit insert.
          const wait = await blockedByObserver(ssoClient, changePid, () => finished);
          expect(wait.query).toMatch(change.waitingAt);
          pause.resume();
          // Old lock: the SSO audit insert now waits for the workspace row and PostgreSQL aborts one side with 40P01.
          await Promise.all([ssoRun, changeRun]);
        } finally {
          pause.resume();
          await Promise.allSettled([ssoRun, changeRun]);
          pause.restore();
          routing.restore();
          await Promise.all([ssoClient.end(), changeClient.end()]);
        }
        await change.expectApplied(f.ws.id, f.member.id);
        const actions = (await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, f.ws.id), eq(schema.auditEvent.targetId, f.member.id)))).map((e) => e.action);
        expect(actions.filter((a) => a === sso.action)).toHaveLength(1);
        expect(actions.filter((a) => a === change.action)).toHaveLength(1);
      });
    });
  }
}

describe("membership changes still serialize per workspace", () => {
  it("a second membership change waits for the first one's workspace lock and then runs", async () => {
    const { owner, ws, member } = await tenantWithMember();
    const other = await makeVerifiedUser("member-lock-second");
    await addMember(ws.id, other.id, "viewer");
    const first = await connect();
    const second = await connect();
    const routing = routeTransactions();
    const firstDb = drizzle(first, { schema });
    const secondDb = drizzle(second, { schema });
    // Pause the first change right after its workspace lock, then require the second to be blocked BY it.
    const pause = pauseAfter(first, /from "workspace"[\s\S]*for no key update/i);
    let firstRun: Promise<unknown> | undefined;
    let secondRun: Promise<unknown> | undefined;
    try {
      const secondPid = await pidOf(second);
      firstRun = routing.run(firstDb, () => changeRole(owner, ws.id, member.id, "editor"));
      void firstRun.catch(() => {});
      await Promise.race([pause.reached, firstRun.then(() => { throw new Error("The first change finished without reaching its workspace-lock barrier"); })]);
      let finished = false;
      secondRun = routing.run(secondDb, () => removeMember(owner, ws.id, other.id)).finally(() => { finished = true; });
      void secondRun.catch(() => {});
      const wait = await blockedByObserver(first, secondPid, () => finished);
      expect(wait.query).toMatch(/from "workspace"/i);
      expect(wait.query).toMatch(/for no key update/i);
      pause.resume();
      await Promise.all([firstRun, secondRun]);
    } finally {
      pause.resume();
      await Promise.allSettled([firstRun, secondRun]);
      pause.restore();
      routing.restore();
      await Promise.all([first.end(), second.end()]);
    }
    const members = await db.select().from(schema.workspaceMember).where(eq(schema.workspaceMember.workspaceId, ws.id));
    expect(members.find((m) => m.userId === member.id)?.role).toBe("editor");
    expect(members.find((m) => m.userId === other.id)).toBeUndefined();
  });
});
