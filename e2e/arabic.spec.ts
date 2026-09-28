import { expect, test, type Page } from "@playwright/test";
import { latestEmail, PASSWORD, setupUser, signUpVerified, uniqueEmail } from "./helpers";

/**
 * Arabic-first (Phase 4): with no `fl_locale` cookie the app is Arabic and right-to-left. The rest of the suite
 * runs in English via the config's storageState; these tests start from an empty cookie jar to see the default.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function expectArabic(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

async function noHorizontalScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${where}: page must not scroll horizontally`).toBeLessThanOrEqual(iw);
}

const direction = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).direction);

test("Arabic by default: sign-up → onboarding → Flows, sign-in, language switch, LTR code fields", { tag: "@cross-browser" }, async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("arabic");

  // Landing
  await page.goto("/");
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("أتمت أي شيء.");
  await page.getByRole("link", { name: "ابدأ مجانًا" }).click();

  // Sign-up (Arabic labels; the e-mail field stays left-to-right)
  await expect(page.getByRole("heading", { name: "أنشئ حسابك" })).toBeVisible();
  await expectArabic(page);
  await page.getByLabel("الاسم", { exact: true }).fill("سارة أحمد");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  expect(await direction(page, "#email")).toBe("ltr");
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();

  // "Check your inbox" in Arabic; the address stays left-to-right inside the RTL sentence.
  await expect(page.getByRole("heading", { name: "تحقّق من بريدك الوارد" })).toBeVisible();
  const sentTo = page.locator("strong", { hasText: email });
  await expect(sentTo).toBeVisible();
  expect(await sentTo.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
  await expect(page.getByRole("button", { name: "إرسال رابط جديد" })).toBeVisible();

  // The verification email is Arabic too (the language the person signed up in).
  const mail = await latestEmail(page.request, email, "verify");
  expect(mail.subject).toMatch(/[؀-ۿ]/);

  // Verify (Arabic page), then sign in → onboarding
  await page.goto(mail.link!);
  await expectArabic(page);
  await page.getByRole("button", { name: "تأكيد البريد" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم تأكيد بريدك. يمكنك تسجيل الدخول الآن." })).toBeVisible();
  await page.getByRole("link", { name: "المتابعة إلى تسجيل الدخول" }).click();
  await expect(page.getByRole("heading", { name: "مرحبًا بعودتك" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();

  // Onboarding
  await expect(page.getByRole("heading", { name: "سمِّ مساحة عملك" })).toBeVisible();
  await expect(page.getByLabel("اسم مساحة العمل")).toHaveValue("مساحة عمل سارة");
  await page.getByLabel("اسم مساحة العمل").fill("Arabic Co");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByRole("heading", { name: "ما أول شيء تريد أتمتته؟" })).toBeVisible();
  await page.getByRole("radio", { name: /المبيعات وإدارة العملاء المحتملين/ }).click();
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByRole("heading", { name: "أنشئ مسارك الأول" })).toBeVisible();
  await page.getByRole("radio", { name: /تأهيل العملاء المحتملين/ }).click();
  await page.getByRole("button", { name: "أنشئ المسار وافتح لوحة التصميم" }).click();

  // Builder: the graph keeps LTR coordinates; expression/JSON fields are LTR inside the RTL chrome.
  await expect(page).toHaveURL(/\/w\/arabic-co(-\d+)?\/flows\/[0-9a-f-]{36}$/);
  const slug = new URL(page.url()).pathname.split("/")[2]!;
  await expectArabic(page);
  await expect(page.locator(".react-flow")).toHaveAttribute("dir", "ltr");
  await page.getByTestId("node-normalise").click();
  const expression = page.locator("textarea[id^='expr-']").first();
  await expect(expression).toBeVisible();
  expect(await expression.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
  await page.keyboard.press("Escape");

  // Flows dashboard in Arabic
  await page.goto(`/w/${slug}/flows`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "المسارات" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lead Qualifier" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "سجل التشغيل" })).toBeVisible();
  // The sidebar sits on the right in RTL.
  const aside = await page.getByRole("complementary", { name: "التنقّل في مساحة العمل" }).boundingBox();
  expect(aside!.x).toBeGreaterThan(page.viewportSize()!.width / 2);

  // Language switcher (user menu): Arabic → English → Arabic
  await page.getByRole("button", { name: "سارة أحمد" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1, name: "Flows" })).toBeVisible();
  await page.getByRole("button", { name: "سارة أحمد" }).click();
  await page.getByRole("menuitemradio", { name: "العربية" }).click();
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "المسارات" })).toBeVisible();

  // Sign out, then sign in again in Arabic
  await page.getByRole("button", { name: "سارة أحمد" }).click();
  await page.getByRole("menuitem", { name: "تسجيل الخروج" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/w/"));
  await page.goto("/sign-in");
  await expectArabic(page);
  await expect(page.getByRole("heading", { name: "مرحبًا بعودتك" })).toBeVisible();
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/flows$`));
  await expect(page.getByRole("heading", { level: 1, name: "المسارات" })).toBeVisible();
});

test("auth pages switch language without signing in", { tag: "@cross-browser" }, async ({ page }) => {
  await page.goto("/sign-in");
  await expectArabic(page);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  // The choice sticks across navigations (cookie).
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByRole("button", { name: "العربية" }).click();
  await expectArabic(page);
  await expect(page.getByRole("heading", { name: "أنشئ حسابك" })).toBeVisible();
});

test("an invalid locale cookie falls back to Arabic", { tag: "@cross-browser" }, async ({ page, context }) => {
  await context.addCookies([{ name: "fl_locale", value: "fr", domain: "localhost", path: "/" }]);
  await page.goto("/sign-in");
  await expectArabic(page);
});

test("no horizontal scroll in RTL at 375 / 1024 / 1440", { tag: "@cross-browser" }, async ({ page }) => {
  test.setTimeout(120_000);
  // A signed-in Arabic user with a flow, so the dashboard has a populated table.
  const email = uniqueEmail("arabic-rtl");
  await signUpVerified(page.request, email, "RTL");
  const { workspace } = await (await page.request.post("/api/workspaces", { data: { name: "RTL Scroll" } })).json();
  expect((await page.request.post("/api/onboarding", { data: { goal: "sales", skipped: false } })).ok()).toBeTruthy();
  const { flow } = await (await page.request.post(`/api/workspaces/${workspace.id}/flows`, { data: { templateId: "lead-qualifier" } })).json();

  for (const width of [375, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/sign-in", `/w/${workspace.slug}/flows`, `/w/${workspace.slug}/flows/${flow.id}`, `/w/${workspace.slug}/runs`, `/w/${workspace.slug}/settings`]) {
      await page.goto(path);
      await expectArabic(page);
      await expect(page.locator("h1").first().or(page.locator(".react-flow")).first()).toBeVisible();
      await noHorizontalScroll(page, `${path} @${width}`);
    }
  }
});

test("Arabic builder: toolbar, palette, drawer, run dock and inspector are translated", { tag: "@cross-browser" }, async ({ page }) => {
  test.setTimeout(120_000);
  const { workspace, flowId } = await setupUser(page, { template: "lead-qualifier" });

  // Templates library in Arabic (template names by id, categories translated).
  await page.goto(`/w/${workspace.slug}/templates`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "القوالب" })).toBeVisible();
  await expect(page.getByText("تأهيل العملاء المحتملين")).toBeVisible();
  await expect(page.getByRole("group", { name: "تصفية القوالب حسب الفئة" }).getByRole("button", { name: "المبيعات" })).toBeVisible();

  // Builder toolbar
  await page.goto(`/w/${workspace.slug}/flows/${flowId}`);
  await expectArabic(page);
  await expect(page.getByRole("button", { name: "▶ تشغيل" })).toBeVisible();
  await expect(page.getByRole("button", { name: "السجل" })).toBeVisible();
  await expect(page.getByTestId("save-status")).toContainText("محفوظ");
  await expect(page.locator(".react-flow")).toHaveAttribute("aria-label", "لوحة تصميم المسار");

  // Palette: translated titles; the trigger is disabled with a translated reason.
  await page.getByRole("button", { name: /إضافة عقدة/ }).click();
  const palette = page.getByRole("dialog", { name: "إضافة عقدة" });
  await expect(palette.getByPlaceholder("ابحث في العُقد…")).toBeVisible();
  await expect(palette.getByRole("option", { name: /تحويل JSON/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /مُشغِّل يدوي/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  // Node drawer: tabs, labels and actions in Arabic; the expression stays LTR.
  await page.getByTestId("node-normalise").click();
  const drawer = page.getByTestId("node-drawer");
  await expect(drawer.getByRole("tab", { name: "الإعداد" })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByRole("tab", { name: "الاختبار" })).toBeVisible();
  await expect(drawer.getByText("التعبير (JSONata)", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /نسخ/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /حذف/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // Run it: the run dock and canvas report status in Arabic.
  await page.getByRole("button", { name: "▶ تشغيل" }).click();
  const dock = page.getByTestId("run-dock");
  await expect(dock).toHaveAttribute("aria-label", "شريط التشغيل");
  await expect(dock.getByText("ناجح").first()).toBeVisible({ timeout: 20_000 });
  await expect(dock.getByText("مُخرجات التشغيل")).toBeVisible();

  // Inspector in Arabic.
  await dock.getByRole("link", { name: /فتح في فاحص التشغيل/ }).click();
  await expect(page).toHaveURL(/\/runs\?run=/);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "سجل التشغيل" })).toBeVisible();
  await expect(page.getByRole("group", { name: "تصفية عمليات التشغيل حسب الحالة" }).getByRole("button", { name: "كل عمليات التشغيل" })).toBeVisible();
  const panel = page.getByTestId("step-panel");
  await expect(panel.getByRole("tab", { name: "المُخرجات" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /إعادة التشغيل من هذه الخطوة/ })).toBeVisible();
  await panel.getByRole("button", { name: /إعادة التشغيل من هذه الخطوة/ }).click();
  const dialog = page.getByRole("dialog", { name: /إعادة تشغيل #1 من/ });
  await expect(dialog.getByTestId("rerun-preview")).toContainText("سيُعاد تشغيلها");
  await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
  await noHorizontalScroll(page, "runs (Arabic)");
});

test("account actions in Arabic: user menu and settings reach resend-verification and a confirmed account deletion", { tag: "@cross-browser" }, async ({ page }) => {
  test.setTimeout(90_000);
  const { workspace, email } = await setupUser(page);

  // Settings → the translated account card (RTL page, the address stays LTR).
  await page.goto(`/w/${workspace.slug}/settings?tab=general`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { name: "حسابك" })).toBeVisible();
  await expect(page.getByRole("link", { name: "إعادة إرسال رسالة التأكيد" })).toBeVisible();
  await page.getByRole("link", { name: "إعادة إرسال رسالة التأكيد" }).click();
  await expect(page.getByRole("heading", { name: "إعادة إرسال التأكيد" })).toBeVisible();
  await expectArabic(page);

  // User menu → Delete account → emailed confirmation link → deleted.
  await page.goto(`/w/${workspace.slug}/flows`);
  await page.getByRole("button", { name: "E2E User" }).click();
  await expect(page.getByRole("menuitem", { name: "إعادة إرسال رسالة التأكيد" })).toBeVisible();
  await page.getByRole("menuitem", { name: "حذف الحساب" }).click();
  await expect(page.getByRole("heading", { name: "حذف الحساب" })).toBeVisible();
  await expectArabic(page);
  await page.getByRole("button", { name: "إرسال رابط التأكيد" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم إرسال رابط التأكيد إلى بريدك." })).toBeVisible();
  const mail = await latestEmail(page.request, email, "delete");
  await page.goto(mail.link!);
  await expect(page.getByRole("heading", { name: "تأكيد حذف الحساب" })).toBeVisible();
  await page.getByRole("button", { name: "حذف الحساب" }).click();
  await expect(page.getByRole("status").filter({ hasText: "تم حذف حسابك." })).toBeVisible();
  expect((await page.request.get("/api/me")).status()).toBe(401);
});

test("Arabic settings, agents, knowledge and integrations: every tab and page is translated, RTL, no horizontal scroll", { tag: "@cross-browser" }, async ({ page }) => {
  test.setTimeout(120_000);
  const { workspace } = await setupUser(page);

  // Settings: each tab renders its own Arabic heading; nothing scrolls sideways.
  await page.goto(`/w/${workspace.slug}/settings`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "الإعدادات" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "أقسام الإعدادات" });
  const sections: [tab: string, heading: string][] = [
    ["الأعضاء", "الأعضاء"],
    ["عام", "عام"],
    ["مفاتيح API", "إنشاء مفتاح"],
    ["الخطة والفوترة", "الخطط"],
    ["الاستخدام والحدود", "الاستخدام هذا الشهر"],
    ["سجل التدقيق", "سجل التدقيق"],
    ["SSO", "تسجيل الدخول الموحّد (SSO)"],
  ];
  for (const [tab, heading] of sections) {
    await tabs.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await noHorizontalScroll(page, `settings/${tab}`);
  }
  // Details inside the tabs: translated roles, the billing test-mode badge, the SSO status.
  await tabs.getByRole("button", { name: "الأعضاء", exact: true }).click();
  await expect(page.getByRole("button", { name: "إنشاء رابط دعوة" })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني")).toHaveAttribute("dir", "ltr");
  await tabs.getByRole("button", { name: "الخطة والفوترة", exact: true }).click();
  await expect(page.getByText(/وضع الاختبار/)).toBeVisible();
  await tabs.getByRole("button", { name: "SSO", exact: true }).click();
  await expect(page.getByText("غير مُعدّ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "حفظ إعدادات SSO" })).toBeVisible();

  // Agents: list (empty state) → new-agent form.
  await page.goto(`/w/${workspace.slug}/agents`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "الوكلاء" })).toBeVisible();
  await expect(page.getByText("لا يوجد وكلاء بعد")).toBeVisible();
  await noHorizontalScroll(page, "agents");
  await page.getByRole("link", { name: "وكيل جديد" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "وكيل جديد" })).toBeVisible();
  await expect(page.getByLabel("التعليمات")).toBeVisible();
  await expect(page.getByRole("heading", { name: "الأدوات والصلاحيات" })).toBeVisible();
  await expect(page.getByRole("button", { name: "إنشاء الوكيل" })).toHaveAttribute("aria-disabled", "true");
  await noHorizontalScroll(page, "agents/new");

  // Knowledge
  await page.goto(`/w/${workspace.slug}/knowledge`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "المعرفة" })).toBeVisible();
  await expect(page.getByText("لا توجد معرفة بعد")).toBeVisible();
  await expect(page.getByRole("heading", { name: "اختبار الاسترجاع" })).toBeVisible();
  await expect(page.getByRole("button", { name: "رفع ملف" })).toBeVisible();
  await noHorizontalScroll(page, "knowledge");

  // Integrations: catalog, honest verification badges (incl. the beta scope) and the connect dialog.
  await page.goto(`/w/${workspace.slug}/integrations`);
  await expectArabic(page);
  await expect(page.getByRole("heading", { level: 1, name: "التكاملات" })).toBeVisible();
  await expect(page.getByText("لا توجد اتصالات بعد")).toBeVisible();
  await expect(page.getByText(/^الكتالوج · /)).toBeVisible();
  await expect(page.getByText("✓ المُحوِّل مُنفَّذ").first()).toBeVisible();
  await expect(page.getByText("النسخة التجريبية: لم يُتحقَّق منه بعد مع حساب حقيقي").first()).toBeVisible();
  await noHorizontalScroll(page, "integrations");
  const connect = page.getByRole("button", { name: "ربط", exact: true }).and(page.locator(":not([aria-disabled='true'])")).first();
  await connect.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /^ربط / })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "إلغاء" })).toBeVisible();
  await noHorizontalScroll(page, "integrations/connect");
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(dialog).toHaveCount(0);

  // At phone width the settings navigation and the integrations catalog still fit.
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["settings?tab=keys", "settings?tab=billing", "agents/new", "knowledge", "integrations"]) {
    await page.goto(`/w/${workspace.slug}/${path}`);
    await expectArabic(page);
    await expect(page.locator("h1").first()).toBeVisible();
    await noHorizontalScroll(page, `${path} @375`);
  }
});
