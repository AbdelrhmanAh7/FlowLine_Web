/**
 * TEST STACK ONLY: mirrors .env.test's OAuth/billing test values into the platform credential records (the runtime
 * never reads them from the environment). Used by the integration global setup and `pnpm dev:test` (E2E), so suites
 * that are not about onboarding start with the same fake credentials as before. The admin-panel E2E spec enters its
 * own values through the UI.
 *   node scripts/with-env.mjs .env.test npx tsx scripts/test/seed-platform.mts
 */
import { pool } from "@/db";
import { seedPlatformFromTestEnv } from "../../tests/fixtures/platform-seed";

try {
  await seedPlatformFromTestEnv();
  console.log("[seed-platform] test platform credentials ready");
} catch (e) {
  console.error("[seed-platform]", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
