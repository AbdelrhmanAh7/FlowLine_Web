import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Statement-ORDER check for the two federated authority transactions (issue #37). The mocked database records every
// row lock (`.for(mode)`), advisory lock and replay-marker upsert in the order the real code issues them. It proves
// the order and nothing about PostgreSQL; the deadlock itself is exercised on two real connections by
// tests/integration/federated-lock-order.test.ts in CI. The rule is documented in docs/security/FEDERATED_MFA.md.

const fx = vi.hoisted(() => {
  const far = new Date("2099-01-01");
  return {
    events: [] as string[],
    provider: "sso:ws-1:provider",
    user: { id: "user-1", email: "user@example.test", twoFactorEnabled: true, emailVerified: true, updatedAt: new Date("2026-01-01") },
    factor: { secret: "encrypted-factor", verified: true },
    sessions: [
      { id: "session-initiator", token: "initiator-token", userId: "user-1", expiresAt: far, createdAt: new Date() },
      { id: "session-unissued", token: "unissued-token", userId: "user-1", expiresAt: far, createdAt: new Date() },
    ],
    accounts: [{ id: "account-1", userId: "user-1", providerId: "sso:ws-1:provider", accountId: "subject-1", password: null as string | null }],
    config: { workspaceId: "ws-1", enabled: true, issuer: "https://idp.example", clientId: "client", verifiedAt: new Date("2026-01-03"), updatedAt: new Date("2026-01-02") },
    member: { role: "viewer" },
    rows: new Map<string, { id: string; identifier: string; value: string; expiresAt: Date }>(),
    totpStep: 100,
  };
});

vi.mock("@/db", async () => {
  type Table = Parameters<typeof getTableName>[0];
  type Row = { id: string; identifier: string; value: string; expiresAt: Date };
  const rowsFor = (name: string, params: unknown[]): unknown[] => {
    switch (name) {
      case "user": return [fx.user];
      case "two_factor": return [fx.factor];
      case "account": return fx.accounts;
      case "session": return fx.sessions.filter((s) => params.includes(s.token) || params.includes(s.id));
      case "sso_config": return [fx.config];
      case "workspace_member": return [fx.member];
      case "workspace": return [{ slug: "acme" }];
      case "email_token": return [{ consumedAt: new Date("2026-01-01") }];
      case "platform_secret": return [{ id: "app-1" }];
      case "platform_setting": return [];
      case "verification": return [...fx.rows.values()].filter((r) => (r.id === params[0] || r.identifier === params[0]) && r.expiresAt > new Date());
      default: throw new Error(`Unexpected select: ${name}`);
    }
  };
  const select = () => ({ from: (table: Table) => ({ where: (condition: SQL) => {
    const name = getTableName(table);
    const run = async () => rowsFor(name, new PgDialect().sqlToQuery(condition).params);
    return {
      then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args),
      for: (mode: string) => { fx.events.push(`${name}:${mode}`); return run(); },
    };
  } }) });
  const db = {
    select,
    insert: (table: Table) => ({ values: (row: Row) => {
      const name = getTableName(table);
      const save = async () => { if (name === "verification") fx.rows.set(row.id, row); };
      return {
        then: (...args: Parameters<Promise<void>["then"]>) => save().then(...args),
        onConflictDoUpdate: () => {
          // The replay marker and the assurance proof are the only upserts in these transactions.
          fx.events.push(`${name}:upsert(${row.id.split(":")[0]})`);
          const upsert = async () => { fx.rows.set(row.id, row); return [{ id: row.id }]; };
          return { returning: upsert, then: (...args: Parameters<Promise<unknown[]>["then"]>) => upsert().then(...args) };
        },
      };
    } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: (table: Table) => ({ where: async (condition: SQL) => {
      if (getTableName(table) !== "session") fx.rows.delete(String(new PgDialect().sqlToQuery(condition).params[0]));
    } }),
    execute: async () => { fx.events.push("advisory"); return { rows: [] }; },
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/server/rate-limit", () => ({ checkRate: async () => true }));
vi.mock("@/server/platform-access", () => ({ verifyTotp: async () => fx.totpStep }));
vi.mock("@/server/auth-dispatch", () => ({ federatedProviderStamp: async () => "configuration-1", markFederatedProviderVerified: async () => {} }));
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ internalAdapter: { createSession: async () => fx.sessions[1] } }) } }));
vi.mock("@/server/access", () => ({ requireWorkspace: async () => ({}) }));
vi.mock("@/server/audit", () => ({ audit: async () => {}, userActor: (u: { id: string; email: string }) => ({ kind: "user", userId: u.id, label: u.email }) }));
vi.mock("@/server/sso", () => ({ ssoProviderId: () => fx.provider }));
vi.mock("@/server/email/flows", () => ({ deliverAccountToken: async () => {}, prepareAccountToken: async () => ({}) }));
import { createFederatedChallenge, completeFederatedChallenge } from "@/server/federated-mfa";
import { confirmSsoLink } from "@/server/sso-link";
import { sha256Hex } from "@/server/crypto";

