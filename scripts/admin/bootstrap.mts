/**
 * Platform-admin bootstrap / recovery (docs/security/CREDENTIALS_DESIGN.md MUST 3). Run ON THE HOST by the operator:
 *
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/admin/bootstrap.mts --email admin@example.com
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/admin/bootstrap.mts --email admin@example.com --recover --confirm-recovery
 *   node scripts/with-env.mjs .env.beta npx tsx scripts/admin/bootstrap.mts --email second@example.com --grant
 *
 * Prints a single-use setup code valid for 30 minutes, bound to that email. Only its SHA-256 is stored. Open
 * <FLOWLINE_PUBLIC_URL>/admin/setup and paste it there (it is never put in a URL). Issuing a code cancels any earlier
 * outstanding one. The code grants nothing by itself: the bound identity must verify its email, enrol TOTP and
 * complete setup with a fresh code. Every step is recorded in platform_audit_event.
 *
 * This script never prints or reads service credentials.
 */
import { userInfo } from "node:os";
import { issueChallenge } from "@/server/platform-setup";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (k: string) => process.argv.includes(`--${k}`);

const email = arg("email");
if (!email) {
  console.error("Usage: --email <address> [--recover --confirm-recovery | --grant]");
  process.exit(2);
}
// Guard: the test database is only ever touched by the test stack.
const dbName = (process.env.DATABASE_URL ?? "").split("/").pop()?.split("?")[0] ?? "";
if (/^flowline_test/.test(dbName) && process.env.FLOWLINE_ENV !== "test") {
  console.error("Refusing: DATABASE_URL points at a test database but FLOWLINE_ENV is not 'test'.");
  process.exit(2);
}
const kind = flag("recover") ? "recovery" : flag("grant") ? "grant" : "bootstrap";
if (kind === "recovery" && !flag("confirm-recovery")) {
  console.error("Recovery issues a code that creates a platform admin on an installation that already has one. Re-run with --confirm-recovery.");
  process.exit(2);
}
try {
  const c = await issueChallenge({ email, kind, operator: userInfo().username });
  console.log(`Platform ${kind} code for ${c.email} (expires ${c.expiresAt.toISOString()}):`);
  console.log("");
  console.log(`  ${c.token}`);
  console.log("");
  console.log("Open /admin/setup on this installation and paste the code there. It works once and is not stored in readable form.");
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
