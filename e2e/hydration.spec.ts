import { expect, test, type ConsoleMessage } from "@playwright/test";
import { BASE_URL } from "../playwright.config";
import { setupUser } from "./helpers";

/**
 * P3-16 (carried CX2-R01): React hydration warnings. Codex saw "A tree hydrated but some attributes … didn't
 * match" on Templates / Run history / Integrations in a fresh authenticated Chromium session. This monitors every
 * main route in fresh contexts across widths, locales and time zones (dev server = full React diagnostics), and
 * fails on any hydration message, recording what it saw.
 */
const ROUTES = ["flows", "templates", "runs", "integrations", "agents", "knowledge", "settings", "canvas"];
const CONTEXTS = [
  { width: 1440, locale: "en-US", timezoneId: "America/New_York" },
  { width: 1024, locale: "ar-EG", timezoneId: "Africa/Cairo" },
  { width: 375, locale: "de-DE", timezoneId: "Asia/Tokyo" },
];
const HYDRATION = /hydrat|did not match|didn't match|server rendered|Text content does not match/i;

for (const c of CONTEXTS) {
  test(`no hydration warnings: ${c.width}px ${c.locale} ${c.timezoneId}`, { tag: "@cross-browser" }, async ({ browser }) => {
    test.setTimeout(120_000);
    const seen: { route: string; type: string; text: string }[] = [];
    const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: c.width, height: 900 }, locale: c.locale, timezoneId: c.timezoneId, extraHTTPHeaders: { origin: BASE_URL } });
    const page = await ctx.newPage();
    const { workspace } = await setupUser(page, { template: "lead-qualifier" });
    let route = "";
    page.on("console", (m: ConsoleMessage) => {
      if ((m.type() === "error" || m.type() === "warning") && HYDRATION.test(m.text())) seen.push({ route, type: m.type(), text: m.text().slice(0, 600) });
    });
    page.on("pageerror", (e) => {
      if (HYDRATION.test(e.message)) seen.push({ route, type: "pageerror", text: e.message.slice(0, 600) });
    });
    for (const r of ROUTES) {
      route = r;
      // A full document load each time (hydration only happens on the first render of a document).
      await page.goto(`/w/${workspace.slug}/${r}`, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 }).first().or(page.locator(".react-flow")).first()).toBeVisible();
    }
    await test.info().attach("hydration-messages.json", { body: JSON.stringify({ context: c, seen }, null, 2), contentType: "application/json" });
    await ctx.close();
    expect(seen, JSON.stringify(seen, null, 2)).toEqual([]);
  });
}
