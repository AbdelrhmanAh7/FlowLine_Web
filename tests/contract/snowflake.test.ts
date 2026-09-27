import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectProviderError, makeCtx, provider, runAction, snowflakeCreds, startFake, type Fake } from "./helpers";

const p = provider("snowflake");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("snowflake identity", () => {
  it("runs CURRENT_USER()/CURRENT_ACCOUNT() with the PAT token-type header", async () => {
    const id = await p.identity(makeCtx(p, snowflakeCreds));
    expect(id).toEqual({ accountId: "FLOWLINE_USER@XY12345", label: "FLOWLINE_USER@XY12345" });
    const r = await fake.lastRequest("snowflake");
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/api/v2/statements");
    expect(r.headers["x-snowflake-authorization-token-type"]).toBe("PROGRAMMATIC_ACCESS_TOKEN");
    expect((r.body as { statement: string }).statement).toBe("SELECT CURRENT_USER(), CURRENT_ACCOUNT()");
  });
});

describe("snowflake.query", () => {
  it("runs a read-only query and returns columns and rows", async () => {
    const out = await runAction<{ columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean }>(
      "snowflake.query",
      makeCtx(p, snowflakeCreds),
      { statement: "SELECT INVOICE_ID, TOTAL FROM INVOICES" },
    );
    expect(out.columns).toEqual(["INVOICE_ID", "TOTAL"]);
    expect(out.rows).toHaveLength(2);
    expect(out.rowCount).toBe(2);
    expect(out.truncated).toBe(false);
    const r = await fake.lastRequest("snowflake");
    expect((r.body as { statement: string; timeout: number }).timeout).toBe(30);
  });

  it.each([
    "DELETE FROM invoices",
    "select 1; drop table invoices",
    "INSERT INTO invoices VALUES (1)",
    "  -- comment\n DELETE FROM invoices",
    "/* sneaky */ UPDATE invoices SET total = 0",
  ])("read-only guard rejects %j without sending any request", async (statement) => {
    await fake.reset();
    await expectProviderError(runAction("snowflake.query", makeCtx(p, snowflakeCreds), { statement }), "client");
    expect(await fake.requests("snowflake")).toHaveLength(0);
  });

  it.each(["SELECT 1;", "WITH x AS (SELECT 1) SELECT * FROM x", "show tables", "describe table invoices", "EXPLAIN SELECT 1"])(
    "read-only guard allows %j",
    async (statement) => {
      const out = await runAction<{ rowCount: number }>("snowflake.query", makeCtx(p, snowflakeCreds), { statement });
      expect(out.rowCount).toBeGreaterThan(0);
    },
  );
});
