import { screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CopyEditor } from "@/app/admin/copy/copy-editor";
import { renderWithProviders } from "./setup";
import React from "react";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseT = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/client", () => ({
  useT: () => mockUseT,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: vi.fn(),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("Debug", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseT.mockReset();
    mockUseT.mockImplementation((key: string) => {
      const translations: Record<string, string> = {
        "common.loading": "Loading…",
        "platformAdmin.copyEditor.title": "Copy editor",
        "platformAdmin.copyEditor.subtitle": "Edit Arabic and English copy",
        "platformAdmin.copyEditor.stepUp": "Confirm your identity",
        "platformAdmin.copyEditor.loadError": "Could not load the copy",
        "platformAdmin.copyEditor.back": "Back to admin",
      };
      return translations[key] ?? key;
    });
    
    const stateData = { 
      base: { ar: { "meta.title": "العنوان" }, en: { "meta.title": "Title" } }, 
      draft: { value: { ar: { "meta.title": "مسودة" }, en: { "meta.title": "Draft" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" }, 
      published: { value: { ar: { "meta.title": "منشور" }, en: { "meta.title": "Published" } }, revision: 1, setAt: "2024-01-01T00:00:00Z" } 
    };
    const meData = { csrfToken: "csrf-token", stepUpUntil: new Date(Date.now() + 600_000).toISOString() };
    
    mockUseQuery.mockImplementation((options: { queryKey?: readonly unknown[] }) => {
      const queryKey = options?.queryKey?.[0];
      console.log(`useQuery call for:`, queryKey);
      if (queryKey === "platform-copy") {
        return { data: stateData, isError: true, isPending: false, error: new Error("fail"), refetch: vi.fn() };
      } else if (queryKey === "platform-me") {
        return { data: meData, isError: false, isPending: false, error: null, refetch: vi.fn() };
      }
      return { data: undefined, isError: false, isPending: false, error: null, refetch: vi.fn() };
    });
  });

  it("debug", async () => {
    renderWithProviders(<CopyEditor />);
    
    console.log("Rendered");
    const alert = screen.queryByRole("alert");
    console.log("Alert:", alert);
    if (!alert) {
      console.log("Body text:", document.body.textContent);
    }
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Could not load the copy");
  });
});