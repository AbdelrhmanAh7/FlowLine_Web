import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken, tokenState } from "@/server/email/flows";
import { closeDb, makeUser } from "./helpers";

// Written for CI (two real PostgreSQL connections); NOT executed locally.
//
// Issue #41: `consumeAccountToken("reset", ...)` updated the credential account, deleted the user's sessions, and only
// then updated the user row (account, session, user). The federated authority transactions (link confirmation,
// challenge completion, SSO callbacks) lock the user row first, then the sessions, then the user's accounts, so a
// password reset and one of those for the same user could each hold the row the other needed next, and PostgreSQL
// aborted one of them with 40P01 after `deadlock_timeout`. Reset now takes the user row first. Rule and rationale:
// docs/security/FEDERATED_MFA.md ("Password-reset recovery lock order").
//
// The REAL reset runs on one dedicated connection against a second connection that takes the three row classes the
// two transactions share in the documented federated order (user FOR UPDATE, session FOR UPDATE, account FOR SHARE).
// Raw SQL stands in for the federated side on purpose: it pins the documented protocol, so this test says the same
// thing whether or not the federated functions have been moved to that order yet. The interleaving that used to
// deadlock is forced with barriers, in both directions, and every wait is observed through pg_blocking_pids:
//   - reset holds its first lock on the shared rows, the other transaction must queue at the USER row. (Old order: the
//     reset had updated the credential account, the other transaction took user and session and then waited at that
//     account; on resume the reset's session delete waited at the other's session lock. Deadlock.)
//   - the other transaction holds user and session, the reset must queue at the USER row. (Old order: the reset took
//     the credential account first and waited at the session row; on resume the other waited at that account. Deadlock.)
// With the shared order the one that arrives second holds nothing the first still needs, so both commit.

afterEach(() => { vi.restoreAllMocks(); });
afterAll(closeDb);

const NEW_PASSWORD = "reset-lock-order-1";

/** A user with a credential account, a never-approved tenant identity (removed by recovery), a live session and a reset token. */
async function fixture() {
  const user = await makeUser("reset-lock");
  await db.insert(schema.account).values({ id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: "old-hash" });
  await db.insert(schema.account).values({ id: randomUUID(), accountId: "tenant-subject", providerId: `sso:legacy-${randomUUID()}`, userId: user.id });
  await db.insert(schema.session).values({ id: randomUUID(), token: randomBytes(24).toString("base64url"), userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) });
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId: user.id, tokenHash: sha256Hex(token), purpose: "reset", expiresAt: new Date(Date.now() + 60_000) });
  return { user, token };
}

// Same two-connection technique as retained-file-locking.test.ts (kept inline here so this file stands alone).
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

/** Pause only AFTER the real lock-taking SQL finishes (the lock is held while paused). No production test hook. */
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

