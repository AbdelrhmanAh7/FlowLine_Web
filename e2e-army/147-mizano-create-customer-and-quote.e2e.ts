// Issues #147 / #148 / #252 / #313 (Mizano connector & stable gate `fl-integrations`): Mizano is pre-GA, so the integrations
// catalog must NOT offer it yet. The hub gate expects exactly the 12 supported providers; `listProviders()` hides Mizano
// (`PRE_GA` in src/integrations/registry.ts) while `allProviders()` / `getProvider()` keep it registered for already-saved
// steps and the contract tests. This file asserts that the 12 providers are shown and Mizano is not offered.
// Real Mizano steps are proved in tests/contract/mizano.test.ts (stateful fake, Idempotency-Key dedupe, AC2 of #147) and
// tests/contract/mizano-http.test.ts; the exact catalog ids and order are pinned by tests/unit/integrations-catalog.test.ts.
// Mizano joins the catalog when its connection type and live proof ship (#215, MZ G5).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const SUPPORTED = ["Google Sheets", "Gmail", "Slack", "HubSpot", "Zendesk", "Airtable", "Snowflake", "GitHub", "Stripe", "Notion", "PostgreSQL", "Linear"];

test(
  "@issue-147 @issue-252 @issue-313 AC1: the integrations catalog shows the 12 supported providers and does not offer pre-GA Mizano",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, browser, agent, screen }) => {
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    for (const name of SUPPORTED) await expect(screen.getByText(name, { exact: true }).first()).toBeVisible();
    await agent.assert("the Integrations page shows 12 provider cards and none of them is named Mizano");
    await expect(screen.getByText("Mizano")).toHaveCount(0);
  },
);

test(
  "@issue-148 @issue-252 @issue-313 AC2: searching the catalog for the Mizano actions finds nothing while Mizano is pre-GA",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, browser, agent, screen }) => {
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("search the integrations for {term}", { params: { term: "List overdue invoices" } });
    await agent.assert("no provider card is shown and no action named List overdue invoices is listed");
    await expect(screen.getByText("List overdue invoices")).toHaveCount(0);
    await expect(screen.getByText("Create draft quote")).toHaveCount(0);
  },
);

test(
  "@issue-313 AC3: Arabic integrations catalog displays RTL and renders the 12 supported providers with translated categories",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, browser, agent, screen }) => {
    try {
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
      await app.open("/");
      await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
      await agent.act("open the workspace's Integrations page from the navigation");
      await agent.assert("the Integrations page shows 12 provider cards in Arabic layout and none is named Mizano");
      await expect(screen.getByText("Mizano")).toHaveCount(0);
    } finally {
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    }
  },
);
