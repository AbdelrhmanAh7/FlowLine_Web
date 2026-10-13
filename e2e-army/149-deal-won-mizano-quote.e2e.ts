// Issue #149 (Mizano connector v1): the gallery offers the "Deal won → Mizano quote" template, and using it creates a flow whose
// first Mizano step waits for approval. The throwaway stack has no Mizano workspace, so the run itself (approve creates the draft
// quote, reject creates nothing) is covered by the template's integration test with a mocked Mizano, not here.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-149 AC1: the templates gallery lists 'Deal won → Mizano quote' and Use opens it with an approval step",
  { tags: ["feat:fl-templates"], session: "fl-user" },
  async ({ app, agent, screen }) => {
    await app.open("/");
    await agent.act("open the workspace's Templates page from the navigation");
    await agent.assert("a template card named Deal won → Mizano quote is listed and says it needs a Mizano connection");
    await expect(screen.getByText("Deal won → Mizano quote").first()).toBeVisible();
    await agent.act("press the Use button on the Deal won → Mizano quote template");
    await agent.assert("the flow builder opens with steps that include Create customer and Create draft quote, and Create customer is marked as needing approval");
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
    await agent.assert("a template card named صفقة مكسوبة ← عرض سعر Mizano is listed");
    await expect(screen.getByText("صفقة مكسوبة ← عرض سعر Mizano").first()).toBeVisible();
  },
);
