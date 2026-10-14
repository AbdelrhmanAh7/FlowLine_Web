// Issue #149 (Mizano connector v1): the "Deal won → Mizano quote" template is listed in the gallery. Its Mizano create
// actions come from #147, so until those exist in the provider registry the template is held back: listed with its name
// and a reason, but with no "Use template" button, so it can't create a flow that cannot run.
//
// AC1 (gallery listing EN + AR) is covered here. AC2 (approval blocks; reject ends run) and AC3 (happy-path e2e with
// mocked Mizano) are verified at the worker/engine level in tests/integration/deal-won-mizano-approval.test.ts and
// tests/unit/deal-won-mizano-template.test.ts. The browser-level happy-path e2e (approve in UI, draft quote at fake
// Mizano server) is deferred until #147 (real actions) and #225 (fake mizano handler) merge, per CTO decision on #149.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-149 AC1: the gallery lists 'Deal won → Mizano quote', held back until its actions exist",
  { tags: ["feat:fl-templates", "feat:fl-flows-api"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");
    await agent.assert("a template named Deal won → Mizano quote is listed under Not available yet and cannot be used");
    await expect(screen.getByText("Deal won → Mizano quote").first()).toBeVisible();
    // The entry is a notice, not a gallery card: no "Use template" button anywhere in it, and the reason names it.
    const entry = screen.getByTestId("template-held-back-deal-won-mizano-quote");
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("button", { name: "Use template" })).toHaveCount(0);
    await expect(screen.getByTestId("templates-held-back")).toContainText("Not available yet");
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
    await agent.assert("a template named صفقة مكسوبة ← عرض سعر Mizano is listed and marked as not available yet");
    await expect(screen.getByText("صفقة مكسوبة ← عرض سعر Mizano").first()).toBeVisible();
  },
);
