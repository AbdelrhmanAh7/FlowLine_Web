import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { HttpError } from "@/server/http";

// Statement-ORDER and lock-MODE check for member role changes and removals (issue #42). The mocked database records
// every row lock (`.for(mode)`) and write in the order the real code issues them. It proves the mode and the order
// and nothing about PostgreSQL; the deadlock itself is exercised on two real connections by
// tests/integration/member-lock-order.test.ts in CI. The rule is documented in docs/security/FEDERATED_MFA.md
// ("Lock order" > "Member changes").
//
// Why the mode matters: the SSO transactions (completeSso, confirmSsoLink, completeFederatedChallenge) hold a
// `workspace_member` row and then insert an `audit_event` row, whose foreign key takes FOR KEY SHARE on the `workspace`
// row. A membership change that locks that workspace row FOR UPDATE (which conflicts with FOR KEY SHARE) and then
// updates/deletes the member row waits for the SSO transaction while the SSO transaction waits for it.

const fx = vi.hoisted(() => ({
  events: [] as string[],
  member: { role: "viewer" } as { role: "owner" | "editor" | "viewer" } | undefined,
  owners: 2,
}));

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  const rowsFor = (name: string, counting: boolean): unknown[] => {
    if (name === "workspace") return [{ id: "ws-1" }];
    if (name === "workspace_member") return counting ? [{ n: fx.owners }] : fx.member ? [fx.member] : [];
    throw new Error(`Unexpected select: ${name}`);
  };
  const select = (columns?: Record<string, unknown>) => ({ from: (table: Table) => ({ where: () => {
    const name = getTableName(table);
    const counting = Boolean(columns && "n" in columns);
    const run = async () => {
      fx.events.push(`${name}:${counting ? "count" : "read"}`);
      return rowsFor(name, counting);
    };
    return {
      then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
      // A locking read is one event, named by the mode, so the plain-read events are not mistaken for locks.
      for: async (mode: string) => { fx.events.push(`${name}:lock(${mode})`); return rowsFor(name, counting); },
    };
  } }) });
  const db = {
    select,
    update: (table: Table) => ({ set: () => ({ where: async () => { fx.events.push(`${getTableName(table)}:update`); } }) }),
    delete: (table: Table) => ({ where: async () => { fx.events.push(`${getTableName(table)}:delete`); } }),
    insert: (table: Table) => ({ values: async () => { fx.events.push(`${getTableName(table)}:insert`); } }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/server/email/flows", () => ({ checkEmailRate: async () => {}, sendInviteEmail: async () => {} }));
import { changeRole, removeMember } from "@/server/members";

const actor = { id: "owner-1", email: "owner@example.test", name: "Owner" };
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const TARGET = "user-2";

beforeEach(() => {
  fx.events.length = 0;
  fx.member = { role: "viewer" };
  fx.owners = 2;
});

// PostgreSQL row-level lock conflicts that matter here (Table 13.3 of the PostgreSQL manual): FOR KEY SHARE, the lock an
// insert takes on the row its foreign key references, conflicts only with FOR UPDATE. A membership change must still
// serialize with another membership change (the mode conflicts with itself) and with an account deletion, which locks
// the workspace FOR UPDATE.
const CONFLICTS_WITH_KEY_SHARE = new Set(["update"]);
const CONFLICTS_WITH_ITSELF = new Set(["update", "no key update"]);
const workspaceLocks = (events: string[]) => events.filter((e) => e.startsWith("workspace:lock(")).map((e) => /\((.*)\)/.exec(e)![1]!);

describe("member change lock order (mocked transactions: statement order and lock mode only; PostgreSQL deadlock behaviour runs in CI)", () => {
  it("changeRole locks the workspace FOR NO KEY UPDATE before it reads or writes the member, then audits", async () => {
    await expect(changeRole(actor, WORKSPACE, TARGET, "editor")).resolves.toEqual({ role: "editor" });
    expect(fx.events).toEqual(["workspace:lock(no key update)", "workspace_member:read", "workspace_member:update", "audit_event:insert"]);
  });

  it("changeRole counts owners under the same lock when it demotes an owner", async () => {
    fx.member = { role: "owner" };
    await expect(changeRole(actor, WORKSPACE, TARGET, "editor")).resolves.toEqual({ role: "editor" });
    expect(fx.events).toEqual(["workspace:lock(no key update)", "workspace_member:read", "workspace_member:count", "workspace_member:update", "audit_event:insert"]);
  });

  it("removeMember locks the workspace FOR NO KEY UPDATE before it reads or deletes the member, then audits", async () => {
    await expect(removeMember(actor, WORKSPACE, TARGET)).resolves.toBeUndefined();
    expect(fx.events).toEqual(["workspace:lock(no key update)", "workspace_member:read", "workspace_member:delete", "audit_event:insert"]);
  });

  it("refuses to demote or remove the last owner after the owner count was read under the lock, and writes nothing", async () => {
    fx.member = { role: "owner" };
    fx.owners = 1;
    await expect(changeRole(actor, WORKSPACE, TARGET, "viewer")).rejects.toMatchObject({ status: 409, code: "LAST_OWNER" });
    await expect(removeMember(actor, WORKSPACE, TARGET)).rejects.toMatchObject({ status: 409, code: "LAST_OWNER" });
    expect(fx.events).toEqual([
      "workspace:lock(no key update)", "workspace_member:read", "workspace_member:count",
      "workspace:lock(no key update)", "workspace_member:read", "workspace_member:count",
    ]);
  });

  it("a missing member is a 404 after the lock, with no write and no audit row", async () => {
    fx.member = undefined;
    await expect(removeMember(actor, WORKSPACE, TARGET)).rejects.toBeInstanceOf(HttpError);
    expect(fx.events).toEqual(["workspace:lock(no key update)", "workspace_member:read"]);
  });

  it("the workspace lock never blocks the key-share lock an audit insert takes, and still serializes membership changes", async () => {
    // A FOR UPDATE here is the issue #42 deadlock: it waits for the SSO transaction's member row while that
    // transaction's audit insert waits for this workspace row.
    const sequences: string[][] = [];
    await changeRole(actor, WORKSPACE, TARGET, "editor");
    sequences.push([...fx.events]);
    fx.events.length = 0;
    await removeMember(actor, WORKSPACE, TARGET);
    sequences.push([...fx.events]);
    for (const events of sequences) {
      const locks = workspaceLocks(events);
      expect(locks.length).toBeGreaterThan(0);
      for (const mode of locks) {
        expect(CONFLICTS_WITH_KEY_SHARE.has(mode), `workspace lock FOR ${mode.toUpperCase()} conflicts with the FOR KEY SHARE that audit_event inserts take`).toBe(false);
        expect(CONFLICTS_WITH_ITSELF.has(mode), `workspace lock FOR ${mode.toUpperCase()} must serialize concurrent membership changes`).toBe(true);
      }
      // The lock precedes every statement that touches the member row, so the last-owner check reads under it.
      expect(events.findIndex((e) => e.startsWith("workspace:lock("))).toBe(0);
    }
  });
});
