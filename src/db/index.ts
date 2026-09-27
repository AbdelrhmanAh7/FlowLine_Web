import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { flowlinePool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  const p = new Pool({
    connectionString: url,
    max: 8,
    // Fail fast and recover instead of hanging when a connection is silently dropped
    // (e.g. a Docker port-proxy reset): detect dead sockets, bound connect and query time.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 30_000,
  });
  // A broken idle client is discarded by the pool; without a listener the error would crash the process.
  p.on("error", (e) => console.error("[db] idle connection error:", e.message));
  return p;
}

// Reuse one pool across Next.js dev hot reloads.
export const pool = globalForDb.flowlinePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.flowlinePool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
