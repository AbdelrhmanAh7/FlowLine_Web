import { createElement, type FunctionComponent } from "react";
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

const render = (locale: Locale = "en") => renderToStaticMarkup(createElement(I18nProvider, { locale }, createElement(CopyEditor)));
/** Removes tags repeatedly until none remain, so nested fragments cannot survive one pass. */
function stripTags(html: string): string {
  let prev: string;
  let out = html;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== prev);
  return out;
}

const loaded = {
  base: { ar: { "meta.title": "فلولاين" }, en: { "meta.title": "Flowline" } },
  draft: { value: { ar: {}, en: {} }, revision: 1, setAt: null },
  published: { value: { ar: {}, en: {} }, revision: 1, setAt: null },
};
const session = { csrfToken: "t", stepUpUntil: null };

beforeEach(() => {
  queries.state = { isPending: false, isError: false, isLoadingError: false, isFetching: false, data: loaded, refetch: vi.fn() };
  queries.me = { data: session, isError: false, isLoadingError: false, refetch: vi.fn() };
});

describe.each(["en", "ar"] as const)("CopyEditor error display (%s)", (locale) => {
  const t = createTranslator(locale);

  it("shows the admin-session alert (and keeps the page standing) when /api/platform/me fails to load", () => {
    queries.me = { data: undefined, isError: true, isLoadingError: true, refetch: vi.fn() };
    const html = render(locale);
    expect(html).toMatch(/<p role="alert"[^>]*>/);
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.meLoadError"));
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.title"));
    expect(html).not.toContain("platformAdmin.copyEditor");
  });

  it("shows the load error with a Retry button when the copy state fails to load", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: true, isFetching: false, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.loadError"));
    expect(html).toMatch(new RegExp(`<button[^>]*>${t("ui.retry")}</button>`));
    expect(html).not.toContain("platformAdmin.copyEditor");
  });

  it("keeps the editor, with no load or session alert, when a later background reload fails", () => {
    queries.state = { isPending: false, isError: true, isLoadingError: false, isFetching: false, data: loaded, refetch: vi.fn() };
    queries.me = { data: session, isError: true, isLoadingError: false, refetch: vi.fn() };
    const html = render(locale);
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.search"));
    expect(html).not.toContain('role="alert"');
  });

  it("shows no error alert while initial loading is in progress", () => {
    queries.state = { isPending: true, isError: false, isLoadingError: false, isFetching: false, data: undefined, refetch: vi.fn() };
    const html = render(locale);
    expect(html).not.toContain('role="alert"');
    expect(stripTags(html)).toContain(t("common.loading"));
  });

  it("renders a visual indicator when copy state background refresh is in progress", () => {
    queries.state = { isPending: false, isError: false, isLoadingError: false, isFetching: true, data: loaded, refetch: vi.fn() };
    const html = render(locale);
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.refreshing"));
    expect(html).not.toContain("platformAdmin.copyEditor");
  });
  it("renders the step-up warning note when step-up is inactive on initial render", () => {
    const html = render(locale);
    expect(html).toMatch(/<p role="note"[^>]*>/);
    expect(stripTags(html)).toContain(t("platformAdmin.copyEditor.stepUp"));
    expect(html).not.toContain("platformAdmin.copyEditor");
  });
});
