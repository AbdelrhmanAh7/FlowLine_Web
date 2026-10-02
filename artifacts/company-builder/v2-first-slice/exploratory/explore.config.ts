import { defineConfig, devices } from "@playwright/test";
// Exploratory pass (Chromium SUBSTITUTE for real Google Chrome, which the container's network policy blocks).
export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: "http://localhost:3100", extraHTTPHeaders: { origin: "http://localhost:3100" }, storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
