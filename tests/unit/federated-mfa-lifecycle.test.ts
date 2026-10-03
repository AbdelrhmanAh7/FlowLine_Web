import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const fixture = vi.hoisted(() => ({
  user: { id: "user-1", twoFactorEnabled: true, updatedAt: new Date("2026-01-01"), emailVerified: true },
  factor: { secret: "encrypted-factor", verified: true },
  accounts: [{ id: "account-1", providerId: "github", accountId: "subject", password: null as string | null }],
  rows: new Map<string, { id: string; identifier: string; value: string; expiresAt: Date }>(),
  session: { token: "unissued-token", userId: "user-1", expiresAt: new Date("2099-01-01") },
  sessionLive: true, removedSessions: 0, providerStamp: "configuration-1" as string | null,
  codeValid: true, createdSessions: 0,
  markVerified: vi.fn(async () => {}),
}));
vi.mock("@/db", async () => {
  const select = () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: (sql: SQL) => {
    const run = async () => {
      const { params } = new PgDialect().sqlToQuery(sql);
      switch (getTableName(table)) {
        case "user": return [fixture.user];
        case "two_factor": return [fixture.factor];
        case "account": return fixture.accounts;
        case "session": return fixture.sessionLive ? [fixture.session] : [];
        case "platform_secret": return [{ id: "app-1" }];
        case "platform_setting": return [];
        case "verification": return [...fixture.rows.values()].filter((r) => (r.id === params[0] || r.identifier === params[0]) && r.expiresAt > new Date());
        default: throw new Error(`Unexpected select: ${getTableName(table)}`);
      }
    };
    return { then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args), for: run };
  } }) });
  const db = {
    select,
    insert: () => ({ values: (row: { id: string; identifier: string; value: string; expiresAt: Date }) => {
      const save = async () => { fixture.rows.set(row.id, row); };
      return { then: (...args: Parameters<Promise<void>["then"]>) => save().then(...args), onConflictDoUpdate: save };
    } }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({ where: async (sql: SQL) => {
      if (getTableName(table) === "session") fixture.removedSessions++;
      else fixture.rows.delete(String(new PgDialect().sqlToQuery(sql).params[0]));
    } }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/server/rate-limit", () => ({ checkRate: async () => true }));
vi.mock("@/server/platform-access", () => ({ verifyTotp: async () => fixture.codeValid ? 123 : null }));
vi.mock("@/server/auth-dispatch", () => ({ federatedProviderStamp: async () => fixture.providerStamp, markFederatedProviderVerified: fixture.markVerified }));
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ internalAdapter: { createSession: async () => { fixture.createdSessions++; return fixture.session; } } }) } }));
import { completeFederatedChallenge, createFederatedChallenge } from "@/server/federated-mfa";

beforeEach(() => {
  fixture.rows.clear();
  fixture.markVerified.mockClear();
  Object.assign(fixture, { sessionLive: true, removedSessions: 0, createdSessions: 0, codeValid: true, providerStamp: "configuration-1" });
  fixture.accounts = [{ id: "account-1", providerId: "github", accountId: "subject", password: null }];
  fixture.factor = { secret: "encrypted-factor", verified: true };
  fixture.user.updatedAt = new Date("2026-01-01");
});
const start = () => createFederatedChallenge("user-1", "/app", undefined, undefined, { provider: "github", configStamp: "configuration-1" });
const proofRows = () => [...fixture.rows.values()].filter((r) => r.identifier.startsWith("mfa-session:"));

describe("pending federation authority checks (mocked transactions, not PostgreSQL lock proof)", () => {
  it("consumes a valid challenge once, records assurance, and rejects replay", async () => {
    const token = await start();
    expect(await completeFederatedChallenge(token, "123456")).toEqual({ session: fixture.session, next: "/app" });
    expect(proofRows()).toHaveLength(1);
    expect(fixture.markVerified).toHaveBeenCalledExactlyOnceWith("github", "configuration-1");
    await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
    expect(fixture.createdSessions).toBe(1);
  });

  for (const change of ["provider revoked", "provider rotated", "unlinked", "relinked", "password changed", "factor replaced", "unissued session revoked"] as const) {
    it(`fails closed when ${change} while TOTP is pending`, async () => {
      const token = await start();
      if (change === "provider revoked") fixture.providerStamp = null;
      if (change === "provider rotated") fixture.providerStamp = "configuration-2";
      if (change === "unlinked") fixture.accounts = [];
      if (change === "relinked") fixture.accounts[0]!.id = "new-account-row";
      if (change === "password changed") fixture.accounts[0]!.password = "new-password-hash";
      if (change === "factor replaced") fixture.factor.secret = "replacement-factor";
      if (change === "unissued session revoked") fixture.sessionLive = false;
      await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
      expect(proofRows()).toHaveLength(0);
      expect(fixture.removedSessions).toBe(1);
      expect(fixture.markVerified).not.toHaveBeenCalled();
    });
  }

  it("does not create sessions for invalid codes, recovery or expiry", async () => {
    const token = await start();
    fixture.codeValid = false;
    await expect(completeFederatedChallenge(token, "000000")).rejects.toMatchObject({ status: 403 });
    fixture.codeValid = true;
    fixture.user.updatedAt = new Date("2026-01-02");
    await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
    fixture.user.updatedAt = new Date("2026-01-01");
    for (const row of fixture.rows.values()) row.expiresAt = new Date(0);
    await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
    expect(fixture.createdSessions).toBe(0);
    expect(proofRows()).toHaveLength(0);
  });
});
