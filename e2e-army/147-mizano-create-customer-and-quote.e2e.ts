// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
// Issue #364: verify localization in both languages for the Mizano integration catalog.
// Issue #365: verify Arabic localization for Mizano integration and clean locale teardown.
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
    // Verify Arabic action titles (diacritic-resilient matching for shaddah U+0651)
    await agent.assert("the Mizano integration lists an action named إنشاء عميل");
    await agent.assert("the Mizano integration lists an action named إنشاء عرض أسعار مسودّ?ة");
    await agent.assert("the Mizano integration lists an action named عرض الفواتير المتأخرة");
    await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    await expect(screen.getByText(/إنشاء عرض أسعار مسودّ?ة/).first()).toBeVisible();
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

test(
  "@issue-365 AC1: Mizano integration in Arabic shows localized provider and action details with RTL layout and clean locale teardown",
  { tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    try {
      // Set locale to Arabic
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
      await app.open("/");
      // Verify RTL layout
      await expect(browser.evaluate(() => document.documentElement.dir)).resolves.toBe("rtl");
      await agent.act("open the workspace's Integrations page from the navigation");
      await agent.act("open the Mizano integration");
      // Verify Arabic description and action listing
      await agent.assert("the Mizano integration description mentions موصل المحاسبة Mizano");
      await agent.assert("the Mizano integration lists an action named إنشاء عميل");
      await expect(screen.getByText("إنشاء عميل").first()).toBeVisible();
    } finally {
      // Restore locale to English to prevent test pollution
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    }
  },
);

// --- Issue #421 (split from PR #410, parent #409): Deal won → Mizano quote template in gallery (EN + AR) ---
test(
  "@issue-421 AC1: the gallery offers 'Deal won → Mizano quote' with a Use template button",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/app");
    await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
    const slug = new URL(await browser.url()).pathname.split("/")[2]!;
    await app.open(`/w/${slug}/templates`);

    const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");
    await expect(offeredCard).toBeVisible();
    await expect(offeredCard.getByText("Deal won → Mizano quote")).toBeVisible();
    await expect(offeredCard.getByRole("button", { name: "Use template" })).toBeVisible();
    await agent.assert("a template named Deal won → Mizano quote is listed with a Use template button");
  },
);

test(
  "@issue-421 AC2: the template is offered in Arabic and the page is right-to-left",
  { tags: ["feat:fl-templates", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    try {
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "ar" }]);
      await app.open("/app");
      await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
      const slug = new URL(await browser.url()).pathname.split("/")[2]!;
      await app.open(`/w/${slug}/templates`);

      expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
      const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");
      await expect(offeredCard).toBeVisible();
      await expect(offeredCard.getByText("صفقة مكسوبة → عرض سعر Mizano")).toBeVisible();
      await agent.assert("a template named صفقة مكسوبة → عرض سعر Mizano is listed");
    } finally {
      await browser.setCookies([{ url: app.baseUrl!, name: "fl_locale", value: "en" }]);
    }
  },
);

test(
  "@issue-421 AC3: using 'Deal won → Mizano quote' creates an editable flow with the approval step",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, screen, browser }) => {
    await app.open("/app");
    await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows$/);
    const slug = new URL(await browser.url()).pathname.split("/")[2]!;
    await app.open(`/w/${slug}/templates`);

    const card = screen.getByTestId("template-deal-won-mizano-quote");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Use template" }).click();
    await expect(browser).toHaveURL(/\/w\/[a-z0-9-]+\/flows\/[0-9a-f-]{36}$/);
    await expect(screen.getByLabel("Flow name")).toHaveValue("Deal won → Mizano quote");
    await expect(screen.getByText("Mizano — Create customer (needs approval)")).toBeVisible();
  },
);



