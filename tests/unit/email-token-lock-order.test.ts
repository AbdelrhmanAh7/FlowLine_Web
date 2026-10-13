import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

// Statement-ORDER check for the account-token transactions (issue #45): verify, reset and delete confirmation lock the
// user row before the token row. The mocked database records every row lock and write in the order the real code issues
// them. It proves order only; the interleavings on real connections are in tests/integration/email-token-lock-order.test.ts.

const fx = vi.hoisted(() => ({
  events: [] as string[],
  token: { id: "token-1", userId: "user-1" as string | null, purpose: "reset", consumedAt: null as Date | null, expiresAt: new Date("2099-01-01") },
  userExists: true,
  /** workspace_member rows: each read takes the next entry; the last one repeats. */
  members: [] as { workspaceId: string; role: string; userId: string }[][],
}));

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (name: string): unknown[] => {
    switch (name) {
      case "email_token": return [fx.token];
      case "user": return fx.userExists ? [{ id: "user-1" }] : [];
      case "workspace_member": return (fx.members.length > 1 ? fx.members.shift() : fx.members[0]) ?? [];
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
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => { fx.events.push("hash"); return "hashed"; } }));
vi.mock("@/server/retained-files", () => ({ lockRetainedFileAccounting: async () => { fx.events.push("lock:retained-accounting"); } }));
vi.mock("@/billing/service", () => ({ getAdapter: async () => null }));
vi.mock("@/server/email/index", () => ({ sendEmail: async () => {} }));

import { consumeAccountToken } from "@/server/email/flows";

const TOKEN = "t".repeat(48);
const locks = () => fx.events.filter((e) => e.startsWith("lock:"));

beforeEach(() => {
  fx.events.length = 0;
  fx.userExists = true;
  fx.members = [];
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

  it("hashes the new password only after both locks, and not at all for a too-short one or a consumed token", async () => {
    expect(await consumeAccountToken("reset", TOKEN, "long-enough-password")).toBe("done");
    expect(fx.events.indexOf("hash")).toBeGreaterThan(fx.events.indexOf("lock:email_token:update"));
    fx.events.length = 0;
    await expect(consumeAccountToken("reset", TOKEN, "short")).rejects.toMatchObject({ status: 400 });
    expect(fx.events).toEqual([]);
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

  // Issue #109 (part 2 of #47): the deletion now writes its audit rows before locking the workspaces FOR UPDATE,
  // avoiding the KEY SHARE → FOR UPDATE upgrade. completeSso's audit() still takes its key-share after
  // its user lock, so the deletion's user-first order prevents a cycle with SSO.
  it("delete writes the account.deleted audit rows before locking the shared workspaces FOR UPDATE", async () => {
    fx.token.purpose = "delete";
    fx.members = [[{ workspaceId: "ws-shared", role: "editor", userId: "user-2" }]];
    expect(await consumeAccountToken("delete", TOKEN, undefined, "user-1")).toBe("done");
    expect(fx.events.slice(0, 5)).toEqual(["lock:retained-accounting", "lock:user:update", "lock:email_token:update", "insert:audit_event", "lock:workspace:update"]);
    expect(fx.events.filter((e) => e.endsWith(":audit_event"))).toEqual(["insert:audit_event"]);
    expect(fx.events.slice(-2)).toEqual(["update:email_token", "delete:user"]);
  });

  it("delete corrects its audit row under the workspace lock when the membership changed before that lock", async () => {
    fx.token.purpose = "delete";
    // First read (before the lock): editor. Every read under the lock: viewer (a concurrent role change).
    fx.members = [[{ workspaceId: "ws-shared", role: "editor", userId: "user-2" }], [{ workspaceId: "ws-shared", role: "viewer", userId: "user-2" }]];
    expect(await consumeAccountToken("delete", TOKEN, undefined, "user-1")).toBe("done");
    const lock = fx.events.indexOf("lock:workspace:update");
    // Before the workspace lock: initial audit insert for `seen` (editor). After the workspace lock: reconciliation
    // deletes the stale editor row and inserts the current viewer row.
    expect(fx.events.slice(lock + 1).filter((e) => e.endsWith(":audit_event"))).toEqual(["delete:audit_event", "insert:audit_event"]);
  });
});
