/**
 * CXH-06: KEK rotation rewraps social-login tokens (v2) and reports what still needs the old key.
 *
 * A rewrap re-encrypts EVERY envelope in the database, so these tests run in their own throwaway database
 * (<test db>_rot), created and migrated here. Otherwise their runtime grows with whatever earlier tests and E2E runs
 * left in the shared test DB (about 10 000 envelopes timed out a 30 s rotation). The assertions are unchanged from
 * sec-wavec-fixes.test.ts, where these tests used to live.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.DATABASE_URL!;
const baseName = new URL(baseUrl).pathname.slice(1);
const rotName = `${baseName}_rot`;
const rotUrl = (() => {
  const u = new URL(baseUrl);
  u.pathname = `/${rotName}`;
  return u.toString();
})();

async function admin(sqlText: string) {
  const c = new Client({ connectionString: baseUrl });
  await c.connect();
  try {
    await c.query(sqlText);
  } finally {
    await c.end();
  }
}

// Product modules are imported only after DATABASE_URL points at the throwaway DB (module state is per test file).
let db: typeof import("@/db").db;
let pool: typeof import("@/db").pool;
let schema: typeof import("@/db").schema;
let rewrapAll: typeof import("@/server/rewrap").rewrapAll;
let encryptAccountTokens: typeof import("@/server/auth-token-adapter").encryptAccountTokens;
let decryptAccountTokens: typeof import("@/server/auth-token-adapter").decryptAccountTokens;
let makeUser: typeof import("./helpers").makeUser;
let closeDb: typeof import("./helpers").closeDb;
let makeVerifiedUser: typeof import("./platform-helpers").makeVerifiedUser;

beforeAll(async () => {
  if (!/^flowline_test(_[a-z0-9]+)?_rot$/.test(rotName)) throw new Error(`refusing to use ${rotName}`);
  await admin(`drop database if exists "${rotName}" with (force)`);
  await admin(`create database "${rotName}"`);
  const mp = new Pool({ connectionString: rotUrl });
  try {
    await migrate(drizzle(mp), { migrationsFolder: "drizzle" });
  } finally {
    await mp.end();
  }
  process.env.DATABASE_URL = rotUrl;
  ({ db, pool, schema } = await import("@/db"));
  ({ rewrapAll } = await import("@/server/rewrap"));
  ({ encryptAccountTokens, decryptAccountTokens } = await import("@/server/auth-token-adapter"));
  ({ makeUser, closeDb } = await import("./helpers"));
  ({ makeVerifiedUser } = await import("./platform-helpers"));
}, 120_000);

afterAll(async () => {
  await closeDb?.();
  process.env.DATABASE_URL = baseUrl;
  await admin(`drop database if exists "${rotName}" with (force)`);
});

async function lockWaiters() {
  const { rows } = await pool.query<{ n: number }>("select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'");
  return rows[0]!.n;
}

async function until(cond: () => Promise<boolean> | boolean, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** A separate connection holding row locks until `release()` (the controlled interleaving point). */
async function holdLock(sqlText: string, params: unknown[]) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query(sqlText, params);
  return {
    client,
    async release() {
      await client.query("commit");
      client.release();
    },
  };
}

function settle<T>(p: Promise<T>) {
  const s = { done: false, value: undefined as T | undefined, error: undefined as unknown };
  const promise = p.then(
    (v) => {
      s.value = v;
      s.done = true;
    },
    (e) => {
      s.error = e;
      s.done = true;
    },
  );
  return Object.assign(s, { promise });
}

