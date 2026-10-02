import { expect, test } from "@playwright/test";
import { BASE_URL } from "./stack";

test("schema form validates and previews local values in Arabic and English", { tag: "@cross-browser" }, async ({ page, context }) => {
  for (const locale of ["ar", "en"] as const) {
    await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }]);
    await page.goto("/design-system");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

    const demo = page.getByTestId("schema-form-demo");
    await expect(demo).toBeVisible();
    const name = demo.locator("#schema-name");
    const email = demo.locator("#schema-email");
    const previewButton = demo.getByRole("button", { name: locale === "ar" ? "معاينة القيم" : "Preview values", exact: true });

    await previewButton.click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(demo.getByText(locale === "ar" ? "أكمل هذا الحقل." : "Complete this field.", { exact: true })).toHaveCount(2);

    await name.fill(locale === "ar" ? "سارة" : "Sara");
    await email.fill("invalid-email");
    await email.press("Tab");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(demo.getByText(locale === "ar" ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.", { exact: true })).toBeVisible();

    await email.fill(locale === "ar" ? "sara@example.test" : "sara@example.test");
    const notesToggle = demo.getByRole("checkbox", { name: locale === "ar" ? "إضافة تفاصيل أخرى" : "Include additional details", exact: true });
    await expect(demo.getByLabel(locale === "ar" ? "تفاصيل إضافية" : "Additional details", { exact: true })).toHaveCount(0);
    await notesToggle.check();
    const notes = demo.getByLabel(locale === "ar" ? "تفاصيل إضافية" : "Additional details", { exact: true });
    await expect(notes).toBeVisible();
    await notes.fill(locale === "ar" ? "راجع الطلب" : "Review the request");

    await previewButton.click();
    const preview = demo.getByTestId("schema-form-values");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('"name"');
    const values = JSON.parse(await preview.innerText()) as { name: string; email: string; mode: string; includeNotes: boolean; notes: string };
    expect(values).toEqual({
      name: locale === "ar" ? "سارة" : "Sara",
      email: "sara@example.test",
      mode: "a",
      includeNotes: true,
      notes: locale === "ar" ? "راجع الطلب" : "Review the request",
    });

    await demo.getByRole("button", { name: locale === "ar" ? "مسح المعاينة" : "Clear preview", exact: true }).click();
    await expect(preview).toHaveCount(0);
  }
});
