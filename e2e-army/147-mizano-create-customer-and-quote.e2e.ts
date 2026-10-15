// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
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

// --- Issue #149 tests, kept in this file because the hub copies only the first 8 top-level e2e-army/*.e2e.ts files (see AI_QUESTIONS.md) ---
// Issue #149 (Mizano connector v1): the "Deal won → Mizano quote" template is listed in the gallery. Its Mizano create
// actions come from #147 (on main), so the template is normally an offered card with a "Use template" button; if a registry
// ever lacks them it is held back (name and reason, no button). The test accepts either state, so it is not tied to the registry.
//
// AC1 (gallery listing EN + AR) is covered here. AC2 (approval blocks; reject ends the run) and AC3 (happy path with a mocked
// Mizano) are verified at worker/engine level in tests/integration/deal-won-mizano-approval.test.ts and
// tests/unit/deal-won-mizano-template.test.ts; a browser-level approve-and-create run is deferred (CTO decision on #149).

test(
  "@issue-149 AC1: the gallery lists 'Deal won → Mizano quote' (held back until actions exist, then offered)",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");

    await agent.assert("a template named Deal won → Mizano quote is listed by name");
    await expect(screen.getByText("Deal won → Mizano quote").first()).toBeVisible();

    // The template is either held back (no Use button, reason shown) OR offered (card with Use button).
    // This test branches so it passes whichever state the registry puts the template in.
    const heldBackEntry = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");

    // Wait for the catalog to settle before reading the state (race-free): the page may still be loading initially.
    let isHeldBack = false;
    try {
      await heldBackEntry.waitFor({ state: "visible", timeout: 15000 });
      isHeldBack = true;
    } catch {
      await offeredCard.waitFor({ state: "visible", timeout: 15000 });
      isHeldBack = false;
    }

    if (isHeldBack) {
      // Held back
      await agent.assert("the template is held back: no Use template button, reason says Not available yet");
      await expect(heldBackEntry.getByRole("button", { name: "Use template" })).toHaveCount(0);
      await expect(screen.getByTestId("templates-held-back")).toContainText("Not available yet");
    } else {
      // Offered as a gallery card
      await agent.assert("the template is offered: gallery card with Use template button present");
      await expect(offeredCard.getByRole("button", { name: "Use template" })).toBeVisible();
    }
  },
);

test(
  "@issue-149 AC1 (Arabic): the template is listed in Arabic and the page is right-to-left",
  { tags: ["feat:fl-templates", "feat:fl-i18n-rtl"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    await app.open("/");
    await agent.act("switch the interface language to Arabic");
    await agent.act("open the workspace's Templates page from the navigation");

    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await agent.assert("a template named صفقة مكسوبة ← عرض سعر Mizano is listed (held back or offered)");
    await expect(screen.getByText("صفقة مكسوبة ← عرض سعر Mizano").first()).toBeVisible();
    // Also check it's in the right section (held-back or offered)
    const heldBackAr = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    const offeredAr = screen.getByTestId("template-deal-won-mizano-quote");
    let isHeldBackAr = false;
    try {
      await heldBackAr.waitFor({ state: "visible", timeout: 15000 });
      isHeldBackAr = true;
    } catch {
      await offeredAr.waitFor({ state: "visible", timeout: 15000 });
      isHeldBackAr = false;
    }
    const isOfferedAr = isHeldBackAr ? false : (await offeredAr.isVisible().catch(() => false));
    expect(isHeldBackAr || isOfferedAr).toBe(true);
  },
);

test(
  "@issue-149: catalog error shows an error state with retry instead of silently dropping the Connected section",
  { tags: ["feat:fl-templates"], session: "fl-user" },
  async ({ app, agent, screen, browser }) => {
    // Force the catalog request to fail and assert the explicit error UI with Retry appears.
    await browser.route("**/api/integrations/catalog*", (route) => route.fulfill({ status: 500, body: JSON.stringify({ error: "Catalog unavailable" }) }));

    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");

    await agent.assert("an error alert appears with a Retry button");
    const alert = screen.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();

    // Restore routing and retry
    await browser.unroute("**/api/integrations/catalog*");
    await agent.act("click Retry");
    await screen.getByRole("button", { name: "Retry" }).click();

    // After retry, the page settles into the held-back or offered state for the target template.
    const held = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    const off = screen.getByTestId("template-deal-won-mizano-quote");
    try {
      await held.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      await off.waitFor({ state: "visible", timeout: 15000 });
    }
  },
);