describe("CXH-06: KEK rotation rewraps social-login tokens (v2) and reports what still needs the old key", () => {
  const K1 = process.env.FLOWLINE_ENCRYPTION_KEY!;
  const K1_OLD = process.env.FLOWLINE_ENCRYPTION_KEYS_OLD ?? "";
  const K2 = randomBytes(32).toString("base64");
  const setKeys = (current: string, old: string) => {
    process.env.FLOWLINE_ENCRYPTION_KEY = current;
    process.env.FLOWLINE_ENCRYPTION_KEYS_OLD = old;
  };
  /** Rotates back to K1 (rewrapping everything written under K2), then restores the original env. */
  async function rotateBack() {
    setKeys(K1, [K2, K1_OLD].filter(Boolean).join(","));
    await rewrapAll();
    setKeys(K1, K1_OLD);
  }

  async function makeAccount(prefix: string) {
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    const user = await makeVerifiedUser(prefix);
    const token = `ya29.${prefix}-${randomUUID()}`;
    const acct = await ctx.internalAdapter.createAccount({ userId: user.id, providerId: "google", accountId: `g-${randomUUID()}`, accessToken: token, refreshToken: `1//${token}`, idToken: `eyJ.${token}` });
    return { ctx, user, token, acct };
  }

  it("rotate → rewrap → retire the old key: v2 account tokens stay readable; rotation is complete only when nothing remains", async () => {
    const { ctx, user, token, acct } = await makeAccount("cxh06");
    // A row that can't be opened with any configured key (context-swapped ciphertext): it must keep rotation incomplete.
    const owner = await makeUser("cxh06-poison");
    const [src] = await db.select().from(schema.account).where(eq(schema.account.id, acct.id));
    const poisonId = randomUUID();
    await db.insert(schema.account).values({ id: poisonId, accountId: `p-${randomUUID()}`, providerId: "google", userId: owner.id, accessToken: src!.accessToken });
    try {
      setKeys(K2, [K1, K1_OLD].filter(Boolean).join(","));
      const report = await rewrapAll();
      const accounts = report.find((r) => r.table === "account")!;
      expect(accounts.rewrapped).toBeGreaterThanOrEqual(3); // access, refresh and id token of our row
      expect(accounts.failed).toBeGreaterThanOrEqual(1); // the poisoned row
      expect(accounts.remaining).toBeGreaterThanOrEqual(1);
      expect(report.every((r) => typeof r.remaining === "number")).toBe(true);
      const [raw] = await db.select().from(schema.account).where(eq(schema.account.id, acct.id));
      expect(raw!.accessToken).not.toBe(src!.accessToken);
      expect(raw!.refreshToken).not.toBe(src!.refreshToken);
      expect(raw!.idToken).not.toBe(src!.idToken);
      // Retire K1: the rewrapped tokens decrypt with K2 alone.
      setKeys(K2, "");
      const listed = (await ctx.internalAdapter.findAccounts(user.id)).find((a) => a.id === acct.id);
      expect(listed).toMatchObject({ accessToken: token, refreshToken: `1//${token}`, idToken: `eyJ.${token}` });
      expect(decryptAccountTokens(raw!)).toMatchObject({ accessToken: token });
      // Once the unreadable row is dealt with, a dry run reports nothing remaining for the account table.
      setKeys(K2, [K1, K1_OLD].filter(Boolean).join(","));
      await db.delete(schema.account).where(eq(schema.account.id, poisonId));
      const again = await rewrapAll({ dryRun: true });
      expect(again.find((r) => r.table === "account")!.remaining).toBe(0);
    } finally {
      await db.delete(schema.account).where(eq(schema.account.id, poisonId));
      await rotateBack();
    }
  });

  it("a token update racing the rewrap is never overwritten (compare-and-swap on the old ciphertext)", async () => {
    const { ctx, user, acct } = await makeAccount("cxh06race");
    const hold = await holdLock("select id from account where id = $1 for update", [acct.id]);
    let released = false;
    try {
      setKeys(K2, [K1, K1_OLD].filter(Boolean).join(","));
      const rewrap = settle(rewrapAll());
      await until(async () => rewrap.done || (await lockWaiters()) >= 1, "the rewrap to reach the locked account row");
      expect(rewrap.done).toBe(false); // it had to wait: it does rewrap this (v2) row
      // The concurrent writer (e.g. better-auth refreshing the token) commits a new token first.
      const fresh = encryptAccountTokens({ accessToken: "ya29.concurrently-refreshed" }, { id: acct.id, userId: user.id, providerId: "google" });
      await hold.client.query("update account set access_token = $1 where id = $2", [fresh.accessToken, acct.id]);
      await hold.release();
      released = true;
      await rewrap.promise;
      expect(rewrap.error).toBeUndefined();
      const listed = (await ctx.internalAdapter.findAccounts(user.id)).find((a) => a.id === acct.id);
      expect(listed!.accessToken).toBe("ya29.concurrently-refreshed");
    } finally {
      if (!released) await hold.release();
      await rotateBack();
    }
  });
});
