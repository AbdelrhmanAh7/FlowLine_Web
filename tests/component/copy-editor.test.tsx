/**
 * #181 Component tests for CopyEditor error handling, in English and Arabic.
 * Covers: load error with retry, me load error, save/publish REVISION_CONFLICT with refetch,
 * STEP_UP_REQUIRED with me refetch and the step-up prompt, 5xx server error, network error.
 *
 * The query hooks are mocked (so `api` is only ever called by the editor's own writes), but the
 * translator is the real one over the real ar/en catalogues: a renamed or removed key makes the
 * "catalogue" tests and every message assertion fail instead of silently matching a copy.
 */

/// <reference types="@testing-library/jest-dom" />

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CopyEditor } from "@/app/admin/copy/copy-editor";
import { createTranslator, type Translator } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/types";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import { renderWithProviders } from "./setup";

// vi.hoisted runs before the hoisted vi.mock factories below, so the holders are
// always initialised when the component reads them.
const mockUseQuery = vi.hoisted(() => vi.fn());
const i18n = vi.hoisted(() => ({ t: null as unknown }));
const mockApi = vi.mocked(api);

vi.mock("@/i18n/client", () => ({ useT: () => i18n.t }));

// Only the query hooks are replaced; the real QueryClient/QueryClientProvider stay.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: mockUseQuery, useMutation: vi.fn() };
});

const LOCALES: Locale[] = ["en", "ar"];
const ARABIC = /[؀-ۿ]/;
const COPY_URL = "/api/platform/copy";

const baseTitle = { ar: { "meta.title": "العنوان" }, en: { "meta.title": "Title" } };
const draftValue = { ar: { "meta.title": "مسودة" }, en: { "meta.title": "Draft" } };
const publishedValue = { ar: { "meta.title": "منشور" }, en: { "meta.title": "Published" } };
const copyState = {
  base: baseTitle,
  draft: { value: draftValue, revision: 2, setAt: "2024-01-01T00:00:00Z" },
  // Differs from the draft, so "Publish draft" is enabled.
  published: { value: publishedValue, revision: 1, setAt: "2024-01-01T00:00:00Z" },
};
const activeMe = () => ({ csrfToken: "csrf-token", stepUpUntil: new Date(Date.now() + 600_000).toISOString() });

function setup(locale: Locale, options: { stateError?: boolean; meError?: boolean } = {}) {
  const t: Translator = createTranslator(locale);
  i18n.t = t;
  const meData = activeMe();
  // refetch() resolves a QueryObserverResult, so the data sits under `data`.
  const stateRefetch = vi.fn().mockResolvedValue({ data: copyState });
  const meRefetch = vi.fn().mockResolvedValue({ data: meData });

  mockUseQuery.mockImplementation((opt: { queryKey?: readonly unknown[] }) => {
    if (opt.queryKey?.[0] === "platform-copy") {
      return { data: copyState, isError: options.stateError ?? false, isPending: false, error: null, refetch: stateRefetch };
    }
    if (opt.queryKey?.[0] === "platform-me") {
      return { data: options.meError ? undefined : meData, isError: options.meError ?? false, isPending: false, error: null, refetch: meRefetch };
    }
    throw new Error(`Unexpected query ${String(opt.queryKey)}`);
  });
  return { t, stateRefetch, meRefetch };
}

