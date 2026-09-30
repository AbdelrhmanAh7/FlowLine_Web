"use client";

import type { ReactNode } from "react";
import { useSidePanel } from "./side-panel";
import { cn } from "./cn";

/** An inline, non-modal confirmation. Cancel is the safe initial focus. */
export function InlineConfirmation({ labelledBy, label, onCancel, busy = false, children, returnFocusTo, className }: {
  labelledBy?: string;
  label?: string;
  onCancel: () => void;
  busy?: boolean;
  children: ReactNode;
  returnFocusTo?: () => HTMLElement | null;
  className?: string;
}) {
  const { panelRef, onKeyDown } = useSidePanel<HTMLDivElement>({ onClose: onCancel, busy, returnFocusTo });
  return (
    <div ref={panelRef} onKeyDown={onKeyDown} role="alertdialog" aria-labelledby={labelledBy} aria-label={label} className={cn("mt-3 rounded-md border border-danger bg-surface p-3", className)}>
      {children}
    </div>
  );
}
