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
/** Visible text of server-rendered markup: a character scan (no tag-stripping regex) that drops everything between "<" and ">". */
const text = (html: string) => {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") inTag = true;
    else if (ch === ">" && inTag) inTag = false;
    else if (!inTag) out += ch;
  }
  return out;
};

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

  describe("handleWriteError behavior", () => {
    it("displays the correct message and refetches on REVISION_CONFLICT", () => {
      const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
      const t = vi.fn((key) => key);
      vi.mock("@/i18n/client", () => ({
        useT: () => t,
      }));

      const { api } = await import("@/lib/api");
      const conflictError = new api.constructor(409, "REVISION_CONFLICT", "Conflict", undefined);
      const refetch = vi.fn();

      // Mock the required state and meData
      vi.mock("@tanstack/react-query", () => ({
        useQuery: ({ queryKey }: { queryKey: string[] }) => {
          if (queryKey[0] === "platform-copy") {
            return { data: { draft: { revision: 5 }, base: { ar: {}, en: {} } }, refetch };
          }
          return { data: { csrfToken: "t", stepUpUntil: null }, refetch: vi.fn() };
        },
      }));

      const handleWriteError = CopyEditor.prototype.handleWriteError;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      handleWriteError.call({ t, setError: vi.fn() }, conflictError, "platformAdmin.copyEditor.saveError");
      expect(t).toHaveBeenCalledWith("platformAdmin.copyEditor.conflict");
      expect(refetch).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("displays stepUp message and refetches me on STEP_UP_REQUIRED", () => {
      const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
      const t = vi.fn((key) => key);
      vi.mock("@/i18n/client", () => ({
        useT: () => t,
      }));

      const { api } = await import("@/lib/api");
      const stepUpError = new api.constructor(403, "STEP_UP_REQUIRED", "Step-up required", undefined);
      const meRefetch = vi.fn();
      const copyRefetch = vi.fn();

      vi.mock("@tanstack/react-query", () => ({
        useQuery: ({ queryKey }: { queryKey: string[] }) => {
          if (queryKey[0] === "platform-copy") {
            return { data: { draft: { revision: 5 }, base: { ar: {}, en: {} } }, refetch: copyRefetch };
          }
          return { data: { csrfToken: "t", stepUpUntil: new Date(Date.now() + 60000).toISOString() }, refetch: meRefetch };
        },
      }));

      const handleWriteError = CopyEditor.prototype.handleWriteError;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      handleWriteError.call({ t, setError: vi.fn() }, stepUpError, "platformAdmin.copyEditor.saveError");
      expect(t).toHaveBeenCalledWith("platformAdmin.copyEditor.stepUp");
      expect(meRefetch).toHaveBeenCalled();
      expect(copyRefetch).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("displays network error message without refetching on network error", () => {
      const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
      const t = vi.fn((key) => key);
      vi.mock("@/i18n/client", () => ({
        useT: () => t,
      }));

      const { api } = await import("@/lib/api");
      const networkError = new api.constructor(0, "NETWORK", "Network error", undefined);
      const refetch = vi.fn();

      vi.mock("@tanstack/react-query", () => ({
        useQuery: ({ queryKey }: { queryKey: string[] }) => {
          if (queryKey[0] === "platform-copy") {
            return { data: { draft: { revision: 5 }, base: { ar: {}, en: {} } }, refetch };
          }
          return { data: { csrfToken: "t", stepUpUntil: null }, refetch: vi.fn() };
        },
      }));

      const handleWriteError = CopyEditor.prototype.handleWriteError;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      handleWriteError.call({ t, setError: vi.fn() }, networkError, "platformAdmin.copyEditor.saveError");
      expect(t).toHaveBeenCalledWith("platformAdmin.copyEditor.networkError");
      expect(refetch).toHaveBeenCalled(); // Network errors trigger refetch (ambiguous outcome)
      consoleError.mockRestore();
    });

    it("displays server error message without refetching on 5xx", () => {
      const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
      const t = vi.fn((key) => key);
      vi.mock("@/i18n/client", () => ({
        useT: () => t,
      }));

      const { api } = await import("@/lib/api");
      const serverError = new api.constructor(500, "INTERNAL_ERROR", "Server error", undefined);
      const refetch = vi.fn();

      vi.mock("@tanstack/react-query", () => ({
        useQuery: ({ queryKey }: { queryKey: string[] }) => {
          if (queryKey[0] === "platform-copy") {
            return { data: { draft: { revision: 5 }, base: { ar: {}, en: {} } }, refetch };
          }
          return { data: { csrfToken: "t", stepUpUntil: null }, refetch: vi.fn() };
        },
      }));

      const handleWriteError = CopyEditor.prototype.handleWriteError;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      handleWriteError.call({ t, setError: vi.fn() }, serverError, "platformAdmin.copyEditor.saveError");
      expect(t).toHaveBeenCalledWith("platformAdmin.copyEditor.serverError");
      expect(refetch).not.toHaveBeenCalled(); // Server errors don't trigger refetch
      consoleError.mockRestore();
    });

    it("displays fallback message for non-API errors without refetching", () => {
      const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
      const t = vi.fn((key) => key);
      vi.mock("@/i18n/client", () => ({
        useT: () => t,
      }));

      const refetch = vi.fn();

      vi.mock("@tanstack/react-query", () => ({
        useQuery: ({ queryKey }: { queryKey: string[] }) => {
          if (queryKey[0] === "platform-copy") {
            return { data: { draft: { revision: 5 }, base: { ar: {}, en: {} } }, refetch };
          }
          return { data: { csrfToken: "t", stepUpUntil: null }, refetch: vi.fn() };
        },
      }));

      const handleWriteError = CopyEditor.prototype.handleWriteError;
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      handleWriteError.call({ t, setError: vi.fn() }, "not an error", "platformAdmin.copyEditor.saveError");
      expect(t).toHaveBeenCalledWith("platformAdmin.copyEditor.saveError");
      expect(refetch).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
