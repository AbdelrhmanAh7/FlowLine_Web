import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail, verificationLink } from "./helpers";

test("sign-in walkthrough switches translated steps by click and keyboard without changing the form", { tag: "@cross-browser" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const locale of ["ar", "en"] as const) {
    await page.goto("/sign-in");
    const switcher = page.getByRole("group").filter({ has: page.getByRole("button", { name: "English", exact: true }) });
    await switcher.getByRole("button", { name: locale === "ar" ? "العربية" : "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    const walkthrough = page.getByRole("complementary");
    await expect(walkthrough).toBeVisible();
    const group = walkthrough.getByRole("group");
    const steps = group.getByRole("button");
    await expect(steps).toHaveCount(3);
    const heights = await steps.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    await expect(steps.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "false");

    const form = page.locator("form").filter({ has: page.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email", { exact: true }) });
    const email = uniqueEmail("client-ux");
    await form.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email", { exact: true }).fill(email);
    await form.getByLabel(locale === "ar" ? "كلمة المرور" : "Password", { exact: true }).fill(PASSWORD);

    await steps.nth(1).click();
    await expect(steps.nth(0)).toHaveAttribute("aria-pressed", "false");
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(walkthrough).toContainText(locale === "ar" ? "اربط الخطوات" : "Connect the steps");
    await expect(walkthrough).toContainText(locale === "ar" ? "رتّب المحفّز والإجراءات" : "Arrange a trigger and actions");
    await expect(walkthrough).not.toContainText(/JSONata|\{\s*"/i);

    await steps.nth(2).focus();
    await page.keyboard.press("Enter");
    await expect(steps.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(walkthrough).toContainText(locale === "ar" ? "راجع كل تشغيل" : "Review each run");

    await expect(form.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email", { exact: true })).toHaveValue(email);
    await expect(form.getByLabel(locale === "ar" ? "كلمة المرور" : "Password", { exact: true })).toHaveValue(PASSWORD);
  }
});

test("onboarding help disclosure explains the available choices", { tag: "@cross-browser" }, async ({ page }) => {
  const email = uniqueEmail("client-ux-onboarding");
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill("UX Tester");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // The test stack's outbox is exposed through the existing helper, keeping sign-up and verification real.
  await page.goto(await verificationLink(page.request, email));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await page.getByRole("link", { name: "Continue to sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeVisible();
  await page.getByLabel("Workspace name", { exact: true }).fill("UX Help Co");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What do you want to automate first?" })).toBeVisible();

  const help = page.getByRole("button", { name: "How should I choose?", exact: true });
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("You can change the name, goal, or template later.", { exact: false })).toBeVisible();
  await expect(page.getByText("A template gives you an editable starting workflow", { exact: false })).toBeVisible();
  await help.click();
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("You can change the name, goal, or template later.", { exact: false })).toBeHidden();
});
