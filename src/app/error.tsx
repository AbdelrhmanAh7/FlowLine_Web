"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import { useT } from "@/i18n/client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app px-4 text-center">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold text-danger">{t("errorPage.title")}</h1>
      <p className="max-w-sm text-base text-med">{t("errorPage.body")}</p>
      <div className="mt-2 flex gap-3">
        <button onClick={reset} className="inline-flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover">
          {t("errorPage.retry")}
        </button>
        <Link href="/app" className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-card px-4 hover:bg-elevated">
          {t("errorPage.home")}
        </Link>
      </div>
    </div>
  );
}
