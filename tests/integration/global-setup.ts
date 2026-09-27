import { execSync } from "node:child_process";
import { Client } from "pg";

/** Integration tests only ever touch the separate flowline_test database. */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/flowline_test(\?|$)/.test(url)) {
    throw new Error(`Integration tests must run against flowline_test (got ${url.replace(/\/\/[^@]*@/, "//***@")}). Use pnpm test:integration.`);
  }
  execSync("npx tsx src/db/migrate.ts", { stdio: "inherit", env: process.env });
  // A live worker (e.g. the E2E stack on :3100) would claim runs these tests enqueue and process themselves.
  const c = new Client({ connectionString: url });
  await c.connect();
  const { rows } = await c.query("select count(*)::int as n from worker_heartbeat where last_seen_at > now() - interval '15 seconds'");
  await c.end();
  if (rows[0].n > 0) throw new Error("A Flowline worker is running against flowline_test. Stop the E2E stack (pnpm dev:test) before pnpm test:integration.");
}
