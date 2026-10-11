/**
 * Issue #113 (CodeQL triage C, part 3/4 of #63): `js/insufficient-password-hash` alerts #10 and #12.
 * Neither hashed value is a password, so both stay SHA-256 and are classified as false positives with a written reason
 * (docs/security/codeql-triage-hashing.md). These tests pin the behaviour that must stay identical and the
 * written reasons at the flagged lines.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const statements: { text: string; params: unknown[] }[] = [];
let stored = 0;
const dialect = new PgDialect();
const tx = {
  async execute(query: SQL) {
    const { sql: text, params } = dialect.sqlToQuery(query);
    statements.push({ text, params });
    return { rows: text.includes("count(*)") ? [{ n: stored }] : [] };
  },
};
vi.mock("@/db", () => ({ db: { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } }));

const { checkRate, checkRunRate, RUNS_PER_MINUTE } = await import("@/server/rate-limit");
const { handleHub, hub, resetHub } = await import("../../e2e/fakes/ai-protocols");

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

beforeEach(() => {
  statements.length = 0;
  stored = 0;
});

describe("rate limit bucket hashing stays identical (alert #12)", () => {
  it("stores and queries the SHA-256 hex of the bucket name, never the name in clear", async () => {
    const bucket = "platform-write:user-army-113";
    const now = new Date("2030-01-01T00:00:00Z");
    await expect(checkRate(bucket, 3, 60, now)).resolves.toBe(true);
    expect(statements).toHaveLength(4);
    const [lock, prune, count, insert] = statements;
    expect(lock!.text).toContain("pg_advisory_xact_lock(hashtextextended(");
    expect(prune!.text).toMatch(/^delete from rate_limit_hit where key = \$1 and at <= \$2$/);
    expect(count!.text).toMatch(/count\(\*\)::int as n from rate_limit_hit where key = \$1 and at > \$2$/);
    expect(insert!.text).toMatch(/^insert into rate_limit_hit \(key, at\) values \(\$1, \$2\)$/);
    for (const s of statements) {
      expect(s.params[0]).toBe(sha256Hex(bucket));
      expect(JSON.stringify(s.params)).not.toContain(bucket);
    }
    expect(prune!.params[1]).toEqual(new Date("2029-12-31T23:59:00Z"));
    expect(insert!.params[1]).toEqual(now);
  });

  it("still allows and records the last hit below the limit", async () => {
    stored = 2;
    await expect(checkRate("bucket-below-limit", 3, 60)).resolves.toBe(true);
    expect(statements.at(-1)!.text).toMatch(/^insert into rate_limit_hit/);
  });

  it("refuses at the limit without recording a hit, and checkRunRate keeps its runs: prefix and 429", async () => {
    stored = 3;
    await expect(checkRate("bucket-at-limit", 3, 60)).resolves.toBe(false);
    expect(statements.some((s) => s.text.startsWith("insert"))).toBe(false);
    statements.length = 0;
    stored = RUNS_PER_MINUTE - 1;
    await expect(checkRunRate("user-army-113")).resolves.toBeUndefined();
    statements.length = 0;
    stored = RUNS_PER_MINUTE;
    await expect(checkRunRate("user-army-113")).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(statements[0]!.params[0]).toBe(sha256Hex("runs:user-army-113"));
  });
});

describe("fake AI hub records a SHA-256 fingerprint of the fake key (alert #10)", () => {
  const call = async (path: string, headers: Record<string, string>) => {
    let status = 0;
    const req = { method: "GET", headers } as unknown as IncomingMessage;
    const res = { writeHead(s: number) { status = s; return this; }, end() { return this; } } as unknown as ServerResponse;
    const ctx = { run: undefined, oaModels: () => [], delegate: () => undefined } as unknown as Parameters<typeof handleHub>[4];
    await expect(handleHub(req, res, new URL(`http://127.0.0.1${path}`), "", ctx)).resolves.toBe(true);
    return status;
  };

  it("accepts only sk-fake- keys and logs a header key only as its SHA-256", async () => {
    resetHub();
    const fakeKey = "sk-fake-army-113";
    const otherKey = "army-113-not-a-fake-key";
    expect(await call("/anthropic/v1/models", { "x-api-key": fakeKey, accept: "application/json" })).toBe(200);
    expect(await call("/gemini/v1beta/models", { "x-goog-api-key": otherKey })).toBe(401);
    expect(hub.requests.map((r) => [r.auth, r.keySha256])).toEqual([
      ["x-api-key", sha256Hex(fakeKey)],
      ["x-goog-api-key", sha256Hex(otherKey)],
    ]);
    expect(hub.requests.map((r) => r.headers)).toEqual([{ accept: "application/json" }, {}]);
    const log = JSON.stringify(hub.requests);
    expect(log).not.toContain(fakeKey);
    expect(log).not.toContain(otherKey);
  });
});

describe("each alert has a written disposition", () => {
  const doc = () => read("docs/security/codeql-triage-hashing.md");
  for (const [alert, file] of [
    ["#10", "e2e/fakes/ai-protocols.ts"],
    ["#12", "src/server/rate-limit.ts"],
  ] as const) {
    it(`alert ${alert} (${file}) is in the triage doc and commented at the flagged line`, () => {
      const row = doc().split("\n").find((line) => line.startsWith(`| ${alert} |`));
      expect(row).toBeDefined();
      expect(row).toContain("`js/insufficient-password-hash`");
      expect(row).toContain(`\`${file}\``);
      expect(row).toContain("false positive");
      expect(read(file)).toContain(`(alert ${alert})`);
      expect(read(file)).toContain("docs/security/codeql-triage-hashing.md");
    });
  }
  it("the triage doc is listed in the docs index", () => {
    expect(read("docs/README.md")).toContain("(security/codeql-triage-hashing.md)");
  });
});
