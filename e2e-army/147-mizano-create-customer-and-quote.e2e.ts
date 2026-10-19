// Issues #147 / #148 (Mizano connector) and #252 (stable gate `fl-integrations`): Mizano is pre-GA, so the integrations
// catalog must NOT offer it yet. The hub gate expects exactly the 12 supported providers; `listProviders()` hides Mizano
// (`PRE_GA` in src/integrations/registry.ts) while `allProviders()` / `getProvider()` keep it registered for already-saved
// steps and the contract tests. This file used to assert that Mizano was offered (#147 AC1, #148 AC1); that follows the
// #252 pre-GA decision and now asserts the opposite, just as strictly: the 12 providers are shown and Mizano is not.
// Real Mizano steps are proved in tests/contract/mizano.test.ts (stateful fake, Idempotency-Key dedupe, AC2 of #147) and
// tests/contract/mizano-http.test.ts; the exact catalog ids and order are pinned by tests/unit/integrations-catalog.test.ts.
// Mizano joins the catalog (and these tests flip back) when its connection type and live proof ship (#215, MZ G5).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const SUPPORTED = ["Google Sheets", "Gmail", "Slack", "HubSpot", "Zendesk", "Airtable", "Snowflake", "GitHub", "Stripe", "Notion", "PostgreSQL", "Linear"];

test(
  "@issue-147 @issue-252 AC1: the integrations catalog shows the 12 supported providers and does not offer pre-GA Mizano",
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
  "@issue-148 @issue-252 AC1: searching the catalog for the Mizano actions finds nothing while Mizano is pre-GA",
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
