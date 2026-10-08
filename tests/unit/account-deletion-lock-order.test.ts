import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Statement-ORDER check for account deletion (issue #47). The mocked database records the advisory lock, every row
// lock (`.for(mode)`) and every write in the order `consumeAccountToken("delete")` issues them. It proves the order and
// nothing about PostgreSQL; the deadlock against the user's own SSO sign-in runs on two real connections in
// tests/integration/account-deletion-lock-order.test.ts in CI. Rule: docs/security/FEDERATED_MFA.md ("Lock order").

const fx = vi.hoisted(() => ({
  events: [] as string[],
  tokenOwner: "user-1",
}));

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const params = (condition: SQL) => new PgDialect().sqlToQuery(condition).params;
  // user-1 is an editor of ws-shared (which has another member) and the only member of ws-sole.
  const rowsFor = (name: string, p: unknown[]): unknown[] => {
    switch (name) {
      case "email_token": return [{ id: "token-1", userId: fx.tokenOwner, purpose: "delete", consumedAt: null, expiresAt: new Date("2099-01-01") }];
      case "user": return [{ id: p[0] }];
      case "workspace": return [{ id: "ws-shared" }, { id: "ws-sole" }];
      case "workspace_member":
        if (p[0] === "ws-shared") return [{ userId: "user-2" }];
        if (p[0] === "ws-sole") return [];
        if (p.includes("owner")) return [{ workspaceId: "ws-sole" }];
        return [{ workspaceId: "ws-shared", role: "editor" }, { workspaceId: "ws-sole", role: "owner" }];
      case "billing_account": return [];
      case "retained_file_counter": return [{ scope: "installation" }];
      default: throw new Error(`Unexpected select: ${name}`);
    }
  };
  const query = (name: string, condition: SQL) => {
    const run = async () => rowsFor(name, params(condition));
    const chain = {
      then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
      for: (mode: string) => { fx.events.push(`${name}:${mode}`); return run(); },
      orderBy: () => chain,
      limit: () => chain,
    };
    return chain;
  };
  const db = {
    select: () => ({ from: (table: Table) => ({ where: (condition: SQL) => query(getTableName(table), condition) }) }),
    insert: (table: Table) => ({ values: async () => { fx.events.push(`insert:${getTableName(table)}`); } }),
    update: (table: Table) => ({ set: () => ({ where: async () => { fx.events.push(`update:${getTableName(table)}`); } }) }),
    delete: (table: Table) => ({ where: async () => { fx.events.push(`delete:${getTableName(table)}`); } }),
    execute: async () => { fx.events.push("advisory"); return { rows: [] }; },
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/billing/service", () => ({ getAdapter: async () => null }));
vi.mock("@/server/email/index", () => ({ sendEmail: async () => {} }));
import { consumeAccountToken } from "@/server/email/flows";

const TOKEN = "a".repeat(43);
// lockRetainedFileAccounting: the advisory lock, then the installation counter row (taken before anything else).
const ACCOUNTING = ["advisory", "retained_file_counter:update"];
beforeEach(() => {
  fx.events.length = 0;
  fx.tokenOwner = "user-1";
});

describe("account deletion lock order (mocked transaction: statement order only; PostgreSQL deadlock behaviour runs in CI)", () => {
  it("@issue-47 AC3: locks the user row FOR UPDATE right after the retained-file accounting locks, before the token, every workspace lock and every audit insert", async () => {
    await expect(consumeAccountToken("delete", TOKEN, undefined, "user-1")).resolves.toBe("done");
    expect(fx.events).toEqual([
      "advisory", "retained_file_counter:update", "user:update", "email_token:update", "workspace:update",
      "insert:audit_event", "delete:workspace", "update:email_token", "delete:user",
    ]);
  });

  it("@issue-47 AC3: keeps the workspace locks FOR UPDATE, since sole-member workspaces are deleted with the account", async () => {
    await consumeAccountToken("delete", TOKEN, undefined, "user-1");
    const user = fx.events.indexOf("user:update");
    expect(user).toBeGreaterThan(-1);
    expect(fx.events.filter((e) => e.startsWith("workspace:"))).toEqual(["workspace:update"]);
    for (const later of ["workspace:update", "insert:audit_event", "delete:workspace", "delete:user"]) {
      expect(fx.events.indexOf(later), later).toBeGreaterThan(user);
    }
  });

  it("@issue-47 AC4: a deletion token of another account is refused before any workspace is locked", async () => {
    fx.tokenOwner = "user-2";
    await expect(consumeAccountToken("delete", TOKEN, undefined, "user-1")).resolves.toBe("invalid");
    expect(fx.events.some((e) => e.startsWith("workspace:") || e.startsWith("insert:") || e.startsWith("delete:"))).toBe(false);
  });

  it("@issue-47 AC4: a deletion without a signed-in user locks no account row at all", async () => {
    await expect(consumeAccountToken("delete", TOKEN)).resolves.toBe("invalid");
    expect(fx.events).toEqual(ACCOUNTING);
  });
});
