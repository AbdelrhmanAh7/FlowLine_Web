import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { flowlinePool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  return new Pool({ connectionString: url, max: 8 });
}

// Reuse one pool across Next.js dev hot reloads.
export const pool = globalForDb.flowlinePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.flowlinePool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
