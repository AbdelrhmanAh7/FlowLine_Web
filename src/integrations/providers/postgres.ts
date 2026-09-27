import { Client } from "pg";
import { z } from "zod";
import { EgressError, assertHostAllowed } from "@/server/egress";
import { ProviderError, type ActionDef, type Credentials, type ProviderDef, type ProviderErrorKind } from "../types";

async function connect(creds: Credentials): Promise<Client> {
  const raw = creds.connectionString;
  if (!raw) throw new ProviderError("client", "Postgres connection string is missing");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("client", "Postgres connection string is not a valid URL");
  }
  const port = Number(url.port) || 5432;
  try {
    await assertHostAllowed(url.hostname, port);
  } catch (e) {
    if (e instanceof EgressError) throw new ProviderError("egress_blocked", e.message);
    throw e;
  }
  const sslmode = url.searchParams.get("sslmode");
  const ssl =
    sslmode === "disable"
      ? false
      : sslmode === "require"
        ? { rejectUnauthorized: false }
        : sslmode === "verify-ca" || sslmode === "verify-full"
          ? { rejectUnauthorized: true }
          : undefined;
  const client = new Client({ connectionString: raw, ssl });
  await client.connect();
  return client;
}

function mapPgError(e: unknown): never {
  const err = e as { code?: string; message?: string };
  let kind: ProviderErrorKind = "client";
  if (err.code === "28P01" || err.code === "28000") kind = "auth";
  else if (err.code === "57014") kind = "timeout";
  else if (err.code && ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(err.code)) kind = "network";
  throw new ProviderError(kind, err.message ?? "Postgres error");
}

function rethrow(e: unknown): never {
  if (e instanceof ProviderError) throw e;
  return mapPgError(e);
}

const queryInput = z.object({
  sql: z.string().min(1).max(50_000),
  params: z.array(z.unknown()).max(100).default([]),
});
const queryOutput = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())).max(1000),
  rowCount: z.number().int(),
  truncated: z.boolean(),
});

const query: ActionDef<z.infer<typeof queryInput>, z.infer<typeof queryOutput>> = {
  id: "postgres.query",
  version: 1,
  provider: "postgres",
  title: "Run read-only query",
  description: "Run a SELECT inside a read-only transaction with a 10s timeout",
  input: queryInput,
  output: queryOutput,
  sideEffect: "none",
  requiredScopes: ["read"],
  async run(ctx, input) {
    const client = await connect(ctx.credentials);
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = 10000");
      const res = await client.query(input.sql, input.params);
      const rows = res.rows as Record<string, unknown>[];
      return {
        columns: (res.fields ?? []).map((f) => f.name),
        rows: rows.slice(0, 1000),
        rowCount: res.rowCount ?? rows.length,
        truncated: rows.length > 1000,
      };
    } catch (e) {
      rethrow(e);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    }
  },
};

const executeInput = z.object({
  sql: z.string().min(1).max(50_000),
  params: z.array(z.unknown()).max(100).default([]),
});
const executeOutput = z.object({ rowCount: z.number().int() });

const execute: ActionDef<z.infer<typeof executeInput>, z.infer<typeof executeOutput>> = {
  id: "postgres.execute",
  version: 1,
  provider: "postgres",
  title: "Execute statement",
  description: "Run a write statement in a transaction with a 10s timeout",
  input: executeInput,
  output: executeOutput,
  sideEffect: "non_idempotent",
  sensitive: true,
  requiredScopes: ["write"],
  async run(ctx, input) {
    const client = await connect(ctx.credentials);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = 10000");
      const res = await client.query(input.sql, input.params);
      await client.query("COMMIT");
      return { rowCount: res.rowCount ?? 0 };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      rethrow(e);
    } finally {
      await client.end().catch(() => {});
    }
  },
};

const provider: ProviderDef = {
  id: "postgres",
  name: "PostgreSQL",
  icon: "🐘",
  category: "Database",
  description: "Query and execute SQL against a PostgreSQL database",
  authType: "connection_string",
  apiBase: "postgres://",
  connectFields: [
    { key: "connectionString", label: "Connection string", secret: true, placeholder: "postgres://user:pass@host:5432/db?sslmode=require" },
  ],
  async identity(ctx) {
    const client = await connect(ctx.credentials);
    try {
      const res = await client.query<{ u: string; db: string; port: number }>(
        "SELECT current_user AS u, current_database() AS db, inet_server_port() AS port",
      );
      const row = res.rows[0];
      if (!row) throw new ProviderError("server", "Postgres returned an unexpected identity response");
      return { accountId: `${row.u}@${row.db}`, label: `${row.u}@${row.db}:${row.port}` };
    } catch (e) {
      rethrow(e);
    } finally {
      await client.end().catch(() => {});
    }
  },
  actions: [query, execute],
  verification: {
    adapter: true,
    contractTested: true,
    live: "not_run",
    liveNote: "Verified separately against a local database",
  },
};

export default provider;
