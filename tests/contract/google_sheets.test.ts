import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCtx, oauthCreds, provider, queryOf, runAction, runVerify, startFake, type Fake } from "./helpers";

const p = provider("google_sheets");

let fake: Fake;
beforeAll(async () => {
  fake = await startFake();
});
afterAll(async () => {
  await fake.close();
});

describe("google_sheets identity", () => {
  it("requests userinfo identity and read/write Sheets access without unrelated permissions", () => {
    // External contract: https://developers.google.com/identity/openid-connect/openid-connect
    // UserInfo supplies sub through OpenID; email is optional and needs its own scope.
    const scopes = p.oauth!.scopes;
    expect(new Set(scopes)).toEqual(new Set(["openid", "email", "https://www.googleapis.com/auth/spreadsheets"]));
    expect(scopes).toHaveLength(3);
    // Identity permissions must not become requirements for executing already-authorized Sheet actions.
    for (const action of p.actions) {
      expect(action.requiredScopes).toEqual(["https://www.googleapis.com/auth/spreadsheets"]);
    }
  });

  it("returns the account from userinfo (via the googleapis base override)", async () => {
    const id = await p.identity(makeCtx(p, oauthCreds));
    expect(id).toEqual({ accountId: "user-alice-1", label: "alice@flowline.test" });
    const r = await fake.lastRequest("google_sheets");
    expect(r.method).toBe("GET");
    expect(r.path).toBe("/oauth2/v3/userinfo");
    expect(r.headers["x-auth-scheme"]).toBe("bearer");
  });

  it("keeps the stable Google subject when optional email/profile claims are withheld", async () => {
    const ctx = makeCtx(p, oauthCreds);
    ctx.http.request = async <T>() => ({ data: { sub: "subject-without-email" } as T, status: 200, headers: new Headers() });
    expect(await p.identity(ctx)).toEqual({ accountId: "subject-without-email", label: "subject-without-email" });
  });
});

describe("google_sheets.read_range", () => {
  it("GETs the values endpoint and returns rows", async () => {
    const out = await runAction<{ values: string[][] }>("google_sheets.read_range", makeCtx(p, oauthCreds), {
      spreadsheetId: "sheet-1",
      range: "Sheet1!A1:E10",
    });
    expect(out.values[0]).toEqual(["Invoice ID", "Vendor", "Total", "Due", "flowline_id"]);
    expect(out.values).toHaveLength(2);
    const r = await fake.lastRequest("google_sheets");
    expect(r.method).toBe("GET");
    expect(r.path).toBe(`/v4/spreadsheets/sheet-1/values/${encodeURIComponent("Sheet1!A1:E10")}`);
  });
});

describe("google_sheets.append_row", () => {
  it("appends the row with the idempotency key as the last cell, and verify finds it", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const input = { spreadsheetId: "sheet-1", range: "Sheet1!A1:E10", row: ["INV-003", "Globex", "300.00", "2026-11-01"] };
    const out = await runAction<{ updatedRange: string; updatedRows: number; updatedCells: number }>(
      "google_sheets.append_row",
      ctx,
      input,
    );
    expect(out.updatedRows).toBe(1);
    expect(out.updatedCells).toBe(5); // 4 cells + idempotency key

    const r = await fake.lastRequest("google_sheets");
    expect(r.method).toBe("POST");
    expect(r.path).toBe(`/v4/spreadsheets/sheet-1/values/${encodeURIComponent("Sheet1!A1:E10")}:append`);
    expect(queryOf(r).get("valueInputOption")).toBe("USER_ENTERED");
    expect(queryOf(r).get("insertDataOption")).toBe("INSERT_ROWS");
    const body = r.body as { values: string[][] };
    expect(body.values[0]).toEqual([...input.row, ctx.idempotencyKey]);

    const state = await fake.state<{ sheets: Record<string, string[][]> }>("google_sheets");
    const appended = state.sheets["sheet-1"].at(-1)!;
    expect(appended.at(-1)).toBe(ctx.idempotencyKey);

    const v = await runVerify("google_sheets.append_row", ctx, input);
    expect(v.happened).toBe(true);
  });

  it("verify reports happened:false for a key that was never appended", async () => {
    const ctx = makeCtx(p, oauthCreds);
    const v = await runVerify("google_sheets.append_row", ctx, {
      spreadsheetId: "sheet-1",
      range: "Sheet1!A1:E10",
      row: ["X", "Y", "0", "2026-01-01"],
    });
    expect(v.happened).toBe(false);
  });
});
