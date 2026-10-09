import { defineConfig, devices } from "@playwright/test";
import { applyTestStackEnv } from "./scripts/test-stack.cjs";

// Fake-provider URLs (and the rest of the test-stack settings) come from .env.test, like the stack itself.
try {
  process.loadEnvFile(".env.test");
} catch {
  /* no .env.test: defaults apply */
}
// Which stack this run targets: FLOWLINE_TEST_PORT / _FAKE_PORT / _AI_PORT / _DB (defaults 3100 / 4010 / 4011 /
// flowline_test), derived exactly as scripts/dev-test.mjs does. Applied to process.env so the webServer command and
// scripts that specs shell out to (e.g. admin-panel's bootstrap) use this stack's database and URLs. Specs read the
// values from e2e/stack.ts.
const STACK = applyTestStackEnv(process.env);
export const BASE_URL = STACK.baseUrl;
// A sharded run (FLOWLINE_TEST_SHARD) keeps its outputs apart from the other shards' (Playwright empties outputDir).
const OUT_SUFFIX = STACK.shard ? `-${STACK.shard}` : "";

/**
 * Flowline is Arabic-first (no `fl_locale` cookie = Arabic, RTL). The existing suites are written against the
 * English UI, so every context starts with `fl_locale=en`; `e2e/arabic.spec.ts` clears it to test the default.
 * Contexts created by hand with `browser.newContext()` don't inherit `use` options — pass `storageState: EN_STATE`.
 * Registration fixtures use the existing test-only beta cookie instead of global beta mode, which would disable
 * development-only Company Builder trials. Production ignores this cookie; beta specs override it per context.
 */
const OPEN_BETA_COOKIE = { name: "fl_test_beta_mode", value: "open", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const };
// The landing demo (#100) reads public/media/demo/manifest.json; specs other than e2e/landing-demo.spec.ts test the legacy hero, so they
// ignore a real manifest with this test-only cookie (`fixture` switches to e2e/fixtures/demo, set by that spec). Production ignores it.
const NO_DEMO_COOKIE = { name: "fl_test_demo", value: "off", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const };
export const AR_STATE = { cookies: [OPEN_BETA_COOKIE, NO_DEMO_COOKIE], origins: [] };
export const EN_STATE = {
  cookies: [OPEN_BETA_COOKIE, NO_DEMO_COOKIE, { name: "fl_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

/**
 * E2E runs against a separate test server (FLOWLINE_ENV=test, flowline_test DB,
 * .next-test build dir) so it never touches dev data. Workers are capped to keep
 * laptop load low.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  ...(STACK.shard ? { outputDir: `test-results/shard${OUT_SUFFIX}` } : {}),
  reporter: [["list"], ["html", { outputFolder: `playwright-report${OUT_SUFFIX}`, open: "never" }], ["json", { outputFile: `test-results/results${OUT_SUFFIX}.json` }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: { origin: BASE_URL },
    storageState: EN_STATE,
    // Stability: CSS/motion animations are off everywhere except the @cross-browser spec that opts back in.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Critical journeys (@critical) and cross-browser monitors (@cross-browser) also run on Firefox and WebKit (p3§22).
    { name: "firefox", grep: /@critical|@cross-browser/, use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", grep: /@critical|@cross-browser/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // dev-test.mjs creates (when missing) and migrates the stack's database before seeding it.
    command: "pnpm dev:test",
    url: STACK.healthUrl,
    reuseExistingServer: true,
    timeout: 180_000,
    // "pipe", not "ignore": on Windows an ignored stdout kills the worker on its first log line.
    stdout: "pipe",
    stderr: "pipe",
  },
});
