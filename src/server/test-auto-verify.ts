import { testFeaturesEnabled } from "@/server/faults";

/**
 * TEST ENVIRONMENT ONLY (issue #124): mark new e-mail/password sign-ups as verified, so an automated tester (TestSprite
 * cloud, milestone runs) can run sign-up -> sign-in -> create end to end without reading the mail outbox.
 *
 * Two opt-ins, both honoured ONLY when FLOWLINE_ENV=test (anything else, production, staging and beta included, ignores
 * them, so the switch cannot be turned on there). Outside test, a set FLOWLINE_TEST_AUTO_VERIFY var stops the Next.js
 * server at start-up (`assertAutoVerifyAllowed`, called from register() in src/instrumentation.ts), so no beta or
 * production server runs with it; code that builds auth without that server (scripts, tests) logs ONE warning instead
 * (`warnIfAutoVerifyIgnored`, called from src/lib/auth.ts as the module loads) and still ignores it. The cookie is
 * ignored silently.
 *   - FLOWLINE_TEST_AUTO_VERIFY=1: server-wide, for an external tester that cannot set cookies (exactly "1", nothing else;
 *     `isAutoVerifyEnabled`). It also turns off better-auth's requireEmailVerification for that stack (src/lib/auth.ts);
 *   - the `fl_test_auto_verify=1` cookie: for one browser context only, like `fl_test_beta_mode` (src/server/beta.ts), so
 *     the shared E2E stack can exercise the switch without changing every other test's sign-up. A tester sets it with the
 *     browser's own cookie API or, if it can only navigate (the hub verifier), by opening GET /api/test/auto-verify
 *     (src/app/api/test/auto-verify/route.ts, also test-only), which sets it and continues to /sign-up.
 * The cookie grants nothing new while the test stack's mail goes to the DB outbox (its default when no provider is set
 * in the platform panel, src/server/email/index.ts): GET /api/test/outbox already hands out every verification link.
 * Only POST /sign-up/email is affected; the private-beta admission check still runs first, and social sign-ups keep the
 * provider's verified flag.
 */
export const TEST_AUTO_VERIFY_ENV = "FLOWLINE_TEST_AUTO_VERIFY";
export const TEST_AUTO_VERIFY_COOKIE = "fl_test_auto_verify";

let warned = false;

/** The server-wide switch: on only with FLOWLINE_ENV=test and FLOWLINE_TEST_AUTO_VERIFY exactly "1" (never the cookie). */
export function isAutoVerifyEnabled(): boolean {
  return testFeaturesEnabled() && process.env[TEST_AUTO_VERIFY_ENV] === "1";
}

/** FLOWLINE_TEST_AUTO_VERIFY has a value where it is never honoured: any FLOWLINE_ENV but test. */
function setOutsideTest(): boolean {
  return !testFeaturesEnabled() && Boolean(process.env[TEST_AUTO_VERIFY_ENV]);
}

/**
 * Start-up check (src/instrumentation.ts): throws when FLOWLINE_TEST_AUTO_VERIFY has any value outside FLOWLINE_ENV=test,
 * so `next start` exits before serving a request. The variable is test-only, so it must not be set there at all.
 */
export function assertAutoVerifyAllowed(): void {
  // Do not print the value.
  if (setOutsideTest()) throw new Error(`[config] ${TEST_AUTO_VERIFY_ENV} is test-only and FLOWLINE_ENV is not test: refusing to start. Unset ${TEST_AUTO_VERIFY_ENV}.`);
}

/** Auth build-time check: logs once per process when FLOWLINE_TEST_AUTO_VERIFY is set where it is ignored. */
export function warnIfAutoVerifyIgnored(): void {
  if (warned || !setOutsideTest()) return;
  // Do not print the value; one line per process is enough to find the stray setting.
  console.error(`[config] ${TEST_AUTO_VERIFY_ENV} is ignored: it works only with FLOWLINE_ENV=test. Sign-ups still require e-mail verification.`);
  warned = true;
}

/** Whether a sign-up made with these request headers is marked verified. Pure: the warning is `warnIfAutoVerifyIgnored`. */
export function autoVerifySignUps(headers?: Headers | null): boolean {
  return isAutoVerifyEnabled() || (testFeaturesEnabled() && /(?:^|;\s*)fl_test_auto_verify=1(?:;|$)/.test(headers?.get("cookie") ?? ""));
}
