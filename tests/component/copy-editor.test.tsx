/**
 * #181 Component tests for CopyEditor error handling.
 * Covers: load error with retry, me load error, save/publish REVISION_CONFLICT with refetch,
 * STEP_UP_REQUIRED with me refetch and stepUp error, 5xx server error, network error.
 * The load error, save revision-conflict, save step-up, 5xx and network cases assert the Arabic
 * message as well; the me-load error and the publish paths run in English only.
 */

/// <reference types="@testing-library/jest-dom" />

import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CopyEditor } from "@/app/admin/copy/copy-editor";
import { api, ApiError } from "@/lib/api";
import { renderWithProviders } from "./setup";

// vi.hoisted runs before the hoisted vi.mock factories below, so the mocks are
// always initialised when the component reads them.
const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseT = vi.hoisted(() => vi.fn());
const mockApi = vi.mocked(api);

vi.mock("@/i18n/client", () => ({
  useT: () => mockUseT,
}));

// Only the query hooks are replaced; the real QueryClient/QueryClientProvider stay
// so the shared renderWithProviders builds a real client instead of a mock instance.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: mockUseQuery, useMutation: vi.fn() };
});

let user: UserEvent;

function createMockData(_locale: "en" | "ar") {
  const stateData = {
    base: { ar: { "meta.title": _locale === "ar" ? "العنوان" : "Title" }, en: { "meta.title": _locale === "ar" ? "العنوان" : "Title" } },
    draft: { value: { ar: { "meta.title": _locale === "ar" ? "مسودة" : "Draft" }, en: { "meta.title": _locale === "ar" ? "مسودة" : "Draft" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
    published: { value: { ar: { "meta.title": _locale === "ar" ? "منشور" : "Published" }, en: { "meta.title": _locale === "ar" ? "منشور" : "Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
  };
  const meData = { csrfToken: "csrf-token", stepUpUntil: new Date(Date.now() + 600_000).toISOString() };
  return { stateData, meData };
}

function getTranslations(_locale: "en" | "ar") {
  return {
    "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
    "common.retry": { en: "Retry", ar: "إعادة المحاولة" },
    "platformAdmin.copyEditor.title": { en: "Copy editor", ar: "تحرير النصوص" },
    "platformAdmin.copyEditor.subtitle": { en: "Edit Arabic and English copy, review a draft, then publish it.", ar: "عدّل نصوص العربية والإنجليزية، راجع المسودة ثم انشرها." },
    "platformAdmin.copyEditor.search": { en: "Search keys or text", ar: "ابحث بالمفتاح أو النص" },
    "platformAdmin.copyEditor.group": { en: "Group", ar: "المجموعة" },
    "platformAdmin.copyEditor.allGroups": { en: "All groups", ar: "كل المجموعات" },
    "platformAdmin.copyEditor.metadata": { en: "Page title, description and keywords", ar: "عنوان الصفحة والوصف والكلمات المفتاحية" },
    "platformAdmin.copyEditor.draft": { en: "Draft", ar: "المسودة" },
    "platformAdmin.copyEditor.published": { en: "Published copy", ar: "النص المنشور" },
    "platformAdmin.copyEditor.preview": { en: "Draft preview", ar: "معاينة المسودة" },
    "platformAdmin.copyEditor.arabic": { en: "Arabic", ar: "العربية" },
    "platformAdmin.copyEditor.english": { en: "English", ar: "الإنجليزية" },
    "platformAdmin.copyEditor.save": { en: "Save draft", ar: "حفظ في المسودة" },
    "platformAdmin.copyEditor.apply": { en: "Publish draft", ar: "نشر المسودة" },
    "platformAdmin.copyEditor.reset": { en: "Restore original text", ar: "استعادة النص الأصلي" },
    "platformAdmin.copyEditor.saved": { en: "Draft saved.", ar: "حُفظت المسودة." },
    "platformAdmin.copyEditor.applied": { en: "Copy published.", ar: "نُشرت النصوص." },
    "platformAdmin.copyEditor.unsaved": { en: "An edit has not been saved yet.", ar: "هناك تعديل لم يُحفظ بعد." },
    "platformAdmin.copyEditor.empty": { en: "No results.", ar: "لا توجد نتائج." },
    "platformAdmin.copyEditor.select": { en: "Select a message to preview it.", ar: "اختر نصًا لمعاينته." },
    "platformAdmin.copyEditor.previewNote": { en: "This preview does not change the public site until you publish the draft.", ar: "هذه المعاينة لا تغيّر الموقع العام حتى تنشر المسودة." },
    "platformAdmin.copyEditor.stepUp": { en: "Confirm your identity in the admin panel before saving or publishing.", ar: "أكّد هويتك في لوحة الإدارة قبل الحفظ أو النشر." },
    "platformAdmin.copyEditor.back": { en: "Back to admin", ar: "العودة إلى الإدارة" },
    "platformAdmin.copyEditor.discard": { en: "Discard the unsaved edit?", ar: "تجاهل التعديل غير المحفوظ؟" },
    "platformAdmin.copyEditor.loadError": { en: "Could not load the copy. Refresh and try again.", ar: "تعذّر تحميل النصوص. حاول التحديث." },
    "platformAdmin.copyEditor.saveError": { en: "Could not save the draft. Check the text and refresh if it changed elsewhere.", ar: "تعذّر حفظ المسودة. راجع النصوص وحدّث الصفحة إذا تغيّرت." },
    "platformAdmin.copyEditor.publishError": { en: "Could not publish. Refresh and review the draft before trying again.", ar: "تعذّر النشر. حدّث الصفحة وراجع المسودة قبل المحاولة." },
    "errors.NETWORK": { en: "Can't reach Flowline — check your connection and try again.", ar: "تعذّر الوصول إلى Flowline — تحقّق من اتصالك ثم حاول مجددًا." },
    "errors.INTERNAL": { en: "Something went wrong on our side", ar: "تعذّر إكمال الطلب. راجع الحالة الحالية قبل المحاولة مجددًا." },
    "errors.REVISION_CONFLICT": { en: "This changed since you loaded it. Reload and try again.", ar: "تغيّر هذا منذ أن حمّلته. أعد التحميل وحاول مجددًا." },
    "errors.STEP_UP_REQUIRED": { en: "Confirm with a code from your authenticator app to make changes.", ar: "أكّد برمز من تطبيق المصادقة لإجراء التغييرات." },
  } as const;
}

describe("CopyEditor error handling (#181)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockReset();
    mockApi.mockImplementation(() => Promise.reject(new Error("Unexpected api call")));
    mockUseQuery.mockReset();
    mockUseT.mockReset();
    user = userEvent.setup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupMocks(locale: "en" | "ar", options: {
    stateError?: boolean;
    meError?: boolean;
    stateData?: ReturnType<typeof createMockData>["stateData"];
    meData?: ReturnType<typeof createMockData>["meData"];
  } = {}) {
    const stateData = options.stateData ?? createMockData(locale).stateData;
    const meData = options.meData ?? createMockData(locale).meData;
    const stateRefetch = vi.fn().mockResolvedValue(stateData);
    const meRefetch = vi.fn().mockResolvedValue(meData);

    mockUseQuery.mockImplementation((opt: { queryKey?: readonly unknown[] }) => {
      const queryKey = opt?.queryKey?.[0];
      if (queryKey === "platform-copy") {
        return {
          data: stateData,
          isError: options.stateError ?? false,
          isPending: false,
          error: options.stateError ? new Error("Server error") : null,
          refetch: stateRefetch,
        };
      } else if (queryKey === "platform-me") {
        return {
          data: options.meError ? undefined : meData,
          isError: options.meError ?? false,
          isPending: false,
          error: options.meError ? new Error("Server error") : null,
          refetch: meRefetch,
        };
      }
      return { data: undefined, isError: false, isPending: false, error: null, refetch: vi.fn() };
    });

    mockUseT.mockImplementation((key: string) => getTranslations(locale)[key as keyof ReturnType<typeof getTranslations>]?.[locale] ?? key);

    return { stateRefetch, meRefetch, stateData, meData };
  }

  async function makeEditAndSave(locale: "en" | "ar", saveButtonName: RegExp) {
    const englishLabel = locale === "ar" ? "الإنجليزية" : "English";
    const englishTextarea = screen.getByLabelText(englishLabel);
    await user.type(englishTextarea, " edited");

    const saveButton = screen.getByRole("button", { name: saveButtonName });
    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);
  }

  async function makePublish(locale: "en" | "ar", applyButtonName: RegExp) {
    const applyButton = screen.getByRole("button", { name: applyButtonName });
    expect(applyButton).not.toBeDisabled();
    await user.click(applyButton);
  }

  describe("Load error states", () => {
    it("shows load error alert with retry button when state query fails (English)", async () => {
      const { stateRefetch } = setupMocks("en", { stateError: true });

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not load the copy. Refresh and try again."));
      const retryButton = screen.getByRole("button", { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
      // The load-error branch reads the mocked query; it must not call the write api().
      expect(mockApi).not.toHaveBeenCalled();

      await user.click(retryButton);
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
    });

    it("shows load error alert with retry button when state query fails (Arabic/RTL)", async () => {
      const { stateRefetch } = setupMocks("ar", { stateError: true });

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر تحميل النصوص. حاول التحديث."));
      expect(screen.getByRole("button", { name: /إعادة المحاولة/i })).toBeInTheDocument();
      expect(mockApi).not.toHaveBeenCalled();
      // Verify Arabic locale by checking the error message is in Arabic
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
      expect(alert.textContent).not.toContain("(server text)");
      expect(alert.textContent).not.toContain("(client text)");

      await user.click(screen.getByRole("button", { name: /إعادة المحاولة/i }));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
    });

    it("shows stepUp message when me query fails (state query succeeds)", async () => {
      const { stateRefetch: _stateRefetch, meRefetch: _meRefetch } = setupMocks("en", { meError: true });

      renderWithProviders(<CopyEditor />);

      // When me query fails, meData is undefined, stepUpActive becomes false, so stepUp message shows
      await waitFor(() => expect(screen.getByText("Confirm your identity in the admin panel before saving or publishing.")).toBeInTheDocument());
      // Editor content should still render since state query succeeded
      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());
      expect(mockApi).not.toHaveBeenCalled();
    });
  });

  describe("Write error: REVISION_CONFLICT", () => {
    it("shows conflict error and refetches state on save", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en");

      mockApi.mockRejectedValueOnce(new ApiError(409, "REVISION_CONFLICT", "Revision mismatch (server text)"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makeEditAndSave("en", /save draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This changed since you loaded it. Reload and try again."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });

    it("shows conflict error and refetches state on publish", async () => {
      const publishedDifferentData = {
        ...createMockData("en").stateData,
        published: { value: { ar: { "meta.title": "منشور قديم" }, en: { "meta.title": "Old Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
      };
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en", { stateData: publishedDifferentData });

      mockApi.mockRejectedValueOnce(new ApiError(409, "REVISION_CONFLICT", "Revision mismatch (server text)"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makePublish("en", /publish draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This changed since you loaded it. Reload and try again."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "POST" }));
    });

    it("shows conflict error in Arabic", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("ar");

      mockApi.mockRejectedValueOnce(new ApiError(409, "REVISION_CONFLICT", "Revision mismatch (server text)"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("تحرير النصوص")).toBeInTheDocument());

      await makeEditAndSave("ar", /حفظ في المسودة/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تغيّر هذا منذ أن حمّلته. أعد التحميل وحاول مجددًا."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      // Verify Arabic locale by checking the alert contains Arabic characters
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
      expect(alert.textContent).not.toContain("(server text)");
      expect(alert.textContent).not.toContain("(client text)");
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });
  });

  describe("Write error: STEP_UP_REQUIRED", () => {
    it("refetches me and shows stepUp error on save", async () => {
      const { stateRefetch: _stateRefetch, meRefetch, meData: _meData } = setupMocks("en");
      // meRefetch returns stepUpUntil: null to simulate step-up expired
      meRefetch.mockResolvedValue({ data: { csrfToken: "csrf-token", stepUpUntil: null } });

      mockApi.mockRejectedValueOnce(new ApiError(403, "STEP_UP_REQUIRED", "Confirm with a code from your authenticator app to make changes."));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makeEditAndSave("en", /save draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Confirm your identity in the admin panel before saving or publishing."));
      await waitFor(() => expect(meRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });

    it("refetches me and shows stepUp error on publish", async () => {
      const publishedDifferentData = {
        ...createMockData("en").stateData,
        published: { value: { ar: { "meta.title": "منشور قديم" }, en: { "meta.title": "Old Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
      };
      const { stateRefetch: _stateRefetch, meRefetch } = setupMocks("en", { stateData: publishedDifferentData });
      // meRefetch returns stepUpUntil: null to simulate step-up expired
      meRefetch.mockResolvedValue({ data: { csrfToken: "csrf-token", stepUpUntil: null } });

      mockApi.mockRejectedValueOnce(new ApiError(403, "STEP_UP_REQUIRED", "Confirm with a code from your authenticator app to make changes."));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makePublish("en", /publish draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Confirm your identity in the admin panel before saving or publishing."));
      await waitFor(() => expect(meRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "POST" }));
    });

    it("shows stepUp error in Arabic", async () => {
      const { stateRefetch: _stateRefetch, meRefetch } = setupMocks("ar");
      // meRefetch returns stepUpUntil: null to simulate step-up expired
      meRefetch.mockResolvedValue({ data: { csrfToken: "csrf-token", stepUpUntil: null } });

      mockApi.mockRejectedValueOnce(new ApiError(403, "STEP_UP_REQUIRED", "أكّد برمز من تطبيق المصادقة لإجراء التغييرات."));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("تحرير النصوص")).toBeInTheDocument());

      await makeEditAndSave("ar", /حفظ في المسودة/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("أكّد هويتك في لوحة الإدارة قبل الحفظ أو النشر."));
      // Verify Arabic locale by checking the alert contains Arabic characters
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
      expect(alert.textContent).not.toContain("(server text)");
      expect(alert.textContent).not.toContain("(client text)");
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });
  });

  describe("Write error: 5xx server error", () => {
    it("shows serverError and refetches state on save", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en");

      mockApi.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong on our side"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makeEditAndSave("en", /save draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save the draft. Check the text and refresh if it changed elsewhere."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });

    it("shows serverError and refetches state on publish", async () => {
      const publishedDifferentData = {
        ...createMockData("en").stateData,
        published: { value: { ar: { "meta.title": "منشور قديم" }, en: { "meta.title": "Old Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
      };
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en", { stateData: publishedDifferentData });

      mockApi.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong on our side"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makePublish("en", /publish draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not publish. Refresh and review the draft before trying again."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "POST" }));
    });

    it("shows serverError in Arabic", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("ar");

      mockApi.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong on our side"));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("تحرير النصوص")).toBeInTheDocument());

      await makeEditAndSave("ar", /حفظ في المسودة/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر حفظ المسودة. راجع النصوص وحدّث الصفحة إذا تغيّرت."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      // Verify Arabic locale by checking the alert contains Arabic characters
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
      expect(alert.textContent).not.toContain("(server text)");
      expect(alert.textContent).not.toContain("(client text)");
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });
  });

  describe("Write error: network error", () => {
    it("shows networkError and refetches state on save", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en");

      mockApi.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Failed to fetch (client text)", true));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makeEditAndSave("en", /save draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Can't reach Flowline — check your connection and try again."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });

    it("shows networkError and refetches state on publish", async () => {
      const publishedDifferentData = {
        ...createMockData("en").stateData,
        published: { value: { ar: { "meta.title": "منشور قديم" }, en: { "meta.title": "Old Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
      };
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("en", { stateData: publishedDifferentData });

      mockApi.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Failed to fetch (client text)", true));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("Copy editor")).toBeInTheDocument());

      await makePublish("en", /publish draft/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Can't reach Flowline — check your connection and try again."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "POST" }));
    });

    it("shows networkError in Arabic", async () => {
      const { stateRefetch, meRefetch: _meRefetch } = setupMocks("ar");

      mockApi.mockRejectedValueOnce(new ApiError(0, "NETWORK", "Failed to fetch (client text)", true));

      renderWithProviders(<CopyEditor />);

      await waitFor(() => expect(screen.getByText("تحرير النصوص")).toBeInTheDocument());

      await makeEditAndSave("ar", /حفظ في المسودة/i);

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر الوصول إلى Flowline — تحقّق من اتصالك ثم حاول مجددًا."));
      await waitFor(() => expect(stateRefetch).toHaveBeenCalled());
      // Verify Arabic locale by checking the alert contains Arabic characters
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
      expect(alert.textContent).not.toContain("(server text)");
      expect(alert.textContent).not.toContain("(client text)");
      expect(mockApi).toHaveBeenCalledTimes(1);
      expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", expect.objectContaining({ method: "PATCH" }));
    });
  });
});