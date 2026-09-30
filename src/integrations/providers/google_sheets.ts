import { z } from "zod";
import type { ProviderDef } from "../types";

const readRangeInput = z.object({
  spreadsheetId: z.string().max(128),
  range: z.string().max(128),
});

const valuesPath = (spreadsheetId: string, range: string) =>
  `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

const provider: ProviderDef = {
  id: "google_sheets",
  name: "Google Sheets",
  icon: "📊",
  category: "Spreadsheets",
  description: "Read ranges and append rows in Google Sheets.",
  authType: "oauth2",
  apiBase: "https://sheets.googleapis.com",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    // The userinfo identity call needs OpenID identity permission as well as Sheets access.
    // email labels the connection; profile and unrelated Drive/Gmail permissions are unnecessary.
    scopes: ["openid", "email", "https://www.googleapis.com/auth/spreadsheets"],
    pkce: true,
    extraParams: { access_type: "offline", prompt: "consent" },
  },
  async identity(ctx) {
    const { data } = await ctx.http.request<{ sub: string; email?: string; name?: string }>({
      method: "GET",
      path: "/oauth2/v3/userinfo",
      baseUrl: "https://www.googleapis.com",
    });
    return { accountId: data.sub, label: data.email ?? data.name ?? data.sub };
  },
  actions: [
    {
      id: "google_sheets.read_range",
      version: 1,
      provider: "google_sheets",
      title: "Read range",
      description: "Read the cell values of a range in a spreadsheet.",
      input: readRangeInput,
      output: z.object({ values: z.array(z.array(z.string())).max(10_000) }),
      sideEffect: "none",
      requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{ values?: string[][] }>({
          method: "GET",
          path: valuesPath(input.spreadsheetId, input.range),
        });
        return { values: data.values ?? [] };
      },
    },
    {
      id: "google_sheets.append_row",
      version: 1,
      provider: "google_sheets",
      title: "Append row",
      description:
        "Append a row to a range. The run's idempotency key is written as the last cell of the row in a column documented as \"flowline_id\".",
      input: readRangeInput.extend({
        row: z.array(z.string().max(2000)).min(1).max(100),
      }),
      output: z.object({
        updatedRange: z.string(),
        updatedRows: z.number(),
        updatedCells: z.number(),
      }),
      sideEffect: "non_idempotent",
      requiredScopes: ["https://www.googleapis.com/auth/spreadsheets"],
      async run(ctx, input) {
        const { data } = await ctx.http.request<{
          updates: { updatedRange: string; updatedRows: number; updatedCells: number };
        }>({
          method: "POST",
          path: `${valuesPath(input.spreadsheetId, input.range)}:append`,
          query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
          json: { values: [[...input.row, ctx.idempotencyKey]] },
        });
        return {
          updatedRange: data.updates.updatedRange,
          updatedRows: data.updates.updatedRows,
          updatedCells: data.updates.updatedCells,
        };
      },
      async verify(ctx, input) {
        const { data } = await ctx.http.request<{ values?: string[][] }>({
          method: "GET",
          path: valuesPath(input.spreadsheetId, input.range),
        });
        const happened = (data.values ?? []).some((row) => row.includes(ctx.idempotencyKey));
        return { happened };
      },
    },
  ],
  verification: {
    adapter: true,
    betaScope: "core",
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
