// Issue #149 (Mizano connector v1): the "Deal won → Mizano quote" template is listed in the gallery. Its Mizano create
// actions come from #147, so until those exist in the provider registry the template is held back: listed with its name
// and a reason, but with no "Use template" button, so it can't create a flow that cannot run. Once #147 merges the
// template becomes offered in the gallery grid with a "Use template" button. This test handles BOTH states so it
// survives the #147 merge (it is not a time-bomb).
//
// AC1 (gallery listing EN + AR) is covered here. AC2 (approval blocks; reject ends run) and AC3 (happy-path e2e with
// mocked Mizano) are verified at the worker/engine level in tests/integration/deal-won-mizano-approval.test.ts and
// tests/unit/deal-won-mizano-template.test.ts. The browser-level happy-path e2e (approve in UI, draft quote at fake
// Mizano server) is deferred until #147 (real actions) and #225 (fake mizano handler) merge, per CTO decision on #149.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-149 AC1: the gallery lists 'Deal won → Mizano quote' (held back until actions exist, then offered)",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");

    await agent.assert("a template named Deal won → Mizano quote is listed by name");
    await expect(screen.getByText("Deal won → Mizano quote").first()).toBeVisible();

    // The template is either held back (no Use button, reason shown) OR offered (card with Use button).
    // This test branches so it passes both before and after #147 merges.
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
      // Before #147: template is held back
      await agent.assert("the template is held back: no Use template button, reason says Not available yet");
      await expect(heldBackEntry.getByRole("button", { name: "Use template" })).toHaveCount(0);
      await expect(screen.getByTestId("templates-held-back")).toContainText("Not available yet");
    } else {
      // After #147: template is offered as a gallery card
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
