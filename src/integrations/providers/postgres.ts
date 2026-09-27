import { Client } from "pg";
import { z } from "zod";
import { isIP } from "node:net";
import { EgressError, resolveAllowedAddress } from "@/server/egress";
import { ProviderError, type ActionDef, type Credentials, type ProviderDef, type ProviderErrorKind } from "../types";

const ALLOWED_PARAMS = new Set(["sslmode"]);

/**
 * Connects to the validated IP with explicit fields. The raw connection string is never handed
 * to pg: its query parameters (host=, port=, options=…) could otherwise redirect the socket
 * past the egress check, and pg would resolve the name again (DNS rebinding).
 */
async function connect(creds: Credentials, opts: { readOnly?: boolean } = {}): Promise<Client> {
  const raw = creds.connectionString;
  if (!raw) throw new ProviderError("client", "Postgres connection string is missing");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("client", "Postgres connection string is not a valid URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new ProviderError("client", "Use a postgres:// connection string");
  for (const k of url.searchParams.keys()) if (!ALLOWED_PARAMS.has(k)) throw new ProviderError("client", `Connection parameter "${k}" isn't supported`);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port) || 5432;
  let address: string;
  try {
    address = await resolveAllowedAddress(hostname, port);
  } catch (e) {
    if (e instanceof EgressError) throw new ProviderError("egress_blocked", e.message);
    throw new ProviderError("network", `Couldn't resolve ${hostname}`);
  }
  const sslmode = url.searchParams.get("sslmode");
  const servername = isIP(hostname) ? undefined : hostname;
  const ssl =
    sslmode === "disable"
      ? false
      : sslmode === "require"
        ? { rejectUnauthorized: false, servername }
        : sslmode === "verify-ca" || sslmode === "verify-full"
          ? { rejectUnauthorized: true, servername }
          : undefined;
  const client = new Client({
    host: address,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
    ssl,
    connectionTimeoutMillis: 10_000,
    // Server-enforced: every transaction in a read-only session is read-only.
    options: opts.readOnly ? "-c default_transaction_read_only=on" : undefined,
  });
  try {
    await client.connect();
  } catch (e) {
    await client.end().catch(() => {});
    mapPgError(e); // e.g. wrong password → auth, refused/unreachable → network
  }
  return client;
}

/** Extended protocol: exactly one statement per call ("SELECT 1; COMMIT; DELETE …" is rejected). */
function single(client: Client, sql: string, params: unknown[]) {
  return client.query({ text: sql, values: params, queryMode: "extended" } as unknown as { text: string; values: unknown[] });
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
    const client = await connect(ctx.credentials, { readOnly: true });
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = 10000");
      const res = await single(client, input.sql, input.params);
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
      const res = await single(client, input.sql, input.params);
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
    live: "verified",
    liveNote: "Sandbox-live verified against a real PostgreSQL 17 server (tests/live/postgres.test.ts)",
  },
};

export default provider;
