import { execSync } from "node:child_process";

/** Integration tests only ever touch the separate flowline_test database. */
export default function setup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/flowline_test(\?|$)/.test(url)) {
    throw new Error(`Integration tests must run against flowline_test (got ${url.replace(/\/\/[^@]*@/, "//***@")}). Use pnpm test:integration.`);
  }
  execSync("npx tsx src/db/migrate.ts", { stdio: "inherit", env: process.env });
}