/** Observe an actual PostgreSQL wait, not elapsed time as evidence of blocking. `observer` must hold the lock. */
async function blockedByObserver(observer: Client, waiterPid: number, finished: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (finished()) throw new Error("Competing transaction completed before the lock barrier was released");
    await observer.query("select pg_stat_clear_snapshot()");
    const { rows } = await observer.query<{ query: string; wait_event_type: string }>(
      "select query, wait_event_type from pg_stat_activity where pid = $1 and pg_backend_pid() = any(pg_blocking_pids(pid))", [waiterPid],
    );
    if (rows[0]?.wait_event_type === "Lock") return rows[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Competing transaction did not block on the expected connection");
}

const pidOf = async (client: Client) => (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;

/** The reset's first statement that locks one of the shared rows (user, session, account): the user row lock in the
 * documented order. The credential-account UPDATE is the same position in the old order, so the test fails there
 * instead of waiting for a barrier that is never reached. */
const FIRST_SHARED_LOCK = /from "user"[\s\S]*for update|^\s*update "account" set/i;

/** The federated transactions' locks on the shared rows, in the documented order (FEDERATED_MFA.md, "Lock order"). */
async function federatedStyleTransaction(client: Client, userId: string, hold?: { holding: () => void; until: Promise<void> }) {
  await client.query("begin");
  try {
    await client.query('select id from "user" where id = $1 for update', [userId]);
    await client.query('select id from "session" where user_id = $1 for update', [userId]);
    if (hold) { hold.holding(); await hold.until; }
    await client.query('select id from "account" where user_id = $1 for share', [userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }
}

/** The reset committed completely: new hash, tenant identity gone, sessions gone, the link consumed. */
async function expectResetCommitted(f: Awaited<ReturnType<typeof fixture>>) {
  const credential = await db.select().from(schema.account).where(and(eq(schema.account.userId, f.user.id), eq(schema.account.providerId, "credential")));
  expect(credential).toHaveLength(1);
  expect(await verifyPassword({ hash: credential[0]!.password!, password: NEW_PASSWORD })).toBe(true);
  expect((await db.select().from(schema.account).where(eq(schema.account.userId, f.user.id))).map(a => a.providerId)).toEqual(["credential"]);
  expect(await db.select().from(schema.session).where(eq(schema.session.userId, f.user.id))).toHaveLength(0);
  expect(await tokenState("reset", f.token)).toBe("used");
}

describe("password-reset recovery against a transaction that locks the user, sessions and accounts in the federated order", () => {
  it("reset holds its first lock: the other transaction queues at the user row, then both commit without a deadlock", async () => {
    const f = await fixture();
    const resetClient = await connect();
    const otherClient = await connect();
    const resetDb = drizzle(resetClient, { schema });
    const pause = pauseAfter(resetClient, FIRST_SHARED_LOCK);
    const transaction = vi.spyOn(db, "transaction").mockImplementationOnce(resetDb.transaction.bind(resetDb));
    let resetting: Promise<unknown> | undefined;
    let other: Promise<unknown> | undefined;
    try {
      const otherPid = await pidOf(otherClient);
      resetting = consumeAccountToken("reset", f.token, NEW_PASSWORD);
      void resetting.catch(() => {}); // observed below even if a barrier assertion fails first
      await Promise.race([pause.reached, resetting.then(() => { throw new Error("The reset finished without reaching its lock barrier"); })]);
      let finished = false;
      other = federatedStyleTransaction(otherClient, f.user.id).finally(() => { finished = true; });
      void other.catch(() => {});
      const wait = await blockedByObserver(resetClient, otherPid, () => finished);
      // It holds nothing the reset still needs, so no cycle can form. (Old order: it was queued at the credential account.)
      expect(wait.query).toMatch(/from "user"/i);
      expect(wait.query).toMatch(/for update/i);
      pause.resume();
      await expect(resetting).resolves.toBe("done");
      await expect(other).resolves.toBeUndefined();
    } finally {
      pause.resume();
      await Promise.allSettled([resetting, other]);
      pause.restore();
      transaction.mockRestore();
      await Promise.all([resetClient.end(), otherClient.end()]);
    }
    await expectResetCommitted(f);
  });

  it("the other transaction holds user and session: the reset queues at the user row, then both commit without a deadlock", async () => {
    const f = await fixture();
    const resetClient = await connect();
    const otherClient = await connect();
    const resetDb = drizzle(resetClient, { schema });
    const transaction = vi.spyOn(db, "transaction").mockImplementationOnce(resetDb.transaction.bind(resetDb));
    const holding = barrier();
    const release = barrier();
    let resetting: Promise<unknown> | undefined;
    let other: Promise<unknown> | undefined;
    try {
      const resetPid = await pidOf(resetClient);
      other = federatedStyleTransaction(otherClient, f.user.id, { holding: holding.release, until: release.promise });
      void other.catch(() => {});
      await Promise.race([holding.promise, other.then(() => { throw new Error("The other transaction finished without reaching its lock barrier"); })]);
      let finished = false;
      resetting = consumeAccountToken("reset", f.token, NEW_PASSWORD).finally(() => { finished = true; });
      void resetting.catch(() => {});
      const wait = await blockedByObserver(otherClient, resetPid, () => finished);
      // It has taken only its token row, so it holds nothing the other still needs. (Old order: it had already updated the
      // credential account and was queued at the session row, which the other's account lock then waited behind.)
      expect(wait.query).toMatch(/from "user"/i);
      expect(wait.query).toMatch(/for update/i);
      release.release();
      await expect(other).resolves.toBeUndefined();
      await expect(resetting).resolves.toBe("done");
    } finally {
      release.release();
      await Promise.allSettled([resetting, other]);
      transaction.mockRestore();
      await Promise.all([resetClient.end(), otherClient.end()]);
    }
    await expectResetCommitted(f);
  });
});
