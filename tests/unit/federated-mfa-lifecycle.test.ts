import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const fixture = vi.hoisted(() => ({
  user: { id: "user-1", email: "user-1@example.test", twoFactorEnabled: true, updatedAt: new Date("2026-01-01"), emailVerified: true },
  factor: { secret: "encrypted-factor", verified: true },
  accounts: [{ id: "account-1", providerId: "github", accountId: "subject", password: null as string | null }],
  rows: new Map<string, { id: string; identifier: string; value: string; expiresAt: Date }>(),
  session: { token: "unissued-token", userId: "user-1", expiresAt: new Date("2099-01-01") },
  sessionLive: true, removedSessions: 0, providerStamp: "configuration-1" as string | null,
  codeValid: true, totpStep: 123, createdSessions: 0,
  markVerified: vi.fn(async () => {}),
  audits: [] as { action: string; data: { reason?: string } }[],
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
    insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (row: { id: string; identifier: string; value: string; expiresAt: Date }) => {
      if (getTableName(table) === "platform_audit_event") {
        const record = async () => { fixture.audits.push(row as unknown as (typeof fixture.audits)[number]); return [{ id: fixture.audits.length }]; };
        return { returning: record, then: (...args: Parameters<Promise<unknown[]>["then"]>) => record().then(...args) };
      }
      const save = async () => { fixture.rows.set(row.id, row); };
      // The replay marker is a conditional upsert (`set ... where value < step`) that reports whether it updated a row;
      // everything else is an unconditional upsert. This models, but does not prove, the SQL (see federated-totp-replay.test.ts).
      const upsert = async () => {
        const existing = fixture.rows.get(row.id);
        if (row.id.startsWith("totp-step:") && existing && Number(existing.value) >= Number(row.value)) return [];
        fixture.rows.set(row.id, row);
        return [{ id: row.id }];
      };
      return {
        then: (...args: Parameters<Promise<void>["then"]>) => save().then(...args),
        onConflictDoUpdate: () => ({ returning: upsert, then: (...args: Parameters<Promise<unknown[]>["then"]>) => upsert().then(...args) }),
      };
    } }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({ where: (sql: SQL) => {
      const { params } = new PgDialect().sqlToQuery(sql);
      const run = async () => {
        if (getTableName(table) === "session") { fixture.removedSessions++; return []; }
        if (params.length === 1) { fixture.rows.delete(String(params[0])); return []; }
        // (identifier, cutoff): an expired pending challenge is consumed once and returned for its failure audit.
        const gone = [...fixture.rows.values()].filter((r) => r.identifier === params[0] && r.expiresAt <= new Date());
        for (const r of gone) fixture.rows.delete(r.id);
        return gone;
      };
      return { returning: run, then: (...args: Parameters<Promise<unknown[]>["then"]>) => run().then(...args) };
    } }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(db),
  };
  return { db, schema: await import("@/db/schema") };
});
vi.mock("@/server/rate-limit", () => ({ checkRate: async () => true }));
vi.mock("@/server/platform-access", () => ({ verifyTotp: async () => fixture.codeValid ? fixture.totpStep : null }));
vi.mock("@/server/auth-dispatch", () => ({ federatedProviderStamp: async () => fixture.providerStamp, markFederatedProviderVerified: fixture.markVerified }));
vi.mock("@/lib/auth", () => ({ auth: { $context: Promise.resolve({ internalAdapter: { createSession: async () => { fixture.createdSessions++; return fixture.session; } } }) } }));
import { completeFederatedChallenge, createFederatedChallenge } from "@/server/federated-mfa";

beforeEach(() => {
  fixture.rows.clear();
  fixture.markVerified.mockClear();
  fixture.audits = [];
  Object.assign(fixture, { sessionLive: true, removedSessions: 0, createdSessions: 0, codeValid: true, totpStep: 123, providerStamp: "configuration-1" });
  fixture.accounts = [{ id: "account-1", providerId: "github", accountId: "subject", password: null }];
  fixture.factor = { secret: "encrypted-factor", verified: true };
  fixture.user.updatedAt = new Date("2026-01-01");
});
const start = () => createFederatedChallenge("user-1", "/app", undefined, undefined, { provider: "github", configStamp: "configuration-1" });
const proofRows = () => [...fixture.rows.values()].filter((r) => r.identifier.startsWith("mfa-session:"));
const stepMarker = () => fixture.rows.get("totp-step:user-1")?.value;
const auditReasons = () => fixture.audits.map((a) => `${a.action}:${a.data.reason}`);

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
    expect(auditReasons()).toEqual(["signin.mfa_failed:invalid_code"]);
    fixture.codeValid = true;
    fixture.user.updatedAt = new Date("2026-01-02");
    await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
    fixture.user.updatedAt = new Date("2026-01-01");
    for (const row of fixture.rows.values()) row.expiresAt = new Date(0);
    await expect(completeFederatedChallenge(token, "123456")).rejects.toMatchObject({ status: 401 });
    expect(fixture.createdSessions).toBe(0);
    expect(proofRows()).toHaveLength(0);
    // Recovery (a changed user stamp) is an authority refusal, not an MFA failure; expiry is audited once.
    expect(auditReasons()).toEqual(["signin.mfa_failed:invalid_code", "signin.mfa_failed:expired"]);
  });
});

describe("TOTP replay guard (mocked transactions; the SQL is checked in federated-totp-replay.test.ts and PostgreSQL concurrency in CI)", () => {
  it("accepts a code once: the same step is refused for a fresh challenge and the unissued session is removed", async () => {
    expect(await completeFederatedChallenge(await start(), "123456")).toMatchObject({ next: "/app" });
    expect(stepMarker()).toBe("123");
    expect(proofRows()).toHaveLength(1);
    await expect(completeFederatedChallenge(await start(), "123456")).rejects.toMatchObject({ status: 403, code: "FEDERATED_MFA_CODE_INVALID" });
    expect(fixture.createdSessions).toBe(2);
    expect(fixture.removedSessions).toBe(1);
    expect(proofRows()).toHaveLength(1);
    expect(fixture.markVerified).toHaveBeenCalledTimes(1);
    expect(auditReasons()).toEqual(["signin.mfa_failed:replayed_code"]);
  });

  it("refuses an older step after a newer one, accepts the next step, and keeps the highest step", async () => {
    fixture.totpStep = 124;
    await completeFederatedChallenge(await start(), "123456");
    fixture.totpStep = 123;
    await expect(completeFederatedChallenge(await start(), "123456")).rejects.toMatchObject({ status: 403, code: "FEDERATED_MFA_CODE_INVALID" });
    expect(stepMarker()).toBe("124");
    fixture.totpStep = 125;
    await completeFederatedChallenge(await start(), "123456");
    expect(stepMarker()).toBe("125");
  });

  it("does not burn a code when authority fails, so the user's next attempt with the same code still works", async () => {
    const stale = await start();
    fixture.providerStamp = "configuration-2";
    await expect(completeFederatedChallenge(stale, "123456")).rejects.toMatchObject({ status: 401 });
    expect(stepMarker()).toBeUndefined();
    fixture.providerStamp = "configuration-1";
    await expect(completeFederatedChallenge(await start(), "123456")).resolves.toMatchObject({ next: "/app" });
    expect(stepMarker()).toBe("123");
  });

  it("does not record a step for an invalid code", async () => {
    const token = await start();
    fixture.codeValid = false;
    await expect(completeFederatedChallenge(token, "000000")).rejects.toMatchObject({ status: 403 });
    expect(stepMarker()).toBeUndefined();
  });
});
