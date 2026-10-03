import { readFileSync } from "node:fs";
import { createElement, type FunctionComponent, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";

// The switchers call useRouter() only inside their click handlers' setters; a stub is enough to render them on the server.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

// Typed without `children` so the tree can be built with createElement's child arguments (react/no-children-prop forbids the prop form).
const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{ locale: Locale }>;
const ServerThemeProvider = (await import("@/theme/client")).ServerThemeProvider as FunctionComponent<{ theme: "dark" }>;
const { ThemeSwitcher } = await import("@/components/theme-switcher");
const { LanguageSwitcher } = await import("@/components/language-switcher");

/**
 * DV2-Q03 / DV2-Q04: the landing header's compact switcher variants. The default rendering (auth form, onboarding wizard, style guide, user menu)
 * must not change; the compact modes must keep the accessible names the E2E specs use.
 */
function render(node: ReactElement, locale: Locale = "en") {
  return renderToStaticMarkup(createElement(I18nProvider, { locale }, createElement(ServerThemeProvider, { theme: "dark" }, node)));
}
/** The <button> elements of a markup string: attributes and inner HTML. */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((m) => ({ attrs: m[1]!, inner: m[2]!, text: m[2]!.replace(/<[^>]*>/g, "").trim() }));
}
const classOf = (attrs: string) => /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
const has = (attrs: string, token: string) => classOf(attrs).split(/\s+/).includes(token);

describe("ThemeSwitcher density", () => {
  it("default rendering is unchanged: icon + text label, 28px tall, no aria-label (the name comes from the text)", () => {
    const bs = buttons(render(createElement(ThemeSwitcher)));
    expect(bs.map((b) => b.text)).toEqual(["Light", "Dark", "System"]);
    for (const b of bs) {
      expect(b.attrs).not.toContain("aria-label");
      expect(has(b.attrs, "h-8") && has(b.attrs, "px-2.5") && has(b.attrs, "gap-1.5")).toBe(true);
      expect(b.inner).not.toContain("<span");
    }
    expect(bs.map((b) => /aria-pressed="(true|false)"/.exec(b.attrs)![1])).toEqual(["false", "true", "false"]);
  });

  it("compact: icon-only, 32px targets, name from aria-label (= the default label text), title and aria-pressed kept", () => {
    const bs = buttons(render(createElement(ThemeSwitcher, { compact: true })));
    expect(bs.map((b) => b.text)).toEqual(["", "", ""]);
    expect(bs.map((b) => /aria-label="([^"]*)"/.exec(b.attrs)![1])).toEqual(["Light", "Dark", "System"]);
    expect(bs.map((b) => /title="([^"]*)"/.exec(b.attrs)![1])).toEqual(["Light", "Dark", "System"]);
    for (const b of bs) {
      expect(has(b.attrs, "h-10") && has(b.attrs, "min-w-10")).toBe(true);
      expect(has(b.attrs, "h-8")).toBe(false);
      expect(b.attrs).toContain("aria-pressed=");
    }
  });

  it("responsive: icon-only below xl (label span hidden), labelled from xl; the accessible name is the same either way", () => {
    const bs = buttons(render(createElement(ThemeSwitcher, { compact: "responsive" })));
    expect(bs.map((b) => /aria-label="([^"]*)"/.exec(b.attrs)![1])).toEqual(["Light", "Dark", "System"]);
    for (const [i, label] of ["Light", "Dark", "System"].entries()) {
      const b = bs[i]!;
      expect(b.inner).toContain(`<span class="hidden xl:inline">${label}</span>`);
      expect(has(b.attrs, "h-10") && has(b.attrs, "xl:h-8") && has(b.attrs, "xl:px-2.5") && has(b.attrs, "xl:gap-1.5")).toBe(true);
    }
  });

  it("Arabic: the accessible names are the Arabic labels", () => {
    const bs = buttons(render(createElement(ThemeSwitcher, { compact: true }), "ar"));
    expect(bs.map((b) => /aria-label="([^"]*)"/.exec(b.attrs)![1])).toEqual(["فاتح", "داكن", "النظام"]);
  });
});

