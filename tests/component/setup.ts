import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/copy",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
vi.mock("next/link", () => {
  const Link = ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement("a", { href, ...props }, children);
  return { default: Link };
});

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
    QueryClient: vi.fn(),
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Mock i18n client
vi.mock("@/i18n/client", () => ({
  useT: () => (key: string) => key,
}));

// Mock api
vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, public message: string, public isNetwork = false) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

// Mock UI components
vi.mock("@/components/ui", () => ({
  Select: vi.fn(({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("select", props, children)
  ),
  Button: vi.fn(({ children, disabled, onClick, ...props }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; [key: string]: unknown }) =>
    React.createElement("button", { disabled, onClick, ...props }, children)
  ),
  Card: vi.fn(({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: unknown }) =>
    React.createElement("div", { className, ...props }, children)
  ),
  Input: vi.fn(({ ...props }: Record<string, unknown>) => React.createElement("input", props)),
  Textarea: vi.fn(({ ...props }: Record<string, unknown>) => React.createElement("textarea", props)),
}));

// Mock LanguageSwitcher
vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: vi.fn(() => React.createElement("div", { "data-testid": "language-switcher" })),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

export function renderWithProviders(ui: React.ReactNode) {
  return render(React.createElement(QueryClientProvider, { client: queryClient }, ui));
}

import { render } from "@testing-library/react";