describe("CopyEditor error handling (#181)", () => {
  beforeEach(() => {
    // The api mock comes from tests/component/setup.ts; fail loudly if it is ever the real client.
    expect(vi.isMockFunction(api)).toBe(true);
    vi.clearAllMocks();
    mockApi.mockReset();
    mockUseQuery.mockReset();
  });

  describe("message catalogue", () => {
    const keys: MessageKey[] = [
      "common.retry",
      "errors.NETWORK",
      "errors.REVISION_CONFLICT",
      "platformAdmin.copyEditor.loadError",
      "platformAdmin.copyEditor.saveError",
      "platformAdmin.copyEditor.publishError",
      "platformAdmin.copyEditor.stepUp",
    ];

    it.each(LOCALES)("%s defines every key the error states render", (locale) => {
      const t = createTranslator(locale);
      for (const key of keys) {
        expect(t.has(key), `${locale} is missing ${key}`).toBe(true);
        expect(t(key), `${locale} ${key} resolves to the key itself`).not.toBe(key);
      }
    });

    it("Arabic error copy is Arabic and differs from the English copy", () => {
      const ar = createTranslator("ar");
      const en = createTranslator("en");
      for (const key of keys) {
        expect(ar(key)).toMatch(ARABIC);
        expect(ar(key)).not.toBe(en(key));
      }
    });

    it("verifies that all error keys exist in both ar.json and en.json translation files, ensuring no untranslated strings", () => {
      const getVal = (obj: unknown, path: string): unknown =>
        path.split(".").reduce((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

      for (const key of keys) {
        const arVal = getVal(arMessages, key);
        const enVal = getVal(enMessages, key);
        expect(typeof arVal, `ar.json is missing key "${key}"`).toBe("string");
        expect(typeof enVal, `en.json is missing key "${key}"`).toBe("string");
        expect(arVal, `ar.json key "${key}" must differ from en.json (no untranslated strings)`).not.toBe(enVal);
        expect(arVal, `ar.json key "${key}" must contain Arabic characters`).toMatch(ARABIC);
        expect(enVal, `en.json key "${key}" must not be empty`).not.toBe("");
      }
    });
  });

  describe.each(LOCALES)("locale %s", (locale) => {
    let user: ReturnType<typeof userEvent.setup>;
    beforeEach(() => {
      user = userEvent.setup();
    });

    async function edit(t: Translator) {
      await user.type(screen.getByLabelText(t("platformAdmin.copyEditor.english")), " edited");
      const save = screen.getByRole("button", { name: t("platformAdmin.copyEditor.save") });
      expect(save).toBeEnabled();
      return save;
    }

    // The exact request each write sends: the typed English edit against draft revision 2, or a publish of
    // draft revision 2 over published revision 1, always with the session's CSRF token.
    const writes = [
      {
        name: "save",
        fallback: "platformAdmin.copyEditor.saveError" as const,
        request: { method: "PATCH", json: { action: "edit", edits: [{ locale: "en", key: "meta.title", value: "Draft edited" }], expectedRevision: 2 } },
      },
      {
        name: "publish",
        fallback: "platformAdmin.copyEditor.publishError" as const,
        request: { method: "POST", json: { action: "publish", expectedDraftRevision: 2, expectedPublishedRevision: 1 } },
      },
    ];

    function expectOneWrite(request: (typeof writes)[number]["request"]) {
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith(COPY_URL, { ...request, headers: { "x-flowline-csrf": "csrf-token" } });
    }

    async function trigger(name: string, t: Translator) {
      renderWithProviders(<CopyEditor />);
      await waitFor(() => expect(screen.getByText(t("platformAdmin.copyEditor.title"))).toBeInTheDocument());
      if (name === "save") return edit(t);
      const publish = screen.getByRole("button", { name: t("platformAdmin.copyEditor.apply") });
      expect(publish).toBeEnabled();
      return publish;
    }

    describe("load errors", () => {
      it("shows the load error with a Retry button that refetches the copy", async () => {
        const { t, stateRefetch } = setup(locale, { stateError: true });
        renderWithProviders(<CopyEditor />);

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(t("platformAdmin.copyEditor.loadError"));
        const retry = screen.getByRole("button", { name: t("common.retry") });
        // The queries are mocked, so the load path must never call the write api().
        expect(mockApi).not.toHaveBeenCalled();

        await user.click(retry);
        expect(stateRefetch).toHaveBeenCalledTimes(1);
      });

      it("keeps the editor and shows the step-up prompt when the admin session fails to load", async () => {
        const { t } = setup(locale, { meError: true });
        renderWithProviders(<CopyEditor />);

        expect(await screen.findByRole("note")).toHaveTextContent(t("platformAdmin.copyEditor.stepUp"));
        expect(screen.getByText(t("platformAdmin.copyEditor.title"))).toBeInTheDocument();
        // No admin session means no write controls; publish stays disabled too.
        expect(screen.getByRole("button", { name: t("platformAdmin.copyEditor.apply") })).toBeDisabled();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
      });
    });

    describe.each(writes)("$name errors", ({ name, request, fallback }) => {
      it.each([
        ["REVISION_CONFLICT", new ApiError(409, "REVISION_CONFLICT", "Revision mismatch (server text)"), "errors.REVISION_CONFLICT" as const],
        ["NETWORK", new ApiError(0, "NETWORK", "Failed to fetch (client text)", true), "errors.NETWORK" as const],
      ])("%s renders the translated errors.* message and refetches the copy", async (_code, failure, key) => {
        const { t, stateRefetch } = setup(locale);
        mockApi.mockRejectedValueOnce(failure);
        await user.click(await trigger(name, t));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(t(key));
        expect(alert.textContent).not.toContain("(server text)");
        expect(alert.textContent).not.toContain("(client text)");
        if (locale === "ar") expect(alert.textContent).toMatch(ARABIC);
        expect(stateRefetch).toHaveBeenCalledTimes(1);
        expectOneWrite(request);
      });

      it("NETWORK error shows the message immediately without awaiting the refetch", async () => {
        const { t, stateRefetch } = setup(locale);
        // Make the refetch slow to verify the error appears first
        let refetchResolve: (value: unknown) => void;
        const refetchPromise = new Promise((resolve) => { refetchResolve = resolve; });
        stateRefetch.mockReturnValue(refetchPromise);
        mockApi.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Failed to fetch", true));
        await user.click(await trigger(name, t));

        // The error alert should appear without waiting for the refetch to resolve
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(t("errors.NETWORK"));
        expect(stateRefetch).toHaveBeenCalledTimes(1);
        // Now resolve the refetch to clean up
        refetchResolve!({ data: copyState });
        await refetchPromise;
        expectOneWrite(request);
      });

      it("a 5xx renders the fallback message (not the server text) and refetches the copy", async () => {
        const { t, stateRefetch } = setup(locale);
        mockApi.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong on our side (server text)"));
        await user.click(await trigger(name, t));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(t(fallback));
        expect(alert.textContent).not.toContain("(server text)");
        expect(stateRefetch).toHaveBeenCalledTimes(1);
        expectOneWrite(request);
      });

      it("STEP_UP_REQUIRED refetches the admin session, shows the step-up prompt and disables writes", async () => {
        const { t, stateRefetch, meRefetch } = setup(locale);
        // The refreshed session reports the step-up as expired.
        meRefetch.mockResolvedValue({ data: { csrfToken: "csrf-token", stepUpUntil: null } });
        mockApi.mockRejectedValueOnce(new ApiError(403, "STEP_UP_REQUIRED", "Step-up needed (server text)"));
        const button = await trigger(name, t);
        // Step-up is active before the write: no prompt yet.
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
        await user.click(button);

        const stepUp = t("platformAdmin.copyEditor.stepUp");
        expect(await screen.findByRole("alert")).toHaveTextContent(stepUp);
        // The step-up state changed: the standing prompt appears and the write controls are disabled.
        expect(screen.getByRole("note")).toHaveTextContent(stepUp);
        expect(button).toBeDisabled();
        expect(meRefetch).toHaveBeenCalledTimes(1);
        // Only the session is refreshed: the copy state is left alone.
        expect(stateRefetch).not.toHaveBeenCalled();
        expect(screen.getByRole("alert").textContent).not.toContain("(server text)");
        expectOneWrite(request);
      });
    });
  });
});
