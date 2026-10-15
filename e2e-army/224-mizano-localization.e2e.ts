import { test } from "@e2e-dev/web";
import { expect } from "e2e";

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
