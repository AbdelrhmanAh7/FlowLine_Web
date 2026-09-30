"use client";

import { cn } from "./cn";

export function Logo({ withName = true, className }: { withName?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="bg-brand size-6 rounded-md" />
      {withName && <span className="text-lg font-semibold tracking-tight">Flowline</span>}
    </span>
  );
}
