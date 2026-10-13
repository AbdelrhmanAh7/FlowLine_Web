import { defineConfig, devices } from "@playwright/test";
// Flowline field run of the FROZEN validation packet (agent-driven; Playwright Chromium for screenshots — NOT Chrome QA).
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: "http://localhost:3100", extraHTTPHeaders: { origin: "http://localhost:3100" }, storageState: { cookies: [{ name: "fl_locale", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] }, reducedMotion: "reduce" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
