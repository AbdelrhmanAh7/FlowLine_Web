import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "@/db";
import { sha256Hex } from "@/server/crypto";
import { consumeAccountToken } from "@/server/email/flows";
import { closeDb, makeUser } from "./helpers";
import { blockedByObserver, connect, pauseAfter } from "./pg-lock-helpers";

// Two real PostgreSQL connections (watches pg_blocking_pids for lock-ordering verification).
//
// Issue #45: password reset, email verification and delete confirmation locked their token row first, while deleting a
// user updates every token row of that user (email_token.user_id is ON DELETE SET NULL) after locking the user. A reset
// racing a delete confirmation for one user could deadlock (SQLSTATE 40P01), and two resets with different outstanding
// tokens each held their own token row while queueing at the user row, so the winner then updated the loser's locked
// token. All three flows now read the token's user without a lock, lock the user row, then the token row, and re-check
// the token under both locks (rule: docs/security/FEDERATED_MFA.md, "Lock order").
//
// Each test runs the REAL production function on a dedicated connection, pauses the first transaction right after its
// user-row lock, starts the second and observes it waiting at the user row through pg_blocking_pids. Waiting there, it
// holds neither its token row nor anything the first still needs.

afterEach(() => { vi.restoreAllMocks(); });
afterAll(closeDb);

async function userWithCredential() {
  const user = await makeUser("token-lock");
  await db.insert(schema.account).values({ id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: "old-hash" });
  return user;
}

async function issue(userId: string, purpose: "reset" | "delete") {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.emailToken).values({ userId, tokenHash: sha256Hex(token), purpose, expiresAt: new Date(Date.now() + 60_000) });
  return token;
}

type Run = (token: string) => Promise<unknown>;

/** Runs `first` until it holds the user row, then `second` against the same database, and returns both outcomes. */
async function race(first: { token: string; run: Run }, second: { token: string; run: Run }) {
  const holderClient = await connect();
  const waiterClient = await connect();
  const holderDb = drizzle(holderClient, { schema });
  const waiterDb = drizzle(waiterClient, { schema });
  const pause = pauseAfter(holderClient, /from "user"[\s\S]*for update/i);
  vi.spyOn(db, "transaction")
    .mockImplementationOnce(holderDb.transaction.bind(holderDb))
    .mockImplementationOnce(waiterDb.transaction.bind(waiterDb));
  let holding: Promise<unknown> | undefined;
  let waiting: Promise<unknown> | undefined;
  try {
    const waiterPid = (await waiterClient.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
    holding = first.run(first.token);
    void holding.catch(() => {});
    await Promise.race([pause.reached, holding.then(() => { throw new Error("The first transaction finished without reaching the user lock"); })]);
    let finished = false;
    waiting = second.run(second.token).finally(() => { finished = true; });
    void waiting.catch(() => {});
    const wait = await blockedByObserver(holderClient, waiterPid, () => finished);
    // Queued at the user row, not at a token row: it holds no token lock for the winner to run into.
    expect(wait.query).toMatch(/from "user"/i);
    expect(wait.query).toMatch(/for update/i);
    pause.resume();
    return { first: await holding, second: await waiting };
  } finally {
    pause.resume();
    await Promise.allSettled([holding, waiting]);
    pause.restore();
    await Promise.all([holderClient.end(), waiterClient.end()]);
  }
}

const reset = (password: string): Run => (token) => consumeAccountToken("reset", token, password);
const confirmDelete = (userId: string): Run => (token) => consumeAccountToken("delete", token, undefined, userId);

describe("account token lock order", () => {
  it("reset holding the user row, delete confirmation queued behind it: both finish, no deadlock", async () => {
    const user = await userWithCredential();
    const resetToken = await issue(user.id, "reset");
    const deleteToken = await issue(user.id, "delete");
    const result = await race({ token: resetToken, run: reset("fresh-password-123") }, { token: deleteToken, run: confirmDelete(user.id) });
    expect(result).toEqual({ first: "done", second: "done" });
    expect(await db.select().from(schema.user).where(eq(schema.user.id, user.id))).toHaveLength(0);
  });

  it("delete confirmation holding the user row, reset queued behind it: the reset is refused, not aborted", async () => {
    const user = await userWithCredential();
    const resetToken = await issue(user.id, "reset");
    const deleteToken = await issue(user.id, "delete");
    const result = await race({ token: deleteToken, run: confirmDelete(user.id) }, { token: resetToken, run: reset("fresh-password-123") });
    // The reset read the user before the delete committed (a stale read); under the locks the user is gone.
    expect(result).toEqual({ first: "done", second: "invalid" });
    const [orphan] = await db.select().from(schema.emailToken).where(eq(schema.emailToken.tokenHash, sha256Hex(resetToken)));
    expect(orphan).toMatchObject({ userId: null, consumedAt: null });
  });

  it("two resets with different outstanding tokens: one wins, the other is refused as used and was never holding its token", async () => {
    const user = await userWithCredential();
    const winnerToken = await issue(user.id, "reset");
    const loserToken = await issue(user.id, "reset");
    const result = await race({ token: winnerToken, run: reset("winner-password-123") }, { token: loserToken, run: reset("loser-password-123") });
    expect(result).toEqual({ first: "done", second: "used" });
    const [account] = await db.select().from(schema.account).where(eq(schema.account.userId, user.id));
    expect(await verifyPassword({ hash: account!.password!, password: "winner-password-123" })).toBe(true);
    expect(await verifyPassword({ hash: account!.password!, password: "loser-password-123" })).toBe(false);
    const tokens = await db.select().from(schema.emailToken).where(eq(schema.emailToken.userId, user.id));
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => t.consumedAt)).toBe(true);
  });
});
