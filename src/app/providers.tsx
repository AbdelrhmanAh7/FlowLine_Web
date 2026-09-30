"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/components/toast";
import { TooltipProvider } from "@/components/ui";
import { dirOf, type Locale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { ServerThemeProvider } from "@/theme/client";
import type { ThemePreference } from "@/theme/config";

export function Providers({ locale, theme, children }: { locale: Locale; theme: ThemePreference; children: React.ReactNode }) {
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
    <ServerThemeProvider theme={theme}>
      <I18nProvider locale={locale}>
        {/* reducedMotion="user": the motion library follows prefers-reduced-motion, like our CSS. */}
        <MotionConfig reducedMotion="user">
          <DirectionProvider dir={dirOf(locale)}>
            <TooltipProvider delayDuration={150}>
              <QueryClientProvider client={client}>
                <ToastProvider>{children}</ToastProvider>
              </QueryClientProvider>
            </TooltipProvider>
          </DirectionProvider>
        </MotionConfig>
      </I18nProvider>
    </ServerThemeProvider>
  );
}