describe("LanguageSwitcher density", () => {
  it("default rendering is unchanged: each language in its own language, 28px tall", () => {
    const bs = buttons(render(createElement(LanguageSwitcher)));
    expect(bs.map((b) => b.text)).toEqual(["العربية", "English"]);
    for (const b of bs) expect(has(b.attrs, "h-8") && has(b.attrs, "px-2.5")).toBe(true);
  });

  it("compact and responsive change only the target size, never the labels", () => {
    const compact = buttons(render(createElement(LanguageSwitcher, { compact: true })));
    expect(compact.map((b) => b.text)).toEqual(["العربية", "English"]);
    for (const b of compact) expect(has(b.attrs, "h-10") && has(b.attrs, "px-2") && !has(b.attrs, "h-8")).toBe(true);
    const responsive = buttons(render(createElement(LanguageSwitcher, { compact: "responsive" })));
    expect(responsive.map((b) => b.text)).toEqual(["العربية", "English"]);
    for (const b of responsive) expect(has(b.attrs, "h-10") && has(b.attrs, "xl:h-8") && has(b.attrs, "xl:px-2.5")).toBe(true);
  });

  it("the menu variant ignores density (user-menu rows keep their sizing and radio semantics)", () => {
    const bs = buttons(render(createElement(LanguageSwitcher, { variant: "menu", compact: "responsive" })));
    for (const b of bs) {
      expect(b.attrs).toContain('role="menuitemradio"');
      expect(has(b.attrs, "h-8")).toBe(true);
      expect(has(b.attrs, "h-10")).toBe(false);
    }
  });
});

describe("landing header markup (src/app/page.tsx)", () => {
  const src = readFileSync("src/app/page.tsx", "utf8");
  const header = /<header[\s\S]*?<\/header>/.exec(src)?.[0] ?? "";

  it("offers both switchers on every viewport: the phone-hiding classes are gone and both use the responsive compact mode", () => {
    expect(header).toContain('<ThemeSwitcher compact="responsive" />');
    expect(header).toContain('<LanguageSwitcher compact="responsive" />');
    expect(header).not.toMatch(/Switcher[^>]*\bhidden\b/);
  });

  it("wraps instead of overflowing, with no document-level overflow hack", () => {
    expect(header).toContain("flex-wrap");
    // Preferences follow account actions below lg and move before them from lg up.
    expect(header).toContain('data-testid="landing-preferences"');
    expect(header).toContain('data-testid="landing-preferences" className="order-2 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 md:justify-end lg:order-1 lg:w-auto');
    expect(src).not.toMatch(/overflow-x-(hidden|clip)/);
  });

  it("keeps the account actions unwrapped so Start free / Sign in never break across lines", () => {
    expect(header).toMatch(/href="\/sign-in" className="[^"]*whitespace-nowrap/);
    // Start free / Open app use the shared `btn` class string, which is nowrap.
    expect(header).toMatch(/href="\/sign-up" className=\{`\$\{btn\}/);
    expect(/const btn = "[^"]*whitespace-nowrap/.test(src)).toBe(true);
  });

  it("keeps account actions before preferences in the DOM and reorders only for the wide visual row", () => {
    const account = header.indexOf('className="order-1 flex items-center gap-3 lg:order-2"');
    const preferences = header.indexOf('data-testid="landing-preferences"');
    expect(account).toBeGreaterThan(-1);
    expect(preferences).toBeGreaterThan(account);
    expect(header.slice(account, preferences)).toContain("order-1");
    expect(header.slice(account, preferences)).toContain("lg:order-2");
    expect(header.slice(preferences)).toContain("order-2");
    expect(header.slice(preferences)).toContain("lg:order-1");
  });
});
