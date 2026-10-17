import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyEditor } from "@/app/admin/copy/copy-editor";
import { createTranslator } from "@/i18n/translate";
import { api, ApiError } from "@/lib/api";
import { renderWithProviders } from "./setup";

const mockUseQuery = vi.hoisted(() => vi.fn());
const i18n = vi.hoisted(() => ({ t: null as unknown }));
const mockApi = vi.mocked(api);

vi.mock("@/i18n/client", () => ({ useT: () => i18n.t }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  // CopyEditor does not call useMutation (writes go through api() directly), so only useQuery is stubbed.
  return { ...actual, useQuery: mockUseQuery };
});

const copyState = {
  base: { ar: { "meta.title": "العنوان" }, en: { "meta.title": "Title" } },
  draft: { value: { ar: { "meta.title": "مسودة" }, en: { "meta.title": "Draft" } }, revision: 2, setAt: "2024-01-01T00:00:00Z" },
  published: { value: { ar: { "meta.title": "منشور" }, en: { "meta.title": "Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" },
};

function setup(stepUpUntil: string | null = new Date(Date.now() + 600_000).toISOString()) {
  const t = createTranslator("en");
  i18n.t = t;
  const stateRefetch = vi.fn().mockResolvedValue({ data: copyState });
  const meRefetch = vi.fn().mockResolvedValue({ data: { csrfToken: "csrf-token", stepUpUntil } });
  mockUseQuery.mockImplementation((opt: { queryKey?: readonly unknown[] }) => {
    if (opt.queryKey?.[0] === "platform-copy") return { data: copyState, isError: false, isPending: false, error: null, refetch: stateRefetch };
    if (opt.queryKey?.[0] === "platform-me") return { data: { csrfToken: "csrf-token", stepUpUntil }, isError: false, isPending: false, error: null, refetch: meRefetch };
    throw new Error(`Unexpected query ${String(opt.queryKey)}`);
  });
  return { t, stateRefetch, meRefetch };
}

describe("CopyEditor publish error handling (#228)", () => {
  const user = userEvent.setup();
  let dateNow: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    mockApi.mockReset();
    mockUseQuery.mockReset();
  });

  afterEach(() => {
    dateNow?.mockRestore();
    dateNow = undefined;
  });

  it("shows fallback error alert and refetches copy state when publish rejects with 500 INTERNAL", async () => {
    const { t, stateRefetch } = setup();
    mockApi.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Server error text"));

    renderWithProviders(<CopyEditor />);
    const publish = await screen.findByRole("button", { name: t("platformAdmin.copyEditor.apply") });
    expect(publish).toBeEnabled();

    await user.click(publish);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t("platformAdmin.copyEditor.publishError"));
    expect(alert.textContent).not.toContain("Server error text");
    expect(stateRefetch).toHaveBeenCalledTimes(1);
    expect(mockApi).toHaveBeenCalledTimes(1);
    expect(mockApi).toHaveBeenCalledWith("/api/platform/copy", {
      method: "POST",
      headers: { "x-flowline-csrf": "csrf-token" },
      json: { action: "publish", expectedDraftRevision: 2, expectedPublishedRevision: 1 },
    });
  });

  it("shows step-up alert, refetches me, and avoids api call when step-up is expired client-side", async () => {
    const baseTime = 1_700_000_000_000;
    dateNow = vi.spyOn(Date, "now").mockReturnValue(baseTime);
    // The step-up window ends 5s after baseTime; the stale `me` data never changes during the test.
    const { t, meRefetch, stateRefetch } = setup(new Date(baseTime + 5_000).toISOString());

    renderWithProviders(<CopyEditor />);
    const publish = await screen.findByRole("button", { name: t("platformAdmin.copyEditor.apply") });
    expect(publish).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    // Only the clock moves past the step-up expiry: the button was still enabled from the stale state.
    dateNow.mockReturnValue(baseTime + 10_000);
    await user.click(publish);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t("platformAdmin.copyEditor.stepUp"));
    expect(alert).not.toHaveTextContent(t("platformAdmin.copyEditor.publishError"));
    expect(meRefetch).toHaveBeenCalledTimes(1);
    expect(stateRefetch).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
    // Disabled because the step-up expired (role=note shown), not because a write is pending:
    // the form fields are only disabled while pending, and they stay enabled here.
    await waitFor(() => expect(publish).toBeDisabled());
    expect(screen.getByRole("note")).toHaveTextContent(t("platformAdmin.copyEditor.stepUp"));
    expect(screen.getByLabelText(t("platformAdmin.copyEditor.english"))).toBeEnabled();
  });
});
