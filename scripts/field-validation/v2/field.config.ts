import { defineConfig } from "@playwright/test";
import { fieldTarget } from "./isolation";

// Dedicated opt-in API suite; no browser fixture, no webServer, no fixed shared port, no env-file loading.
const baseURL = process.env.FIELD_BASE_URL;
const target = fieldTarget(baseURL);
export default defineConfig({
  testDir: ".", testMatch: "field.spec.ts", workers: 1, retries: 0, timeout: 300_000,
  reporter: "list",
  use: { baseURL, extraHTTPHeaders: { origin: target.origin }, storageState: {
    cookies: [{ name: "fl_locale", value: "en", domain: target.hostname.replace(/[\[\]]/g, ""), path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [],
  } },
});
