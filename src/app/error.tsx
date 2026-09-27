"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app px-4 text-center">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold text-danger">⚠ Something went wrong</h1>
      <p className="max-w-sm text-base text-med">This page hit an unexpected error. Your saved flows are safe.</p>
      <div className="mt-2 flex gap-3">
        <button onClick={reset} className="inline-flex h-9 items-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover">
          Retry
        </button>
        <Link href="/app" className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-card px-4 hover:bg-elevated">
          Go to my workspace
        </Link>
      </div>
    </div>
  );
}
