import { Fragment, createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";

// Server render with a stubbed query layer: the editor's first paint for each load state (effects and handlers do not run here).
const queries = vi.hoisted(() => ({ state: {} as Record<string, unknown>, me: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => (queryKey[0] === "platform-copy" ? queries.state : queries.me),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{ locale: Locale }>;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");

const render = (locale: Locale) => renderToStaticMarkup(createElement(I18nProvider, { locale }, createElement(CopyEditor)));
/** `text` as React writes it into markup (& < > " ' escaped); compared with toContain, so no pattern escaping is needed. */
const inMarkup = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** A copy state that loaded: one key in both locales, draft and published at revision 1. */
const loaded = { base: { ar: { "meta.title": "فلولاين" }, en: { "meta.title": "Flowline" } }, draft: { value: { ar: {}, en: {} }, revision: 1, setAt: null }, published: { value: { ar: {}, en: {} }, revision: 1, setAt: null } };
const session = { csrfToken: "t", stepUpUntil: null };

beforeEach(() => {
  queries.state = { isPending: false, isError: false, isLoadingError: false, data: loaded, refetch: vi.fn() };
  queries.me = { data: session, isError: false, isLoadingError: false, refetch: vi.fn() };
});

describe.each(["en", "ar"] as const)("CopyEditor error display (%s)", (locale) => {
  const t = createTranslator(locale);

  it("shows the admin-session alert, and keeps the page standing, when /api/platform/me never loaded", () => {
    queries.me = { data: undefined, isError: true, isLoadingError: true, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toMatch(/<p role="alert"[^>]*>/);
    expect(html).toContain(">" + inMarkup(t("platformAdmin.copyEditor.meLoadError")) + "</p>");
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.title")));
  });

  it("shows the load error with a Retry button when the copy state never loaded", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: true, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.loadError")));
    expect(html).toContain(">" + inMarkup(t("ui.retry")) + "</button>");
    expect(html).not.toContain("platformAdmin.copyEditor"); // a missing translation would show the raw key
  });

  it("keeps the editor, with no load or session alert, when a later reload fails", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: false, data: loaded, refetch: vi.fn() };
    queries.me = { data: session, isError: true, isLoadingError: false, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toContain(inMarkup(t("platformAdmin.copyEditor.search")));
    expect(html).not.toContain('role="alert"');
  });

  it("shows no error alert while loading", () => {
    queries.state = { isPending: true, isError: false, isLoadingError: false, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain(inMarkup(t("common.loading")));
  });
});