// The documented order (docs/security/FEDERATED_MFA.md, "Lock order"). Every lock these transactions take must appear
// here, so adding one forces a decision about where it belongs and a doc update.
const RANK: Record<string, number> = {
  "verification:update": 0, // the flow's own pending-state row
  "user:update": 1, "user:share": 1,
  "session:update": 2, "session:share": 2,
  "two_factor:update": 3, "two_factor:share": 3,
  "account:update": 4, "account:share": 4,
  "platform_secret:share": 5, "platform_setting:share": 5, "sso_config:update": 5, "workspace_member:update": 5, "workspace_member:share": 5,
  "advisory": 6,
  "verification:upsert(totp-step)": 7,
  "verification:upsert(mfa-session)": 8,
};
/** Order of first acquisition: a row lock already held is a no-op when taken again, so repeats do not count. */
const firstAcquisitions = (events: string[]) => [...new Set(events)];

const LINK_TOKEN = "link-token";
beforeEach(() => {
  fx.rows.clear();
  fx.events.length = 0;
  fx.accounts = [{ id: "account-1", userId: "user-1", providerId: fx.provider, accountId: "subject-1", password: null }];
});

function seedLinkProposal() {
  const intent = {
    userId: "user-1", email: fx.user.email, workspaceId: "ws-1", issuer: fx.config.issuer, clientId: fx.config.clientId, subject: "subject-1",
    configStamp: fx.config.updatedAt.toISOString(), sessionHash: sha256Hex("initiator-token"), mailboxTokenId: "mailbox-token",
  };
  fx.rows.set("link-row", { id: "link-row", identifier: `sso-link:${sha256Hex(LINK_TOKEN)}`, value: JSON.stringify(intent), expiresAt: new Date("2099-01-01") });
}
const workspaceSignIn = () => ({
  workspaceId: "ws-1", newMember: false, role: "viewer" as const, configStamp: fx.config.updatedAt.toISOString(), providerId: fx.provider, subject: "subject-1",
  initiator: { sessionId: "session-initiator", userId: "user-1", sessionHash: sha256Hex("initiator-token") },
});

async function linkTransaction() {
  seedLinkProposal();
  fx.events.length = 0;
  await expect(confirmSsoLink(LINK_TOKEN, "initiator-token", { code: "123456" })).resolves.toEqual({ slug: "acme" });
  return [...fx.events];
}
async function challengeTransaction(workspace?: Parameters<typeof createFederatedChallenge>[2], global?: Parameters<typeof createFederatedChallenge>[4]) {
  const token = await createFederatedChallenge("user-1", "/app", workspace, undefined, global);
  fx.events.length = 0;
  await expect(completeFederatedChallenge(token, "123456")).resolves.toMatchObject({ session: { token: "unissued-token" } });
  return [...fx.events];
}

describe("federated authority lock order (mocked transactions: statement order only; PostgreSQL deadlock behaviour runs in CI)", () => {
  it("link confirmation locks its pending row, the user, then the session, then factor, credential, tenant authority, the provider/subject advisory lock and the replay marker", async () => {
    expect(await linkTransaction()).toEqual([
      "verification:update", "user:update", "session:update", "two_factor:share", "account:share",
      "sso_config:update", "workspace_member:update", "advisory", "verification:upsert(totp-step)",
    ]);
  });

  it("a workspace challenge locks its pending row, the user, the unissued session, the SSO initiator session, then factor, accounts, tenant authority and both markers", async () => {
    expect(await challengeTransaction(workspaceSignIn())).toEqual([
      "verification:update", "user:update", "session:share", "session:share", "two_factor:update", "account:share",
      "sso_config:update", "workspace_member:share", "account:share",
      "verification:upsert(totp-step)", "verification:upsert(mfa-session)",
    ]);
  });

  it("a global-provider challenge takes the same user-then-session order before its provider-credential locks", async () => {
    expect(await challengeTransaction(undefined, { provider: "github", configStamp: "configuration-1" })).toEqual([
      "verification:update", "user:update", "session:share", "two_factor:update", "account:share",
      "platform_secret:share", "verification:upsert(totp-step)", "verification:upsert(mfa-session)",
    ]);
  });

  it("every path acquires its locks in non-decreasing rank, and the user row precedes every session row", async () => {
    const sequences = [
      await linkTransaction(),
      await challengeTransaction(workspaceSignIn()),
      await challengeTransaction(undefined, { provider: "github", configStamp: "configuration-1" }),
    ];
    for (const events of sequences) {
      const order = firstAcquisitions(events);
      const unranked = order.filter((e) => !(e in RANK));
      expect(unranked, "classify new locks in RANK and docs/security/FEDERATED_MFA.md").toEqual([]);
      const ranks = order.map((e) => RANK[e]!);
      expect(ranks, order.join(" > ")).toEqual([...ranks].sort((a, b) => a - b));
      expect(order.findIndex((e) => e.startsWith("user:"))).toBeLessThan(order.findIndex((e) => e.startsWith("session:")));
    }
  });
});
