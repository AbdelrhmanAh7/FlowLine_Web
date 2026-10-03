import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
vi.mock("@/db", async () => ({ db: {}, schema: await import("@/db/schema") }));
import * as schema from "@/db/schema";
import { totpStepUpsert } from "@/server/federated-mfa";
import { TOTP_PERIOD } from "@/server/totp";

// A connection-less drizzle instance renders the exact statement the gates run, so the replay predicate and its
// atomicity (one conditional upsert, no read-then-write) are checked without PostgreSQL. Concurrent behaviour is
// confirmed by tests/integration/sec-federated-totp.test.ts in CI.
const db = drizzle.mock({ schema }) as unknown as Parameters<typeof totpStepUpsert>[0];

describe("federated TOTP replay marker statement", () => {
  const { sql, params } = totpStepUpsert(db, "user-1", 59_000_000).toSQL();

  it("is a single conditional upsert that only advances to a strictly newer step", () => {
    expect(sql).toMatch(/^insert into "verification"/);
    expect(sql).toMatch(/on conflict \("id"\) do update set /);
    expect(sql).toMatch(/where \("verification"\."value"\)::bigint < \$\d+::bigint/);
    expect(sql).toMatch(/returning "id"$/);
    expect(sql.match(/\binsert\b/g)).toHaveLength(1);
  });

  it("is keyed per user and carries the step as the only comparable value", () => {
    expect(params).toContain("totp-step:user-1");
    expect(params.filter((p) => p === "59000000")).toHaveLength(2);
    expect(params).toContain(59_000_000);
  });

  it("keeps the marker until no code at or below the step can still verify", () => {
    // Codes are accepted for step-1..step+1, so a step-N code is last acceptable before (N+2) periods have elapsed.
    const lastAcceptable = (59_000_000 + 2) * TOTP_PERIOD * 1000;
    const expiry = new Date((59_000_000 + 3) * TOTP_PERIOD * 1000);
    expect(expiry.getTime()).toBeGreaterThan(lastAcceptable);
    expect(params.filter((p) => p === expiry.toISOString())).toHaveLength(2);
  });
});
