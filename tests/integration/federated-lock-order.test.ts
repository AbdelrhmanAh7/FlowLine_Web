import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { sha256Hex } from "@/server/crypto";
import { completeFederatedChallenge, hasSessionMfa } from "@/server/federated-mfa";
import { completeSso, ssoProviderId } from "@/server/sso";
import { confirmSsoLink } from "@/server/sso-link";
import { totpCodeFor, totpStep } from "@/server/totp";
import { addMember, closeDb } from "./helpers";
import { assuredSessionFor, enrolTotp, makeVerifiedUser } from "./platform-helpers";
import { configuredTenant, ISSUER, mockTenantIdp, oidcAttempt, oidcSignIn, proveSsoMailbox } from "./federation-fixture";
import { blockedByObserver, connect, pauseAfter } from "./pg-lock-helpers";

// Written for CI (two real PostgreSQL connections); NOT executed locally.
//
// Issue #37: `confirmSsoLink` locked the initiating session before the user row while `completeFederatedChallenge`
// locked the user row before that session, so the two could deadlock for one user sharing a session. Both now lock the
// user and then the sessions (src/server/federated-locks.ts; rule in docs/security/FEDERATED_MFA.md, "Lock order").
//
// Each test runs the REAL production functions, one per dedicated connection, and forces the interleaving that used to
// deadlock: the first transaction is paused right after the lock statement that was its FIRST lock under the old order
// (link: its session row; challenge: the user row). The second transaction is then started and observed waiting through
// pg_blocking_pids. Old order, link first: the challenge held the user row and waited at the session row the link
// needed next. Old order, challenge first: the link held the session row and waited at the user row, and the challenge
// then asked for that session on resume. Either way PostgreSQL aborted one with 40P01 after `deadlock_timeout`. With the
// shared order the waiter has taken only its own pending row and waits at the user row, so both transactions finish.

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

/** The codes below belong to three consecutive 30 s steps and the verifier accepts the previous, current and next one.
 * Starting early in a step keeps the whole test inside it; this is boundary avoidance, not a wait for a lock. */
async function startEarlyInStep() {
  const into = Date.now() % 30_000;
  if (into > 20_000) await new Promise((resolve) => setTimeout(resolve, 30_000 - into + 250));
}

/** One user with a live, MFA-assured session `S`, who is already bound to the workspace IdP identity. Holds both
 *  - a pending SSO link proposal for that same identity (confirming it is a no-op write, so the competing challenge's
 *    account fingerprint cannot change), and
 *  - a pending workspace challenge whose initiator is `S`,
 * which is exactly the pair of transactions that share the session row. */
async function sharedSessionFixture() {
  const { ws } = await configuredTenant();
  const user = await makeVerifiedUser("lock-order");
  const secret = await enrolTotp(user.id);
  await addMember(ws.id, user.id, "viewer");
  await startEarlyInStep();
  const at = Date.now();
  const session = await assuredSessionFor(user, secret, at - 30_000); // the federated gate has consumed the PREVIOUS step
  const proposal = await oidcSignIn(ws.slug, user.email, session);
  expect(proposal.linkRequired).toBeTruthy();
  await proveSsoMailbox(proposal.linkRequired!, session);
  await db.insert(schema.account).values({ id: randomUUID(), userId: user.id, providerId: ssoProviderId(ws.id, ISSUER, "test-client"), accountId: "attacker-subject" });
  const started = await completeSso(await oidcAttempt(ws.slug, user.email, session));
  expect(started.mfaRequired).toBeTruthy();
  // The unissued session the challenge would create is made up front, so the challenge never waits on the user row
  // (the session insert takes a key-share lock on it) before its own transaction.
  const ctx = await auth.$context;
  const unissued = await ctx.internalAdapter.createSession(user.id);
  vi.spyOn(ctx.internalAdapter, "createSession").mockResolvedValueOnce(unissued);
  // Whichever transaction commits first uses the lower step; the replay marker then requires the second to use the next.
  return { ws, user, session, linkToken: proposal.linkRequired!, challengeToken: started.mfaRequired!, unissued, codes: [totpCodeFor(secret, at), totpCodeFor(secret, at + 30_000)] as const, at };
}

