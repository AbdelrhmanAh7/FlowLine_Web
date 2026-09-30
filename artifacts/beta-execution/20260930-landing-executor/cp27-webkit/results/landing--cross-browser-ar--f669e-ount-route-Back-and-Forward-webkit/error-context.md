# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> @cross-browser ar: section links preserve landing content through account-route Back and Forward
- Location: e2e/landing.spec.ts:401:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('h1')
Expected: "سهّل عملك اليومي. دون أيبرمجة."
Received: "سهّل عملك اليومي. دون أي برمجة."
Timeout:  10000ms

Call log:
  - Expect "toHaveText" locator('h1') with timeout 10000ms
  - waiting for locator('h1')
    23 × locator resolved to <h1 class="mt-6 max-w-3xl text-[34px] leading-[40px] font-semibold tracking-tight sm:text-[48px] sm:leading-[56px]">…</h1>
       - unexpected value "سهّل عملك اليومي. دون أي برمجة."

```

```yaml
- heading "سهّل عملك اليومي. دون أي برمجة." [level=1]
```

# Test source

```ts
  317 |         await expect(theme.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  318 |         expect((await context.cookies()).find((c) => c.name === "fl_theme")?.value).toBe(mode);
  319 |       }
  320 | 
  321 |       // Language: English -> Arabic -> English. The header stays inside the viewport in Arabic too.
  322 |       await prefs.getByRole("group", { name: "Language" }).getByRole("button", { name: "العربية", exact: true }).click();
  323 |       await expect(html).toHaveAttribute("lang", "ar");
  324 |       await expect(html).toHaveAttribute("dir", "rtl");
  325 |       await expectHeaderFits(page, "ar", `phone ${width}px ar`);
  326 |       await expectPreferences(page, "ar", width, `phone ${width}px ar`);
  327 |       await prefs.getByRole("group", { name: "المظهر" }).getByRole("button", { name: "فاتح", exact: true }).click();
  328 |       await expect(html).toHaveAttribute("data-theme", "light");
  329 |       await prefs.getByRole("group", { name: "اللغة" }).getByRole("button", { name: "English", exact: true }).click();
  330 |       await expect(html).toHaveAttribute("lang", "en");
  331 |       await expect(html).toHaveAttribute("dir", "ltr");
  332 |       await expectHeaderFits(page, "en", `phone ${width}px back in en`);
  333 |     });
  334 |   }
  335 | 
  336 |   test("phone 375px: the preferences are keyboard operable with a visible focus ring", async ({ page }) => {
  337 |     await page.setViewportSize({ width: 375, height: 812 });
  338 |     await page.goto("/", { waitUntil: "networkidle" });
  339 |     // From the logo link the next stop is the first theme button (the desktop nav is not rendered on phones).
  340 |     await page.locator('header a[href="/"]').first().focus();
  341 |     await page.keyboard.press("Tab");
  342 |     const focused = page.locator(":focus");
  343 |     await expect(focused).toHaveAccessibleName("Light");
  344 |     expect(await focused.evaluate((el) => getComputedStyle(el).boxShadow), "focus-visible ring").not.toBe("none");
  345 |     await page.keyboard.press("Enter");
  346 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  347 |     // Dark, System, then the language buttons; Space activates like Enter.
  348 |     await page.keyboard.press("Tab");
  349 |     await page.keyboard.press("Tab");
  350 |     await page.keyboard.press("Tab");
  351 |     await expect(focused).toHaveAccessibleName("العربية");
  352 |     await page.keyboard.press("Space");
  353 |     await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  354 |   });
  355 | });
  356 | 
  357 | // Owner-requested plain landing copy and visible light/dark illustration cards.
  358 | test.describe("landing copy and illustration contrast @cross-browser", () => {
  359 |   for (const locale of ["en", "ar"] as const) {
  360 |     for (const theme of ["light", "dark"] as const) {
  361 |       test(`${locale}/${theme}: readable illustrations at 360, 768, 1024 and 1440`, async ({ page, context }, testInfo) => {
  362 |         await context.addCookies([
  363 |           { name: "fl_locale", value: locale, url: BASE },
  364 |           { name: "fl_theme", value: theme, url: BASE },
  365 |         ]);
  366 |         await page.goto("/", { waitUntil: "networkidle" });
  367 |         await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  368 |         await expect(page.locator("html")).toHaveAttribute("lang", locale);
  369 |         const hero = page.getByRole("img");
  370 |         await expect(hero).toContainText(locale === "en" ? "Starts the flow" : "يبدأ سير العمل");
  371 |         await expect(hero).not.toContainText(/JSONATA|JSON|IF \/ ELSE|TRIGGER ·/);
  372 |         for (const width of [360, 768, 1024, 1440]) {
  373 |           await resizeTo(page, width);
  374 |           const styles = await hero.evaluate((el) => {
  375 |             const board = getComputedStyle(el);
  376 |             const card = el.querySelector(".rounded-lg")!;
  377 |             const css = getComputedStyle(card);
  378 |             return { grid: board.backgroundImage, dot: board.getPropertyValue("--canvas-dot").trim(), board: board.backgroundColor,
  379 |               card: css.backgroundColor, border: css.borderTopColor, shadow: css.boxShadow,
  380 |               overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  381 |           });
  382 |           expect(styles.grid).toContain("radial-gradient");
  383 |           expect(styles.dot).not.toBe("");
  384 |           expect(styles.grid).not.toContain("transparent 1px, transparent");
  385 |           expect(styles.card).not.toBe(styles.board);
  386 |           expect(styles.border).not.toBe(styles.card);
  387 |           expect(styles.shadow).not.toBe("none");
  388 |           expect(styles.overflow).toBeLessThanOrEqual(1);
  389 |           await hero.scrollIntoViewIfNeeded();
  390 |           await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${theme}-${width}-hero.png`) });
  391 |           const flowTitle = page.getByRole("heading", { name: locale === "en" ? "Follow a flow step by step" : "تابع سير العمل خطوة بخطوة" });
  392 |           await flowTitle.scrollIntoViewIfNeeded();
  393 |           await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${theme}-${width}-flow.png`) });
  394 |         }
  395 |       });
  396 |     }
  397 |   }
  398 | });
  399 | 
  400 | for (const locale of ["en", "ar"] as const) {
  401 |   test(`@cross-browser ${locale}: section links preserve landing content through account-route Back and Forward`, async ({ page, context }) => {
  402 |     await context.addCookies([{ name: "fl_locale", value: locale, url: "http://localhost:3100" }]);
  403 |     await page.setViewportSize({ width: 1440, height: 900 });
  404 |     await page.goto("/");
  405 |     const nav = page.getByRole("navigation", { name: locale === "ar" ? "روابط الموقع" : "Site navigation" });
  406 |     const hero = page.locator("h1");
  407 |     const heroText = await hero.innerText();
  408 |     for (const [name, id] of (locale === "ar" ? [["المنتج", "product"], ["القوالب", "templates"], ["الأسعار", "pricing"]] : [["Product", "product"], ["Templates", "templates"], ["Pricing", "pricing"]])) {
  409 |       await nav.getByRole("link", { name, exact: true }).press("Enter");
  410 |       await expect(page).toHaveURL(new RegExp(`#${id}$`));
  411 |       await expect(page.locator(`#${id}`)).toBeInViewport();
  412 |       await page.getByRole("link", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in", exact: true }).press("Enter");
  413 |       await expect(page).toHaveURL(/\/sign-in$/);
  414 |       await expect(page.getByRole("textbox", { name: locale === "ar" ? "البريد الإلكتروني" : "Email", exact: true })).toBeVisible();
  415 |       await page.goBack();
  416 |       await expect(page).toHaveURL(new RegExp(`#${id}$`));
> 417 |       await expect(hero).toHaveText(heroText);
      |                          ^ Error: expect(locator).toHaveText(expected) failed
  418 |       await expect(nav).toBeVisible();
  419 |       await page.goForward();
  420 |       await expect(page).toHaveURL(/\/sign-in$/);
  421 |       await expect(nav).toHaveCount(0);
  422 |       await page.goBack();
  423 |       await expect(hero).toHaveText(heroText);
  424 |     }
  425 |   });
  426 | }
  427 | 
```