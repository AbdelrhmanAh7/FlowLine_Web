import { z } from "zod";
import { ProviderError, type ActionDef, type Credentials, type ProviderDef } from "../types";

const TOKEN_TYPE_HEADER = { "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN" };

function base(creds: Credentials): string {
  const url = creds.settings?.accountUrl;
  if (!url) throw new ProviderError("client", "Snowflake account URL is missing");
  // Only a Snowflake account origin: the access token must not be sent anywhere else.
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ProviderError("client", "Snowflake account URL is not a valid URL");
  }
  if (u.protocol !== "https:" || !/^[a-z0-9][a-z0-9.-]*\.snowflakecomputing\.com$/i.test(u.hostname) || u.username || u.password || (u.pathname !== "/" && u.pathname !== "")) {
    throw new ProviderError("client", "Snowflake account URL must look like https://<account>.snowflakecomputing.com");
  }
  return u.origin;
}

const READONLY_KEYWORDS = new Set(["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"]);

function assertReadOnly(statement: string): void {
  const stripped = statement
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
  if (!stripped) throw new ProviderError("client", "Statement is empty after removing SQL comments");
  const keyword = /^[A-Za-z]+/.exec(stripped)?.[0]?.toUpperCase();
  if (!keyword || !READONLY_KEYWORDS.has(keyword)) {
    throw new ProviderError("client", "snowflake.query is read-only: only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN are allowed");
  }
  if (/;\s*\S/.test(stripped)) throw new ProviderError("client", "Multiple statements are not allowed");
}

const queryInput = z.object({
  statement: z.string().min(1).max(10_000),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
});
const queryOutput = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())).max(1000),
  rowCount: z.number().int(),
  truncated: z.boolean(),
});

interface StatementResult {
  resultSetMetaData?: { rowType?: { name?: string }[] };
  data?: unknown[][];
}

const query: ActionDef<z.infer<typeof queryInput>, z.infer<typeof queryOutput>> = {
  id: "snowflake.query",
  version: 1,
  provider: "snowflake",
  title: "Run query",
  description: "Run a read-only SQL statement and return rows",
  input: queryInput,
  output: queryOutput,
  sideEffect: "none",
  requiredScopes: ["statements:execute"],
  async run(ctx, input) {
    assertReadOnly(input.statement);
    const res = await ctx.http.request<StatementResult>({
      method: "POST",
      path: "/api/v2/statements",
      baseUrl: base(ctx.credentials),
      headers: TOKEN_TYPE_HEADER,
      json: { statement: input.statement, timeout: input.timeoutSeconds ?? 30, parameters: { MULTI_STATEMENT_COUNT: "1" } }, // server-enforced single statement
    });
    const data = res.data.data ?? [];
    return {
      columns: (res.data.resultSetMetaData?.rowType ?? []).map((c) => c.name ?? ""),
      rows: data.slice(0, 1000),
      rowCount: data.length,
      truncated: data.length > 1000,
    };
  },
};

const provider: ProviderDef = {
  id: "snowflake",
  name: "Snowflake",
  icon: "❄️",
  category: "Data warehouse",
  description: "Run read-only SQL queries against a Snowflake warehouse",
  authType: "api_key",
  apiBase: "https://account.snowflakecomputing.com",
  connectFields: [
    { key: "accountUrl", label: "Account URL", secret: false, placeholder: "https://<acct>.snowflakecomputing.com" },
    { key: "token", label: "Programmatic access token", secret: true },
  ],
  async identity(ctx) {
    const res = await ctx.http.request<{ data?: [string, string][] }>({
      method: "POST",
      path: "/api/v2/statements",
      baseUrl: base(ctx.credentials),
      headers: TOKEN_TYPE_HEADER,
      json: { statement: "SELECT CURRENT_USER(), CURRENT_ACCOUNT()" },
    });
    const row = res.data.data?.[0];
    if (!row) throw new ProviderError("server", "Snowflake returned an unexpected identity response");
    const [user, account] = row;
    return { accountId: `${user}@${account}`, label: `${user}@${account}` };
  },
  actions: [query],
  verification: {
    adapter: true,
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
