import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./stack";

/**
 * The landing page scroll experience: every section reachable by scrolling, no console errors, and
 * fully static under reduced motion (the global Playwright default) — scroll scenes have no transforms
 * or animations. RTL must never scroll horizontally. With motion allowed, scroll reveals end fully visible
 * and (where the browser has scroll timelines) the pinned hero scrubs from the wrapper's named view timeline.
 */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((done) => {
      let last = -1;
      const step = () => {
        window.scrollBy(0, window.innerHeight * 0.8);
        const y = window.scrollY;
        if (Math.ceil(y + window.innerHeight) >= document.documentElement.scrollHeight && y === last) return done();
        last = y;
        setTimeout(step, 60);
      };
      step();
    });
  });
}

/**
 * Brings every reveal element to the middle of the viewport, one by one. `scrollThrough` moves 80% of a viewport per step but the
 * reveal observers only count the middle 70% (rootMargin -15%), so a short element can sit in the 10% gap between two steps and never
 * intersect: centring each element is what makes "everything ends up revealed" deterministic.
 */
async function centreEachReveal(page: Page) {
  await page.evaluate(async () => {
    const frames = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".reveal, .word-reveal"))) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await frames();
    }
  });
}

/** Number of reveal blocks / words whose computed opacity is not 1 (the end state of every reveal). */
const notFullyOpaque = (page: Page) => page.locator(".reveal, .word-reveal .word").evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== "1").length);

