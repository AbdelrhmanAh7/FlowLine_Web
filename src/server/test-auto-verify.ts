/**
 * TEST ENVIRONMENT ONLY (issue #124): mark new e-mail/password sign-ups as verified, so an automated tester (TestSprite
 * cloud, milestone runs) can run sign-up -> sign-in -> create end to end without reading the mail outbox.
 *
 * Two opt-ins, both honoured ONLY when FLOWLINE_ENV=test (anything else, production, staging and beta included, ignores
 * them, so the switch cannot be turned on there): a stray FLOWLINE_TEST_AUTO_VERIFY var logs ONE warning when auth is
 * built (`warnIfAutoVerifyIgnored`, called from src/lib/auth.ts as the module loads), before any sign-up is handled,
 * admitted, refused or social; the cookie is ignored silently.
 *   - FLOWLINE_TEST_AUTO_VERIFY=1: server-wide, for an external tester that cannot set cookies (exactly "1", nothing else);
 *   - the `fl_test_auto_verify=1` cookie: for one browser context only, like `fl_test_beta_mode` (src/server/beta.ts), so
 *     the shared E2E stack can exercise the switch without changing every other test's sign-up; a tester that cannot
 *     set cookies opens GET /api/test/auto-verify (src/app/api/test/auto-verify/route.ts), which sets it.
 * The cookie grants nothing new: under FLOWLINE_ENV=test GET /api/test/outbox already hands out every verification link.
 * Only POST /sign-up/email is affected; the private-beta admission check still runs first, and social sign-ups keep the
 * provider's verified flag.
 */
export const TEST_AUTO_VERIFY_ENV = "FLOWLINE_TEST_AUTO_VERIFY";
export const TEST_AUTO_VERIFY_COOKIE = "fl_test_auto_verify";

let warned = false;

/** Auth build-time check: logs once per process when FLOWLINE_TEST_AUTO_VERIFY is set where it is ignored. */
export function warnIfAutoVerifyIgnored(env: NodeJS.ProcessEnv = process.env): void {
  if (warned || env.FLOWLINE_ENV === "test" || !env[TEST_AUTO_VERIFY_ENV]) return;
  // Do not print the value; one line per process is enough to find the stray setting.
  console.error(`[config] ${TEST_AUTO_VERIFY_ENV} is ignored: it works only with FLOWLINE_ENV=test. Sign-ups still require e-mail verification.`);
  warned = true;
}

/** Whether a sign-up made with these request headers is marked verified. Pure: the warning is `warnIfAutoVerifyIgnored`. */
export function autoVerifySignUps(headers?: Headers | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FLOWLINE_ENV !== "test") return false;
  if (env[TEST_AUTO_VERIFY_ENV] === "1") return true;
  return /(?:^|;\s*)fl_test_auto_verify=1(?:;|$)/.test(headers?.get("cookie") ?? "");
}
