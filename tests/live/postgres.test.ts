import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getAction } from "@/integrations/registry";
import { ProviderError, type ActionContext, type Credentials } from "@/integrations/types";
import { createProviderHttp } from "@/integrations/http";
import { live } from "./record";

/**
 * Sandbox-live check of the Postgres adapter against a real PostgreSQL server
 * (the local Docker database), in a throwaway schema that is dropped afterwards.
 */
const base = new URL(process.env.DATABASE_URL!);
base.hostname = "127.0.0.1";
const port = Number(base.port) || 5432;
process.env.FLOWLINE_EGRESS_ALLOWLIST = [process.env.FLOWLINE_EGRESS_ALLOWLIST, `127.0.0.1:${port}`].filter(Boolean).join(",");
const creds: Credentials = { type: "connection_string", connectionString: base.toString() };
const schemaName = `live_${randomBytes(4).toString("hex")}`;

function ctx(): ActionContext {
  const { provider } = getAction("postgres.query")!;
  const signal = AbortSignal.timeout(20_000);
  return { http: createProviderHttp(provider, creds, signal), credentials: creds, signal, idempotencyKey: randomBytes(8).toString("hex") } as ActionContext;
}
async function run(actionId: string, input: unknown) {
  const { action } = getAction(actionId)!;
  return action.run(ctx(), action.input.parse(input)) as Promise<Record<string, unknown>>;
}

afterAll(async () => {
  await run("postgres.execute", { sql: `DROP SCHEMA IF EXISTS ${schemaName} CASCADE` }).catch(() => {});
});

describe("live Postgres adapter", () => {
  it("execute writes in a transaction; query reads back with parameters", async () => {
    await live(
      "postgres.execute_and_query",
      async () => {
        await run("postgres.execute", { sql: `CREATE SCHEMA ${schemaName}` });
        await run("postgres.execute", { sql: `CREATE TABLE ${schemaName}.kpi (week date, revenue numeric, signups int)` });
        const ins = await run("postgres.execute", { sql: `INSERT INTO ${schemaName}.kpi VALUES ($1, $2, $3), ($4, $5, $6)`, params: ["2026-09-14", 1200.5, 31, "2026-09-21", 1410, 44] });
        expect(ins.rowCount).toBe(2);
        const q = await run("postgres.query", { sql: `SELECT week::text, revenue::float8 AS revenue, signups FROM ${schemaName}.kpi WHERE signups > $1 ORDER BY week`, params: [30] });
        expect(q.columns).toEqual(["week", "revenue", "signups"]);
        expect(q.rows).toEqual([
          { week: "2026-09-14", revenue: 1200.5, signups: 31 },
          { week: "2026-09-21", revenue: 1410, signups: 44 },
        ]);
        return q;
      },
      (q) => ({ rowCount: q.rowCount }),
    );
  });

  it("query runs read-only: writes are refused by the server", async () => {
    await live("postgres.query_read_only", async () => {
      const err = await run("postgres.query", { sql: `INSERT INTO ${schemaName}.kpi VALUES ('2026-09-28', 1, 1)` }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ProviderError);
      expect(String((err as Error).message)).toMatch(/read-only/i);
      const q = await run("postgres.query", { sql: `SELECT count(*)::int AS n FROM ${schemaName}.kpi` });
      expect(q.rows).toEqual([{ n: 2 }]);
      return true;
    });
  });

  it("wrong password is an auth error, not a crash", async () => {
    await live("postgres.auth_error", async () => {
      const bad = new URL(creds.connectionString!);
      bad.password = "definitely-wrong";
      const { action } = getAction("postgres.query")!;
      const c = { ...ctx(), credentials: { type: "connection_string", connectionString: bad.toString() } } as ActionContext;
      const err = await action.run(c, action.input.parse({ sql: "select 1" })).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("auth");
      return true;
    });
  });
});