for (const first of ["link", "challenge"] as const) {
  describe(`link confirmation and federated challenge completion for one user sharing a session (${first} holds its locks first)`, () => {
    it("finishes both transactions without a deadlock, the second waiting at the user row", async () => {
      const f = await sharedSessionFixture();
      const linkClient = await connect();
      const challengeClient = await connect();
      const routing = routeTransactions();
      const linkDb = drizzle(linkClient, { schema });
      const challengeDb = drizzle(challengeClient, { schema });
      const pid = async (client: typeof linkClient) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      const [linkCode, challengeCode] = first === "link" ? [f.codes[0], f.codes[1]] : [f.codes[1], f.codes[0]];
      const startLink = () => routing.run(linkDb, () => confirmSsoLink(f.linkToken, f.session.token, { code: linkCode }));
      const startChallenge = () => routing.run(challengeDb, () => completeFederatedChallenge(f.challengeToken, challengeCode));
      // Pause after the statement that used to be that path's first lock on the shared pair: the session for the link,
      // the user row for the challenge.
      const holder = first === "link"
        ? { client: linkClient, pause: pauseAfter(linkClient, /from "session"[\s\S]*for update/i), start: startLink }
        : { client: challengeClient, pause: pauseAfter(challengeClient, /from "user"[\s\S]*for update/i), start: startChallenge };
      const waiter = first === "link" ? { client: challengeClient, start: startChallenge } : { client: linkClient, start: startLink };
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
        // The waiter has taken only its own pending row and is queued at the user row: it holds nothing the holder still
        // needs, so no cycle can form. (Old order, link first: the challenge's wait was at the session lock instead, and
        // old order, challenge first: the deadlock surfaces below, when the paused challenge resumes.)
        expect(wait.query).toMatch(/from "user"/i);
        expect(wait.query).toMatch(/for update/i);
        holder.pause.resume();
        const results = await Promise.all([holding, waiting]);
        const [linked, challenged] = first === "link" ? results : [results[1], results[0]];
        expect(linked).toEqual({ slug: f.ws.slug });
        expect(challenged).toMatchObject({ next: `/w/${f.ws.slug}/flows`, session: { token: f.unissued.token } });
      } finally {
        holder.pause.resume();
        await Promise.allSettled([holding, waiting]);
        holder.pause.restore();
        routing.restore();
        await Promise.all([linkClient.end(), challengeClient.end()]);
      }
      // Both committed: the proposal and the pending challenge are consumed, the challenge's session carries its assurance
      // proof, both audit records exist, and the replay marker ends at the SECOND (later) step.
      expect(await db.select().from(schema.verification).where(eq(schema.verification.identifier, `sso-link:${sha256Hex(f.linkToken)}`))).toHaveLength(0);
      expect(await db.select().from(schema.verification).where(eq(schema.verification.identifier, `federated-mfa:${sha256Hex(f.challengeToken)}`))).toHaveLength(0);
      expect(await hasSessionMfa(f.unissued.token, f.user.id)).toBe(true);
      const actions = (await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.workspaceId, f.ws.id), eq(schema.auditEvent.targetId, f.user.id)))).map((e) => e.action);
      expect(actions.filter((a) => a === "sso.link_confirmed")).toHaveLength(1);
      expect(actions.filter((a) => a === "sso.signin")).toHaveLength(1);
      const [marker] = await db.select().from(schema.verification).where(eq(schema.verification.id, `totp-step:${f.user.id}`));
      expect(Number(marker!.value)).toBe(totpStep(f.at + 30_000));
    });
  });
}