test.describe("landing scroll experience", () => {
  test("scrolls through every section with no console errors", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await scrollThrough(page);
    for (const id of ["product", "features", "templates", "pricing"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    // Honesty: the integrations scene lists real apps with their real live status.
    await expect(page.getByText(/Verified live/).first()).toBeVisible();
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("reduced motion: scroll scenes are static", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // Hero visual: no transform, no animation (the pin/scrub markup is not even rendered).
    const hero = page.getByRole("img", { name: /illustration of a flow/i });
    await expect(hero).toBeVisible();
    const heroStyles = await hero.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.transform, animationName: cs.animationName };
    });
    expect(heroStyles.transform).toBe("none");
    expect(heroStyles.animationName).toBe("none");
    // The transform lives on the PARENT (.hero-scrub), not on the role=img child above: assert on it directly. The pin is off too
    // (no sticky stage, no tall wrapper: no dead scroll space).
    const scrub = await page.locator(".hero-scrub").evaluate((el) => {
      const cs = getComputedStyle(el);
      const pin = el.closest(".hero-pin") as HTMLElement;
      return { transform: cs.transform, animationName: cs.animationName, stage: getComputedStyle(el.parentElement!).position, pinHeight: pin.getBoundingClientRect().height, viewport: window.innerHeight };
    });
    expect(scrub.transform).toBe("none");
    expect(scrub.animationName).toBe("none");
    expect(scrub.stage).toBe("static");
    expect(scrub.pinHeight).toBeLessThan(scrub.viewport);
    // The flow scene renders fully lit (nothing waits for scroll).
    await scrollThrough(page);
    const unlit = await page.locator("[data-lit]").count();
    expect(unlit).toBeGreaterThan(0);
    // Reveals never hide under reduced motion: after scrolling, every block and word is at opacity 1 (and none is armed as hidden).
    await centreEachReveal(page);
    expect(await page.locator('[data-reveal="hidden"]').count()).toBe(0);
    expect(await page.locator(".reveal, .word-reveal .word").count()).toBeGreaterThan(5);
    expect(await notFullyOpaque(page)).toBe(0);
  });

  for (const width of [375, 1024, 1440]) {
    test(`RTL: no horizontal scroll at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 812 });
      await context.addCookies([{ name: "fl_locale", value: "ar", url: BASE_URL }]);
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await scrollThrough(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("landing scroll experience with motion allowed (desktop)", () => {
  test.use({ reducedMotion: "no-preference", viewport: { width: 1440, height: 900 } });

  test("scroll reveals end fully visible (opacity 1, none left hidden)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // The enhancement armed itself: with motion allowed the reveal elements carry a data-reveal state (hidden until seen, then shown).
    await expect.poll(() => page.locator("[data-reveal]").count()).toBeGreaterThan(5);
    await scrollThrough(page);
    await centreEachReveal(page);
    await expect(page.locator('[data-reveal="hidden"]')).toHaveCount(0);
    expect(await page.locator('[data-reveal="shown"]').count()).toBeGreaterThan(5);
    // End state of every transition (<= 300 ms, so the retrying poll settles at once): fully opaque and untransformed.
    await expect.poll(() => notFullyOpaque(page), { message: "every .reveal block and .word must end at opacity 1" }).toBe(0);
    const moved = await page.locator(".reveal, .word-reveal .word").evaluateAll((els) => els.filter((e) => getComputedStyle(e).transform !== "none").length);
    expect(moved).toBe(0);
  });

  test("hero scrub: .hero-scrub runs on the wrapper's named view timeline where the browser supports scroll timelines", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
    const scrub = await page.locator(".hero-scrub").evaluate((el) => {
      const cs = getComputedStyle(el);
      const pin = el.closest(".hero-pin") as HTMLElement;
      return {
        animationName: cs.animationName,
        animationTimeline: cs.animationTimeline,
        pinTimelineName: getComputedStyle(pin).getPropertyValue("view-timeline-name").trim(),
        stage: getComputedStyle(el.parentElement!).position,
        pinHeight: pin.getBoundingClientRect().height,
        viewport: window.innerHeight,
      };
    });
    if (supported) {
      expect(scrub.animationName).toBe("m-hero-scrub");
      // A named timeline declared on .hero-pin (an anonymous view() on the pinned element itself would not advance while pinned).
      expect(scrub.animationTimeline).toBe("--hero-pin");
      expect(scrub.pinTimelineName).toBe("--hero-pin");
      expect(scrub.stage).toBe("sticky");
      expect(scrub.pinHeight).toBeGreaterThan(scrub.viewport * 1.5);
    } else {
      // No scroll timelines: plain static hero, no pin and no dead scroll space.
      expect(scrub.animationName).toBe("none");
      expect(scrub.stage).toBe("static");
      expect(scrub.pinHeight).toBeLessThan(scrub.viewport);
    }
  });

  test("hero scrub: the scale/tilt plays WHILE the stage is pinned (not only at pin release)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    if (!(await page.evaluate(() => CSS.supports("animation-timeline: view()")))) {
      // No scroll-driven animations in this browser: the hero is the static fallback (its full structure is asserted in the test above).
      expect(await page.locator(".hero-scrub").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
      return;
    }
    const geometry = await page.evaluate(() => ({ top: document.querySelector(".hero-pin")!.getBoundingClientRect().top + window.scrollY, height: window.innerHeight }));
    const at = (y: number) =>
      page.evaluate(async (target) => {
        window.scrollTo(0, target);
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
        const scrub = document.querySelector<HTMLElement>(".hero-scrub")!;
        const matrix = /^matrix(?:3d)?\(([^)]+)\)$/.exec(getComputedStyle(scrub).transform);
        // m11 of matrix()/matrix3d() is the x scale (rotateX does not touch it): 1 -> 0.94 over the scrub.
        return { scale: matrix ? parseFloat(matrix[1]!.split(",")[0]!) : 1, stageTop: scrub.parentElement!.getBoundingClientRect().top };
      }, y);
    // The timeline is the 170vh wrapper: 0% when its top reaches the viewport top, 100% 70vh of scroll later.
    const before = await at(Math.max(0, geometry.top - 300));
    const mid = await at(geometry.top + geometry.height * 0.35);
    const end = await at(geometry.top + geometry.height * 0.7 + 60);
    expect(before.scale).toBeGreaterThan(0.995);
    expect(mid.scale, "half-way through the pinned span the visual is half-way scaled").toBeGreaterThan(0.95);
    expect(mid.scale).toBeLessThan(0.985);
    expect(end.scale).toBeLessThan(0.945);
    // ...and the stage really is pinned over that span (it does not move while the scrub plays).
    expect(Math.abs(mid.stageTop - end.stageTop)).toBeLessThanOrEqual(2);
    expect(mid.stageTop).toBeGreaterThan(0);
    expect(mid.stageTop).toBeLessThan(geometry.height / 2);
  });
});

/**
 * The public header (DV2-Q03 / DV2-Q04). It must fit the viewport at every width from 360 to 1440 in both languages and both themes (no clipped
 * "Start free", no document-level horizontal scroll), and a phone visitor must be able to change theme and language from it. Layout: one row
 * from lg (1024) up; below lg two rows, the second one holding the preferences (`data-testid="landing-preferences"`).
 */
const BASE = BASE_URL;
type HeaderLocale = "en" | "ar";
const HEADER = {
  en: { theme: "Theme", language: "Language", modes: ["Light", "Dark", "System"], startFree: "Start free" },
  ar: { theme: "المظهر", language: "اللغة", modes: ["فاتح", "داكن", "النظام"], startFree: "ابدأ مجانًا" },
} as const;
/** Every breakpoint edge (sm 640, md 768, lg 1024, xl 1280) on both sides, plus the phone and desktop widths QA used. */
const HEADER_WIDTHS = [360, 375, 390, 414, 600, 639, 640, 767, 768, 800, 1023, 1024, 1279, 1280, 1440];

const nextFrames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** Resizes and lets layout settle (the header is pure CSS, so no reload is needed between widths). */
async function resizeTo(page: Page, width: number, height = 950) {
  await page.setViewportSize({ width, height });
  await nextFrames(page);
}

/** The document does not scroll sideways, every visible link/button in the header lies fully inside the viewport, and "Start free" is one of them. */
async function expectHeaderFits(page: Page, locale: HeaderLocale, where: string) {
  const m = await page.evaluate(() => {
    const header = document.querySelector("header")!;
    const controls = Array.from(header.querySelectorAll<HTMLElement>("a, button"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(), left: r.left, right: r.right };
      });
    return { inner: window.innerWidth, scroll: document.documentElement.scrollWidth, headerHeight: header.getBoundingClientRect().height, controls };
  });
  expect(m.scroll, `${where}: document scrollWidth ${m.scroll} exceeds innerWidth ${m.inner}`).toBeLessThanOrEqual(m.inner);
  for (const c of m.controls) {
    expect(c.left, `${where}: "${c.name}" starts left of the viewport`).toBeGreaterThanOrEqual(-0.5);
    expect(c.right, `${where}: "${c.name}" ends past the viewport (${c.right} > ${m.inner})`).toBeLessThanOrEqual(m.inner + 0.5);
  }
  // Start free: present, visible and fully inside the viewport (the DV2-Q03 symptom was a CTA cut off at the right edge).
  const cta = page.getByRole("link", { name: HEADER[locale].startFree, exact: true });
  await expect(cta, `${where}: Start free`).toBeVisible();
  const box = (await cta.boundingBox())!;
  expect(box.x, `${where}: Start free left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${where}: Start free right edge`).toBeLessThanOrEqual(m.inner);
  // No accidental wrapping: one row (64px) from lg up; below lg at most the two intended rows (about 88px), never a third.
  expect(m.headerHeight, `${where}: header height`).toBeLessThanOrEqual(m.inner >= 1024 ? 72 : 110);
}

/** Language and theme controls are all there, named, and big enough to hit; icon-only below xl, labelled from xl. */
async function expectPreferences(page: Page, locale: HeaderLocale, width: number, where: string) {
  const names = HEADER[locale];
  const prefs = page.getByTestId("landing-preferences");
  const theme = prefs.getByRole("group", { name: names.theme });
  const language = prefs.getByRole("group", { name: names.language });
  for (const mode of names.modes) await expect(theme.getByRole("button", { name: mode, exact: true }), `${where}: ${mode}`).toBeVisible();
  await expect(language.getByRole("button", { name: "العربية", exact: true })).toBeVisible();
  await expect(language.getByRole("button", { name: "English", exact: true })).toBeVisible();
  const sizes = await prefs.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute("aria-label") ?? el.textContent ?? "", width: r.width, height: r.height };
    }),
  );
  expect(sizes, where).toHaveLength(5);
  for (const s of sizes) {
    expect(s.width, `${where}: "${s.name}" target width`).toBeGreaterThanOrEqual(24);
    expect(s.height, `${where}: "${s.name}" target height`).toBeGreaterThanOrEqual(width < 1280 ? 32 : 24);
  }
  const themeButtons = await theme.getByRole("button").evaluateAll((els) => els.map((el) => ({ text: (el as HTMLElement).innerText.trim(), width: el.getBoundingClientRect().width })));
  themeButtons.forEach((b, i) => {
    if (width < 1280) {
      // Icon-only: no visible text, but the accessible name (checked above by role + name) is the label.
      expect(b.text, `${where}: compact theme button ${i} has no visible text`).toBe("");
      expect(b.width, `${where}: compact theme button ${i} width`).toBeGreaterThanOrEqual(32);
    } else {
      expect(b.text, `${where}: labelled theme button ${i}`).toBe(names.modes[i]);
    }
  });
}

test.describe("landing header: fits every width, keeps theme and language reachable", () => {
  for (const locale of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`fits from 360 to 1440 without horizontal overflow (${locale}, ${theme})`, async ({ page, context }) => {
        await context.addCookies([
          { name: "fl_locale", value: locale, url: BASE },
          { name: "fl_theme", value: theme, url: BASE },
        ]);
        await page.setViewportSize({ width: 1440, height: 950 });
        await page.goto("/", { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        for (const width of HEADER_WIDTHS) {
          await resizeTo(page, width);
          await expectHeaderFits(page, locale, `${locale}/${theme}/${width}px`);
          await expectPreferences(page, locale, width, `${locale}/${theme}/${width}px`);
        }
      });
    }

    test(`768x950 and 1440: no horizontal overflow and Start free fully inside the viewport (${locale})`, async ({ page, context }) => {
      await context.addCookies([{ name: "fl_locale", value: locale, url: BASE }]);
      await page.setViewportSize({ width: 768, height: 950 });
      await page.goto("/", { waitUntil: "networkidle" });
      await expectHeaderFits(page, locale, `${locale}/768px`);
      await resizeTo(page, 1440);
      await expectHeaderFits(page, locale, `${locale}/1440px`);
    });
  }

  for (const width of [375, 360]) {
    test(`phone ${width}px: theme and language can be changed from the header`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/", { waitUntil: "networkidle" });
      const html = page.locator("html");
      await expect(html).toHaveAttribute("dir", "ltr");
      await expectHeaderFits(page, "en", `phone ${width}px en`);
      await expectPreferences(page, "en", width, `phone ${width}px en`);

      // Theme: default is dark; every choice is applied by the server (data-theme) and stored in the cookie.
      const prefs = page.getByTestId("landing-preferences");
      const theme = prefs.getByRole("group", { name: "Theme" });
      await expect(theme.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const [mode, label] of [["light", "Light"], ["system", "System"], ["dark", "Dark"]] as const) {
        await theme.getByRole("button", { name: label, exact: true }).click();
        await expect(html).toHaveAttribute("data-theme", mode);
        await expect(theme.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
        expect((await context.cookies()).find((c) => c.name === "fl_theme")?.value).toBe(mode);
      }

      // Language: English -> Arabic -> English. The header stays inside the viewport in Arabic too.
      await prefs.getByRole("group", { name: "Language" }).getByRole("button", { name: "العربية", exact: true }).click();
      await expect(html).toHaveAttribute("lang", "ar");
      await expect(html).toHaveAttribute("dir", "rtl");
      await expectHeaderFits(page, "ar", `phone ${width}px ar`);
      await expectPreferences(page, "ar", width, `phone ${width}px ar`);
      await prefs.getByRole("group", { name: "المظهر" }).getByRole("button", { name: "فاتح", exact: true }).click();
      await expect(html).toHaveAttribute("data-theme", "light");
      await prefs.getByRole("group", { name: "اللغة" }).getByRole("button", { name: "English", exact: true }).click();
      await expect(html).toHaveAttribute("lang", "en");
      await expect(html).toHaveAttribute("dir", "ltr");
      await expectHeaderFits(page, "en", `phone ${width}px back in en`);
    });
  }

  test("phone 375px: the preferences are keyboard operable with a visible focus ring", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/", { waitUntil: "networkidle" });
    // From the logo link the next stop is the first theme button (the desktop nav is not rendered on phones).
    await page.locator('header a[href="/"]').first().focus();
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAccessibleName("Light");
    expect(await focused.evaluate((el) => getComputedStyle(el).boxShadow), "focus-visible ring").not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    // Dark, System, then the language buttons; Space activates like Enter.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(focused).toHaveAccessibleName("العربية");
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

// Owner-requested plain landing copy and visible light/dark illustration cards.
test.describe("landing copy and illustration contrast @cross-browser", () => {
  for (const locale of ["en", "ar"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${locale}/${theme}: readable illustrations at 360, 768, 1024 and 1440`, async ({ page, context }, testInfo) => {
        await context.addCookies([
          { name: "fl_locale", value: locale, url: BASE },
          { name: "fl_theme", value: theme, url: BASE },
        ]);
        await page.goto("/", { waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        const hero = page.getByRole("img");
        await expect(hero).toContainText(locale === "en" ? "Starts the flow" : "يبدأ سير العمل");
        await expect(hero).not.toContainText(/JSONATA|JSON|IF \/ ELSE|TRIGGER ·/);
        for (const width of [360, 768, 1024, 1440]) {
          await resizeTo(page, width);
          const styles = await hero.evaluate((el) => {
            const board = getComputedStyle(el);
            const card = el.querySelector(".rounded-lg")!;
            const css = getComputedStyle(card);
            return { grid: board.backgroundImage, dot: board.getPropertyValue("--canvas-dot").trim(), board: board.backgroundColor,
              card: css.backgroundColor, border: css.borderTopColor, shadow: css.boxShadow,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
          });
          expect(styles.grid).toContain("radial-gradient");
          expect(styles.dot).not.toBe("");
          expect(styles.grid).not.toContain("transparent 1px, transparent");
          expect(styles.card).not.toBe(styles.board);
          expect(styles.border).not.toBe(styles.card);
          expect(styles.shadow).not.toBe("none");
          expect(styles.overflow).toBeLessThanOrEqual(1);
          await hero.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${theme}-${width}-hero.png`) });
          const flowTitle = page.getByRole("heading", { name: locale === "en" ? "Follow a flow step by step" : "تابع سير العمل خطوة بخطوة" });
          await flowTitle.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`landing-${locale}-${theme}-${width}-flow.png`) });
        }
      });
    }
  }
});

for (const locale of ["en", "ar"] as const) {
  test(`@cross-browser ${locale}: section links preserve landing content through account-route Back and Forward`, async ({ page, context }) => {
    await context.addCookies([{ name: "fl_locale", value: locale, url: BASE_URL }]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: locale === "ar" ? "روابط الموقع" : "Site navigation" });
    const hero = page.locator("h1");
    const heroText = (await hero.textContent())!;
    for (const [name, id] of (locale === "ar" ? [["المنتج", "product"], ["القوالب", "templates"], ["الأسعار", "pricing"]] : [["Product", "product"], ["Templates", "templates"], ["Pricing", "pricing"]])) {
      await nav.getByRole("link", { name, exact: true }).press("Enter");
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
      await page.getByRole("link", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in", exact: true }).press("Enter");
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("textbox", { name: locale === "ar" ? "البريد الإلكتروني" : "Email", exact: true })).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(hero).toHaveText(heroText);
      await expect(nav).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(nav).toHaveCount(0);
      await page.goBack();
      await expect(hero).toHaveText(heroText);
    }
  });
}
