import { expect, test } from "@playwright/test";
import { setupUser } from "./helpers";
import { BASE_URL } from "./stack";

test.describe("@cross-browser everyday scenario gallery", () => {
  for (const locale of ["en", "ar"] as const) {
    test(`${locale}: filter, search, create and run a quote from the gallery`, async ({ page, context }) => {
      const { workspace } = await setupUser(page);
      await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }]);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/w/${workspace.slug}/templates`);
      await expect(page.getByTestId("template-low-stock-list")).toBeVisible();
      await expect(page.getByTestId("template-quote-calculator")).toContainText(locale === "ar" ? "النتيجة المحفوظة" : "Saved result");
      await page.getByRole("button", { name: locale === "ar" ? "شخصي" : "Personal", exact: true }).click();
      await expect(page.getByTestId("template-subscription-review")).toBeVisible();
      await expect(page.getByTestId("template-weekly-task-plan")).toBeVisible();
      await expect(page.getByTestId("template-quote-calculator")).toHaveCount(0);
      await page.getByRole("button", { name: locale === "ar" ? "الكل" : "All", exact: true }).click();
      await page.locator("#tpl-search").fill(locale === "ar" ? "عروض الأسعار" : "Quote Calculator");
      await expect(page.locator('[data-testid^="template-"]')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.getByTestId("template-quote-calculator").getByRole("button").click();
      await expect(page).toHaveURL(/\/flows\/[0-9a-f-]{36}$/);
      const flowId = new URL(page.url()).pathname.split("/").pop()!;
      await expect(page.locator(".react-flow__node")).toHaveCount(5);
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
      await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
      await page.keyboard.press("Control+Enter");
      await expect(page.getByTestId("run-dock")).toBeVisible();
      await expect.poll(async () => {
        const response = await page.request.get(`/api/flows/${flowId}/runs`);
        const { runs } = await response.json();
        return runs[0]?.status;
      }).toBe("succeeded");
      const { runs } = await (await page.request.get(`/api/flows/${flowId}/runs`)).json();
      const { run } = await (await page.request.get(`/api/runs/${runs[0].id}`)).json();
      expect(run.output.quote).toMatchObject({ subtotal: 364.97, discount: 36.5, total: 328.47, currency: "USD" });
      expect(run.steps.some((step: { status: string }) => step.status === "failed")).toBe(false);
    });
  }
});
