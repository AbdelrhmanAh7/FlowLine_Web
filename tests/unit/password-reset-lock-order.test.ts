import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

// Statement-ORDER check for the password-reset recovery transaction (issue #41). The mocked database records every
// row lock the real `consumeAccountToken("reset", ...)` takes (`select ... for update`, and the rows its DELETE /
// UPDATE / INSERT statements lock) in the order it issues them. It proves the order and nothing about PostgreSQL;
// the deadlock itself is exercised on two real connections by tests/integration/password-reset-lock-order.test.ts in
// CI. The rule is documented in docs/security/FEDERATED_MFA.md ("Password-reset recovery lock order").

const fx = vi.hoisted(() => ({
  events: [] as string[],
  written: [] as { table: string; values: Record<string, unknown> }[],
  token: { id: "token-row", userId: "user-1", purpose: "reset", consumedAt: null as Date | null, expiresAt: new Date("2099-01-01") },
  userRows: [{ id: "user-1" }] as { id: string }[],
  credential: [{ id: "credential-1" }] as { id: string }[],
}));

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (name: string): unknown[] => {
    switch (name) {
      case "email_token": return [fx.token];
      case "user": return fx.userRows;
      case "account": return fx.credential;
      default: throw new Error(`Unexpected select: ${name}`);
    }
  };
  const record = (event: string) => { fx.events.push(event); };
  const db = {
    select: () => ({ from: (table: Table) => ({ where: () => {
      const name = getTableName(table);
      const run = async () => rowsFor(name);
      return {
        then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
        for: (mode: string) => { record(`lock ${name} for ${mode}`); return run(); },
      };
    } }) }),
    insert: (table: Table) => ({ values: async (values: Record<string, unknown>) => { record(`insert ${getTableName(table)}`); fx.written.push({ table: getTableName(table), values }); } }),
    update: (table: Table) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { record(`update ${getTableName(table)}`); fx.written.push({ table: getTableName(table), values }); } }) }),
    delete: (table: Table) => ({ where: async () => { record(`delete ${getTableName(table)}`); } }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("better-auth/crypto", () => ({ hashPassword: async (password: string) => `hash(${password})` }));
vi.mock("@/billing/service", () => ({ getAdapter: async () => null }));
vi.mock("@/server/retained-files", () => ({ lockRetainedFileAccounting: async () => { fx.events.push("retained-file accounting lock"); } }));
vi.mock("@/server/email/index", () => ({ sendEmail: async () => {} }));
import { consumeAccountToken } from "@/server/email/flows";

const TOKEN = "t".repeat(43);

// The documented order for the tables a recovery transaction touches (docs/security/FEDERATED_MFA.md): the flow's own
// pending-state row (the email token), the user row, the user's sessions, then their account rows. Every table the
// reset path touches must appear here, so adding one forces a decision about where it belongs and a doc update.
const RANK: Record<string, number> = { email_token: 0, user: 1, session: 2, account: 3 };
/** Order of first acquisition per table: a row lock this transaction already holds is a no-op when taken again. */
const firstTouches = (events: string[]) => [...new Set(events.map((event) => event.split(" ")[1]!))];

beforeEach(() => {
  fx.events.length = 0;
  fx.written.length = 0;
  fx.token.consumedAt = null;
  fx.userRows = [{ id: "user-1" }];
  fx.credential = [{ id: "credential-1" }];
});

describe("password-reset recovery lock order (mocked transactions: statement order only; PostgreSQL deadlock behaviour runs in CI)", () => {
  it("locks the token row, then the user row, then deletes the sessions, then writes the accounts and the user", async () => {
    await expect(consumeAccountToken("reset", TOKEN, "a-new-password")).resolves.toBe("done");
    expect(fx.events).toEqual([
      "lock email_token for update",
      "lock user for update",
      "delete session",
      "update account", // the existing credential account gets the new hash
      "delete account", // historical tenant-created sso:* identities that were never mailbox-approved
      "update user",
      "update email_token", // every other outstanding reset link
      "update email_token", // this token
    ]);
    expect(fx.written.find((w) => w.table === "account")?.values).toMatchObject({ password: "hash(a-new-password)" });
    expect(fx.written.find((w) => w.table === "user")?.values).toMatchObject({ emailVerified: true });
  });

  it("inserts a missing credential account only after the user row and the sessions", async () => {
    fx.credential = [];
    await expect(consumeAccountToken("reset", TOKEN, "a-new-password")).resolves.toBe("done");
    expect(fx.events).toEqual([
      "lock email_token for update",
      "lock user for update",
      "delete session",
      "insert account", // its user_id foreign key also takes a key-share lock on the user row we already hold
      "delete account",
      "update user",
      "update email_token",
      "update email_token",
    ]);
    expect(fx.written.find((w) => w.table === "account")?.values).toMatchObject({ providerId: "credential", userId: "user-1", password: "hash(a-new-password)" });
  });

  it("touches its tables in non-decreasing rank, with the user row before every session and account row", async () => {
    for (const credential of [[{ id: "credential-1" }], []]) {
      fx.events.length = 0;
      fx.credential = credential;
      await consumeAccountToken("reset", TOKEN, "a-new-password");
      const order = firstTouches(fx.events);
      expect(order.filter((table) => !(table in RANK)), "classify new tables in RANK and docs/security/FEDERATED_MFA.md").toEqual([]);
      expect(order.map((table) => RANK[table]!), order.join(" > ")).toEqual([0, 1, 2, 3]);
      const userLock = fx.events.indexOf("lock user for update");
      expect(userLock).toBeGreaterThan(-1);
      for (const [index, event] of fx.events.entries()) {
        if (/ (session|account)$/.test(event)) expect(index, `${event} before the user row lock`).toBeGreaterThan(userLock);
      }
    }
  });

  it("takes no retained-file accounting lock, because reset mutates no retained file", async () => {
    await consumeAccountToken("reset", TOKEN, "a-new-password");
    expect(fx.events).not.toContain("retained-file accounting lock");
  });

  it("refuses an invalid password before locking the user row", async () => {
    await expect(consumeAccountToken("reset", TOKEN, "short")).rejects.toMatchObject({ status: 400, code: "PASSWORD_LENGTH" });
    expect(fx.events).toEqual(["lock email_token for update"]);
  });

  it("returns invalid and writes nothing when the user row is gone", async () => {
    fx.userRows = [];
    await expect(consumeAccountToken("reset", TOKEN, "a-new-password")).resolves.toBe("invalid");
    expect(fx.events).toEqual(["lock email_token for update", "lock user for update"]);
    expect(fx.written).toEqual([]);
  });
});
