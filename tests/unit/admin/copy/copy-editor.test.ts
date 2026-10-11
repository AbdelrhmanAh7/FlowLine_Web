import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/config";

// Server render with a stubbed query layer: the editor's first paint for each load state (effects and handlers do not run here).
const queries = vi.hoisted(() => ({ state: {} as Record<string, unknown>, me: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => (queryKey[0] === "platform-copy" ? queries.state : queries.me),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const I18nProvider = (await import("@/i18n/client")).I18nProvider as FunctionComponent<{ locale: Locale }>;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
const en = (await import("@/i18n/messages/en.json")).default as { platformAdmin: { copyEditor: Record<string, string> }; common: Record<string, string> };

const render = (locale: Locale = "en") => renderToStaticMarkup(createElement(I18nProvider, { locale }, createElement(CopyEditor)));
const text = (html: string) => html.replace(/<[^>]*>/g, "");

beforeEach(() => {
  queries.state = { isPending: false, isError: false, data: undefined, refetch: vi.fn() };
  queries.me = { data: { csrfToken: "t", stepUpUntil: null }, isError: false, refetch: vi.fn() };
});

describe("CopyEditor error display", () => {
  it("shows the admin-session alert (and keeps the page standing) when /api/platform/me fails", () => {
    queries.me = { data: undefined, isError: true, refetch: vi.fn() };
    const html = render();
    expect(html).toMatch(/<p role="alert"[^>]*>[^<]*<\/p>/);
    expect(text(html)).toContain(en.platformAdmin.copyEditor.meLoadError);
    expect(text(html)).toContain(en.platformAdmin.copyEditor.title);
  });

  it("shows the load error with a Retry button when the copy state fails to load", () => {
    queries.state = { isPending: false, isError: true, data: undefined, refetch: vi.fn() };
    const html = render();
    expect(text(html)).toContain(en.platformAdmin.copyEditor.loadError);
    expect(html).toMatch(new RegExp(`<button[^>]*>${en.common.retry}</button>`));
  });

  it("shows no error alert while loading or when everything loaded", () => {
    queries.state = { isPending: true, isError: false, data: undefined, refetch: vi.fn() };
    const html = render();
    expect(html).not.toContain('role="alert"');
    expect(text(html)).toContain(en.common.loading);
  });

  it("renders the Arabic messages for the same failures (RTL copy, no raw keys)", () => {
    queries.me = { data: undefined, isError: true, refetch: vi.fn() };
    queries.state = { isPending: false, isError: true, data: undefined, refetch: vi.fn() };
    const out = text(render("ar"));
    expect(out).not.toContain("platformAdmin.copyEditor");
    expect(out).toContain("تعذّر تحميل جلسة الإدارة");
    expect(out).toContain("تعذّر تحميل النصوص");
  });
});
