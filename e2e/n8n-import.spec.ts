import { expect, test } from "@playwright/test";
import en from "../src/i18n/messages/en.json";
import ar from "../src/i18n/messages/ar.json";
import { setupUser } from "./helpers";

for (const locale of ["en", "ar"] as const) {
  test(`AC2: non-workflow upload error (${locale})`, async ({ page, context }, testInfo) => {
    const { workspace } = await setupUser(page);
    await context.addCookies([{ name: "fl_locale", value: locale, domain: "localhost", path: "/" }]);
    const t = locale === "ar" ? ar.flows : en.flows;
    await page.goto(`/w/${workspace.slug}/flows`);
    await page.getByRole("button", { name: t.importN8n, exact: true }).click();
    await page.getByLabel(t.importN8nFileInput).setInputFiles({
      name: "not-workflow.json", mimeType: "application/json", buffer: Buffer.from('{"foo":"bar"}'),
    });
    await expect(page.getByRole("alert")).toHaveText(t.importN8nNotWorkflow);
    await expect(page.getByRole("textbox", { name: t.importN8nLabel })).toHaveValue("");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    const path = testInfo.outputPath(`378-error-${locale}.png`);
    await page.screenshot({ path, animations: "disabled" });
    await testInfo.attach(`378-error-${locale}`, { path, contentType: "image/png" });
  });
}
