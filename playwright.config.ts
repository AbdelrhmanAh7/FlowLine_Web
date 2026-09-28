import { defineConfig, devices } from "@playwright/test";

// Fake-provider URLs (and the rest of the test-stack settings) come from .env.test, like the stack itself.
try {
  process.loadEnvFile(".env.test");
} catch {
  /* no .env.test: defaults apply */
}

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * Flowline is Arabic-first (no `fl_locale` cookie = Arabic, RTL). The existing suites are written against the
 * English UI, so every context starts with `fl_locale=en`; `e2e/arabic.spec.ts` clears it to test the default.
 * Contexts created by hand with `browser.newContext()` don't inherit `use` options — pass `storageState: EN_STATE`.
 */
export const EN_STATE = {
  cookies: [{ name: "fl_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }],
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
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: { origin: BASE_URL },
    storageState: EN_STATE,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Critical journeys (@critical) and cross-browser monitors (@cross-browser) also run on Firefox and WebKit (p3§22).
    { name: "firefox", grep: /@critical|@cross-browser/, use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", grep: /@critical|@cross-browser/, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm db:migrate:test && pnpm dev:test",
    url: `${BASE_URL}/api/health?require=worker`,
    reuseExistingServer: true,
    timeout: 180_000,
    // "pipe", not "ignore": on Windows an ignored stdout kills the worker on its first log line.
    stdout: "pipe",
    stderr: "pipe",
  },
});
