"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            // Design: auto-retry ×3 with backoff 1s/2s/4s — but never retry auth/permission/not-found.
            retry: (count, err) => {
              if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
              return count < 3;
            },
            retryDelay: (attempt) => 1000 * 2 ** attempt,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
