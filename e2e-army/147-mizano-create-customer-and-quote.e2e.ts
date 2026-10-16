// Issue #147 (Mizano connector v1): the integrations catalog offers Mizano's "Create customer" and "Create draft quote" steps.
// Only the catalog is checked here: no Mizano workspace is reachable from the throwaway stack, so a real run (and the
// "same run does not create a second customer/quote" criterion, AC2) is proved in tests/contract/mizano.test.ts by
// "mizano create steps against a stateful fake that dedupes on Idempotency-Key": two executions of one run leave one
// customer and one quote in the fake, a new run a second pair. Live proof waits on the Mizano scoped API key (MZ G5).
// The #224 Mizano localization test (below) was moved here from its own file to stay within the hub's cap of 8 top-level
// e2e-army/*.e2e.ts files.
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

// ── moved from e2e-army/224-mizano-localization.e2e.ts (the hub runs at most 8 top-level e2e-army/*.e2e.ts files; see tests/unit/e2e-army-tooling.test.ts) ──
test("@issue-224 AC: Mizano connection text and required fields are localized in English and Arabic", {
  tags: ["feat:fl-integrations", "feat:fl-integration-actions", "feat:fl-i18n-rtl"], session: "fl-user",
}, async ({ app, agent, screen, browser }) => {
  await app.open("/");
  await agent.act("switch the interface language to English");
  await agent.act("open the workspace's Integrations page from the navigation");
  for (const locale of ["en", "ar"]) {
    if (locale === "ar") await agent.act("switch the interface language to Arabic");
    await expect(screen.getByText(locale === "en"
      ? "Connect FlowLine to your Mizano accounting workspace with a scoped API key."
      : "اربط FlowLine بمساحة عملك المحاسبية في Mizano بمفتاح API ذي نطاق محدد.", { exact: true })).toBeVisible();
    await agent.act("open the connection form for the Mizano integration");
    await expect(screen.getByLabel(locale === "en" ? "Base URL" : "الرابط الأساسي", { exact: true })).toBeVisible();
    await expect(screen.getByLabel(locale === "en" ? "API key" : "مفتاح API", { exact: true })).toBeVisible();
    await agent.act("leave the connection fields empty and try to submit the connection form");
    await agent.assert("the Mizano connection form remains open with required empty fields and no successful connection");
    expect(await browser.evaluate(() => document.documentElement.dir)).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await agent.act("cancel the connection form");
  }
});
