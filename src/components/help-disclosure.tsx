"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import { cx } from "@/components/ui";

export function HelpDisclosure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cx("text-sm", className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded text-start text-sm font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
        {label}
        <ChevronDown aria-hidden="true" className={cx("size-3.5 shrink-0 transition-transform duration-100 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <p id={id} hidden={!open} className="mt-2 max-w-3xl rounded-md border border-line bg-card px-3 py-2 leading-6 text-med">{children}</p>
    </div>
  );
}
