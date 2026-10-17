// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// Issue #148: the catalog also offers Mizano's "List overdue invoices" action.
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

// --- Issue #149 tests, kept in this file because the hub copies only the first 8 top-level e2e-army/*.e2e.ts files (see AI_QUESTIONS.md) ---
// Issue #149 (Mizano connector v1): the "Deal won → Mizano quote" template is listed in the gallery. Its Mizano create
// actions come from #147 (on main), so once the catalog has loaded the template is an offered card with a "Use template"
// button. The page renders no design card while the catalog loads (loading state, then offered / held back / error), so
// every assertion below waits (auto-retrying `expect`) for ONE final state and asserts it; nothing branches on a snapshot.
//
// AC1 (gallery listing EN + AR) is covered here. AC2 (approval blocks; reject ends the run) and AC3 (happy path with a mocked
// Mizano) are verified at worker/engine level in tests/integration/deal-won-mizano-approval.test.ts and
// tests/unit/deal-won-mizano-template.test.ts; a browser-level approve-and-create run is deferred (CTO decision on #149).

test(
  "@issue-149 AC1: the gallery offers 'Deal won → Mizano quote' with a Use template button",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");

    const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");
    await expect(offeredCard).toBeVisible({ timeout: 30000 });
    await expect(offeredCard.getByText("Deal won → Mizano quote")).toBeVisible();
    await expect(offeredCard.getByRole("button", { name: "Use template" })).toBeVisible();
    await expect(screen.getByTestId("template-held-back-deal-won-mizano-quote")).toHaveCount(0);
    await expect(screen.getByTestId("templates-connected-loading")).toHaveCount(0);
    await agent.assert("a template named Deal won → Mizano quote is listed with a Use template button");
  },
);

test(
  "@issue-149 AC1 (Arabic): the template is offered in Arabic and the page is right-to-left",
  { tags: ["feat:fl-templates", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/");
    await agent.act("switch the interface language to Arabic");
    await agent.act("open the workspace's Templates page from the navigation");

    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");
    await expect(offeredCard).toBeVisible({ timeout: 30000 });
    await expect(offeredCard.getByText("صفقة مكسوبة ← عرض سعر Mizano")).toBeVisible();
    await expect(screen.getByTestId("template-held-back-deal-won-mizano-quote")).toHaveCount(0);
    await agent.assert("a template named صفقة مكسوبة ← عرض سعر Mizano is listed");
  },
);

test(
  "@issue-149: a failed catalog shows an error with Retry, and Retry then offers the template",
  { tags: ["feat:fl-templates"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Fail the catalog request so the "Connected" section can't verify which actions exist.
    await browser.route("**/api/integrations/catalog*", (route) => route.fulfill({ status: 500, body: JSON.stringify({ error: "Catalog unavailable" }) }));

    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");

    await expect(screen.getByRole("alert")).toBeVisible({ timeout: 30000 });
    await expect(screen.getByTestId("template-deal-won-mizano-quote")).toHaveCount(0);
    const retry = screen.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();

    // Restore the route and retry: the final state is the offered card, and the error is gone.
    await browser.unroute("**/api/integrations/catalog*");
    await retry.click();
    await expect(screen.getByTestId("template-deal-won-mizano-quote")).toBeVisible({ timeout: 30000 });
  },
);
