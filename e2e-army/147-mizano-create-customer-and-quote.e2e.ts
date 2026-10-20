// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
// Issue #302: Mizano provider strings and connection form localization in English and Arabic (RTL).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-147 AC1: the integrations catalog lists Mizano with the Create customer and Create draft quote actions",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    await agent.assert("the Mizano integration lists an action named Create customer");
    await agent.assert("the Mizano integration lists an action named Create draft quote");
    await expect(screen.getByText("Create customer").first()).toBeVisible();
    await expect(screen.getByText("Create draft quote").first()).toBeVisible();
  },
);

test(
  "@issue-148 AC1: the integrations catalog lists Mizano with the List overdue invoices action",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    await agent.assert("the Mizano integration lists an action named List overdue invoices");
    await expect(screen.getByText("List overdue invoices").first()).toBeVisible();
  },
);

test(
  "@issue-302 AC1: Mizano integration card, actions, and connect fields are localized in English and Arabic (RTL)",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/");
    await agent.act("switch the language to English");
    await agent.act("open the workspace's Integrations page from the navigation");
    await expect(screen.getByText("Mizano accounting connector.").first()).toBeVisible();
    await agent.act("open the Mizano integration");
    await expect(screen.getByText("Create customer").first()).toBeVisible();
    await agent.act("open the connection form for the Mizano integration");
    await expect(screen.getByLabel("Scoped API key")).toBeVisible();
    await expect(screen.getByLabel("Mizano URL")).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("ltr");
    await agent.act("cancel the connection form");
    await agent.assert("the connection form is closed and no longer visible");

    await agent.act("switch the language to Arabic");
    await expect(screen.getByText("موصل المحاسبة Mizano").first()).toBeVisible();
    await agent.act("open the Mizano integration");
    await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    await agent.act("open the connection form for the Mizano integration");
    await expect(screen.getByLabel("مفتاح API محدود النطاق")).toBeVisible();
    await expect(screen.getByLabel("رابط Mizano")).toBeVisible();
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await agent.act("cancel the connection form");
    await agent.assert("the connection form is closed and no longer visible");
  },
);
