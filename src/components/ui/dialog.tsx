"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { cn } from "./cn";

/**
 * Modal dialog (Radix): focus trap, Escape and scrim click close, aria wired from `title`.
 * Open/closed motion comes from the motion-content/motion-scrim classes (Radix waits for the exit animation).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="motion-scrim fixed inset-0 z-50 bg-scrim" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <RadixDialog.Content
            className={cn(
              "motion-content relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-popover)] outline-none",
              className,
            )}
          >
            <div className="flex items-center justify-between">
              <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
              <RadixDialog.Close aria-label={closeLabel} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
                <X className="size-4" aria-hidden />
              </RadixDialog.Close>
            </div>
            {children}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Drawer: side panel (overlay) or bottom sheet, sliding in from the inline-end / bottom. */
export function Drawer({
  open,
  onOpenChange,
  title,
  labelledBy,
  children,
  variant = "overlay",
  closeLabel,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  /** id of an element inside `children` that names the drawer (custom headers). */
  labelledBy?: string;
  children: ReactNode;
  variant?: "overlay" | "sheet";
  closeLabel: string;
  testId?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="motion-scrim fixed inset-0 z-40 bg-scrim md:bg-transparent" />
        <RadixDialog.Content
          aria-labelledby={labelledBy}
          data-testid={testId}
          className={cn(
            "fixed z-50 flex flex-col border-line bg-surface outline-none",
            variant === "sheet"
              ? "motion-sheet inset-x-0 bottom-0 h-[92vh] rounded-t-xl border-t"
              : "motion-drawer top-0 bottom-0 end-0 w-[var(--drawer-w)] max-w-full border-s shadow-[var(--shadow-popover)]",
          )}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
              <RadixDialog.Close aria-label={closeLabel} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
                <X className="size-4" aria-hidden />
              </RadixDialog.Close>
            </div>
          ) : (
            <RadixDialog.Title className="sr-only">{closeLabel}</RadixDialog.Title>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
