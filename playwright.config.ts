import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

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
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "pnpm db:migrate:test && pnpm dev:test",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
