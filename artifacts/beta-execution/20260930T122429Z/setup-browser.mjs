// One supervised visible setup browser. No screenshots, DOM dumps, tracing, video or secret collection.
// stdin keeps this supported exec session resumable; the owner enters authentication directly.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
const out = "artifacts/beta-execution/20260930T122429Z";
const profile = path.resolve("artifacts/beta-execution/.profile/setup-20260930");
mkdirSync(profile, { recursive: true });
const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, viewport: null });
const page = context.pages()[0] || await context.newPage();
await page.goto("https://console.cloud.google.com/", { waitUntil: "domcontentloaded" });
const current = new URL(page.url());
const identity = { at: new Date().toISOString(), browser: "Google Chrome", version: context.browser()?.version() ?? "version unavailable", headed: true, control: "local Playwright persistent context via supervised exec session", profile: "dedicated ignored setup-20260930 profile", publicDebugPort: false, recording: "none", page: `${current.origin}${current.pathname}`, task: "owner Google test-account login; no resource creation/consent/spend" };
writeFileSync(`${out}/setup-browser.json`, JSON.stringify(identity, null, 2));
console.log(JSON.stringify(identity));
console.log("OWNER TAKEOVER: browser automation idle, no recording. Await owner's reply before issuing any resume command.");
const input = createInterface({ input: process.stdin, terminal: false });
for await (const command of input) {
  if (command.trim() === "stop") { await context.close(); break; }
  if (command.trim() === "confirmed") {
    // Called only after owner confirmation. Report path/title only, never cookies/DOM/form values.
    const url = new URL(page.url());
    console.log(JSON.stringify({ page: `${url.origin}${url.pathname}`, title: await page.title(), credentialsInspected: false }));
  }
}
