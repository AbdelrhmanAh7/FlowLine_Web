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

    // Wait for the catalog to load (loading spinner disappears) before checking template state.
    // The page shows a loading spinner while catalog.isLoading is true.
    await expect(screen.getByRole("status", { name: "Loading templates…" })).not.toBeVisible({ timeout: 10000 });

    await agent.assert("a template named Deal won → Mizano quote is listed by name");
    await expect(screen.getByText("Deal won → Mizano quote").first()).toBeVisible();

    // The template is either held back (no Use button, reason shown) OR offered (card with Use button).
    // This test branches so it passes both before and after #147 merges.
    const heldBackEntry = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    const offeredCard = screen.getByTestId("template-deal-won-mizano-quote");

    if (await heldBackEntry.isVisible().catch(() => false)) {
      // Before #147: template is held back
      await agent.assert("the template is held back: no Use template button, reason says Not available yet");
      await expect(heldBackEntry.getByRole("button", { name: "Use template" })).toHaveCount(0);
      await expect(screen.getByTestId("templates-held-back")).toContainText("Not available yet");
    } else if (await offeredCard.isVisible().catch(() => false)) {
      // After #147: template is offered as a gallery card
      await agent.assert("the template is offered: gallery card with Use template button present");
      await expect(offeredCard.getByRole("button", { name: "Use template" })).toBeVisible();
    } else {
      throw new Error("Template 'Deal won → Mizano quote' not found in either held-back or offered state");
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

    // Wait for the catalog to load (loading spinner disappears) before checking template state.
    await expect(screen.getByRole("status", { name: "جاري تحميل القوالب…" })).not.toBeVisible({ timeout: 10000 });

    expect(await browser.evaluate(() => document.documentElement.dir)).toBe("rtl");
    await agent.assert("a template named صفقة مكسوبة ← عرض سعر Mizano is listed (held back or offered)");
    await expect(screen.getByText("صفقة مكسوبة ← عرض سعر Mizano").first()).toBeVisible();
    // Also check it's in the right section (held-back or offered)
    const heldBackAr = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    const offeredAr = screen.getByTestId("template-deal-won-mizano-quote");
    const isHeldBack = await heldBackAr.isVisible().catch(() => false);
    const isOffered = await offeredAr.isVisible().catch(() => false);
    expect(isHeldBack || isOffered).toBe(true);
  },
);
