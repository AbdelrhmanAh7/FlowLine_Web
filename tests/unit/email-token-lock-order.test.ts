import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

// Statement-ORDER check for the account-token transactions (issue #45): verify, reset and delete confirmation lock the
// user row before the token row. The mocked database records every row lock and write in the order the real code issues
// them. It proves order only; the interleavings on real connections are in tests/integration/email-token-lock-order.test.ts.

const fx = vi.hoisted(() => ({
  events: [] as string[],
  token: { id: "token-1", userId: "user-1" as string | null, purpose: "reset", consumedAt: null as Date | null, expiresAt: new Date("2099-01-01") },
  userExists: true,
}));

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (name: string): unknown[] => {
    switch (name) {
      case "email_token": return [fx.token];
      case "user": return fx.userExists ? [{ id: "user-1" }] : [];
      default: return [];
    }
  };
  const select = () => ({ from: (table: Table) => ({ where: () => {
    const name = getTableName(table);
    const run = async () => rowsFor(name);
    const chain = {
      then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
      limit: () => run(),
      orderBy: () => chain,
      for: (mode: string) => { fx.events.push(`lock:${name}:${mode}`); return run(); },
    };
    return chain;
  } }) });
  const write = (kind: string) => (table: Table) => {
    const done = async () => { fx.events.push(`${kind}:${getTableName(table)}`); };
    return { set: () => ({ where: done }), values: done, where: done };
  };
  const db = { select, update: write("update"), insert: write("insert"), delete: write("delete"), transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db) };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => "hashed" }));
vi.mock("@/server/retained-files", () => ({ lockRetainedFileAccounting: async () => { fx.events.push("lock:retained-accounting"); } }));
vi.mock("@/billing/service", () => ({ getAdapter: async () => null }));
vi.mock("@/server/email/index", () => ({ sendEmail: async () => {} }));

import { consumeAccountToken } from "@/server/email/flows";

const TOKEN = "t".repeat(48);
const locks = () => fx.events.filter((e) => e.startsWith("lock:"));

beforeEach(() => {
  fx.events.length = 0;
  fx.userExists = true;
  fx.token = { id: "token-1", userId: "user-1", purpose: "reset", consumedAt: null, expiresAt: new Date("2099-01-01") };
});

describe("account token lock order", () => {
  it.each([
    ["verify", () => consumeAccountToken("verify", TOKEN), ["lock:user:update", "lock:email_token:update"]],
    ["reset", () => consumeAccountToken("reset", TOKEN, "long-enough-password"), ["lock:user:update", "lock:email_token:update"]],
    ["delete", () => consumeAccountToken("delete", TOKEN, undefined, "user-1"), ["lock:retained-accounting", "lock:user:update", "lock:email_token:update"]],
  ] as const)("%s locks the user row, then the token row, before any write", async (purpose, run, expected) => {
    fx.token.purpose = purpose;
    expect(await run()).toBe("done");
    expect(locks()).toEqual(expected);
    // Every write (token consumption included) happens after both locks.
    const firstWrite = fx.events.findIndex((e) => !e.startsWith("lock:"));
    expect(firstWrite).toBeGreaterThanOrEqual(expected.length);
  });

  it("refuses a token whose user was deleted after the unlocked read, without locking the token", async () => {
    fx.userExists = false;
    expect(await consumeAccountToken("verify", TOKEN)).toBe("invalid");
    expect(fx.events).toEqual(["lock:user:update"]);
  });

  it("refuses a token with no user (already detached by a deletion) before opening a transaction", async () => {
    fx.token.userId = null;
    expect(await consumeAccountToken("reset", TOKEN, "long-enough-password")).toBe("invalid");
    expect(fx.events).toEqual([]);
  });

  it("refuses a delete token of another user without locking anything", async () => {
    fx.token.purpose = "delete";
    expect(await consumeAccountToken("delete", TOKEN, undefined, "someone-else")).toBe("invalid");
    expect(fx.events).toEqual([]);
  });

  it("refuses an already consumed token from the unlocked read, before any lock or hash", async () => {
    fx.token.consumedAt = new Date();
    expect(await consumeAccountToken("reset", TOKEN, "long-enough-password")).toBe("used");
    expect(fx.events).toEqual([]);
  });
});
