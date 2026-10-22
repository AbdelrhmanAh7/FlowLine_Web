// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
// Issue #364: verify localization in both languages for the Mizano integration catalog.
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
  "@issue-364 AC1: the Mizano integration catalog shows Arabic action titles and RTL layout when language is Arabic",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Set locale to Arabic
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
    await app.open("/");
    // Verify RTL layout
    await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    // Verify Arabic action titles
    await agent.assert("the Mizano integration lists an action named إنشاء عميل");
    await agent.assert("the Mizano integration lists an action named إنشاء عرض أسعار مسودّة");
    await agent.assert("the Mizano integration lists an action named عرض الفواتير المتأخرة");
    await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    await expect(screen.getByText("إنشاء عرض أسعار مسودّة").first()).toBeVisible();
    await expect(screen.getByText("عرض الفواتير المتأخرة").first()).toBeVisible();
    // Verify Arabic category and description
    await agent.assert("the Mizano integration shows category أدوات المحاسبة");
    await agent.assert("the Mizano integration description mentions موصل المحاسبة Mizano");
  },
);

test(
  "@issue-364 AC2: the Mizano integration catalog shows English action titles when language is English",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Set locale to English
    await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    await app.open("/");
    // Verify LTR layout
    await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("ltr");
    await agent.act("open the workspace's Integrations page from the navigation");
    await agent.act("open the Mizano integration");
    // Verify English action titles (regression check)
    await agent.assert("the Mizano integration lists an action named Create customer");
    await agent.assert("the Mizano integration lists an action named Create draft quote");
    await agent.assert("the Mizano integration lists an action named List overdue invoices");
    await expect(screen.getByText("Create customer").first()).toBeVisible();
    await expect(screen.getByText("Create draft quote").first()).toBeVisible();
    await expect(screen.getByText("List overdue invoices").first()).toBeVisible();
    // Verify English category and description
    await agent.assert("the Mizano integration shows category Finance");
    await agent.assert("the Mizano integration description mentions Mizano accounting connector");
  },
);

