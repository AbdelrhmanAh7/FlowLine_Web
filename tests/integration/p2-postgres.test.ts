import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProviderHttp } from "@/integrations/http";
import { getAction } from "@/integrations/registry";
import { ProviderError, type ActionContext, type Credentials } from "@/integrations/types";

/** Postgres adapter against the real test database: egress binding and single-statement guarantees. */
const PG = new URL(process.env.DATABASE_URL!);
PG.hostname = "127.0.0.1";
const port = Number(PG.port) || 5432;
const prevAllow = process.env.FLOWLINE_EGRESS_ALLOWLIST;
const schemaName = `pgt_${randomBytes(4).toString("hex")}`;

const credsFor = (connectionString: string): Credentials => ({ type: "connection_string", connectionString });
const good = credsFor(PG.toString());

async function run(actionId: string, input: unknown, creds = good) {
  const { provider, action } = getAction(actionId)!;
  const signal = AbortSignal.timeout(20_000);
  const ctx = { http: createProviderHttp(provider, creds, signal), credentials: creds, signal, idempotencyKey: randomBytes(6).toString("hex"), log: () => {} } as ActionContext;
  return action.run(ctx, action.input.parse(input)) as Promise<Record<string, unknown>>;
}
async function failure(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ProviderError);
  return e as ProviderError;
}

beforeAll(async () => {
  process.env.FLOWLINE_EGRESS_ALLOWLIST = [prevAllow, `127.0.0.1:${port}`].filter(Boolean).join(",");
  await run("postgres.execute", { sql: `CREATE SCHEMA ${schemaName}` });
  await run("postgres.execute", { sql: `CREATE TABLE ${schemaName}.t (id int)` });
  await run("postgres.execute", { sql: `INSERT INTO ${schemaName}.t VALUES (1), (2)` });
});
afterAll(async () => {
  await run("postgres.execute", { sql: `DROP SCHEMA IF EXISTS ${schemaName} CASCADE` }).catch(() => {});
  process.env.FLOWLINE_EGRESS_ALLOWLIST = prevAllow;
});

const count = async () => ((await run("postgres.query", { sql: `SELECT count(*)::int AS n FROM ${schemaName}.t` })).rows as { n: number }[])[0]!.n;

describe("postgres.query is read-only and single-statement", () => {
  it.each([
    `SELECT 1; COMMIT; DELETE FROM ${"%s"}.t; COMMIT`,
    `SELECT 1; COMMIT; DELETE FROM ${"%s"}.t; BEGIN`,
    `SELECT 1; DELETE FROM ${"%s"}.t`,
  ])("rejects stacked statements: %s", async (tpl) => {
    await failure(run("postgres.query", { sql: tpl.replaceAll("%s", schemaName) }));
    expect(await count()).toBe(2);
  });

  it("rejects writes even when the statement ends the transaction first", async () => {
    await failure(run("postgres.query", { sql: `DELETE FROM ${schemaName}.t` }));
    await failure(run("postgres.query", { sql: "COMMIT" }).then(() => run("postgres.query", { sql: `DELETE FROM ${schemaName}.t` })));
    expect(await count()).toBe(2);
  });

  it("postgres.execute also runs exactly one statement", async () => {
    await failure(run("postgres.execute", { sql: `INSERT INTO ${schemaName}.t VALUES (3); DROP TABLE ${schemaName}.t` }));
    expect(await count()).toBe(2);
  });
});

describe("the connection target is the validated address", () => {
  it.each([
    ["host= query parameter", `postgres://u:p@example.com:5432/db?host=169.254.169.254`],
    ["port= query parameter", `postgres://u:p@example.com:5432/db?port=5433`],
    ["options= query parameter", `postgres://u:p@example.com:5432/db?options=-c%20search_path%3Devil`],
    ["unix socket", `socket:/var/run/postgresql?db=flowline`],
    ["empty host", `postgres://u:p@/db`],
  ])("refuses %s before connecting", async (_name, cs) => {
    const e = await failure(run("postgres.query", { sql: "select 1" }, credsFor(cs)));
    expect(e.message).toMatch(/isn't supported|Use a postgres|host name is required|not a valid URL/);
  });

  it.each([
    ["metadata address", "postgres://u:p@169.254.169.254:5432/db"],
    ["loopback (not allowlisted port)", "postgres://u:p@127.0.0.1:6543/db"],
    ["private network", "postgres://u:p@10.0.0.5:5432/db"],
  ])("blocks %s", async (_name, cs) => {
    const e = await failure(run("postgres.query", { sql: "select 1" }, credsFor(cs)));
    expect(e.kind).toBe("egress_blocked");
  });
});
