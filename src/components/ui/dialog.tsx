"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";
import { mainRegion, pickReturnTarget, restoreFocus } from "./focus-return";

/**
 * Focus return for both modals (DV2-Q02). Radix hands focus back only to a `Dialog.Trigger`; ours have none (they are
 * opened by plain buttons through state), so focus would land on <body>. This remembers what had focus when the dialog
 * opened and restores it when the dialog goes away. Radix's focus scope calls `onCloseAutoFocus` both when `open`
 * becomes false and when a parent unmounts the whole dialog (conditional mounting), so one handler covers both paths;
 * the unmount effect repeats it as a fallback (harmless: it only acts while focus is still lost). `fallback` is tried
 * when the remembered element is gone or was never focused (Safari doesn't focus a tapped button).
 *
 * Also used by the builder's non-modal surfaces (Add node catalogue, Copilot and History panels). The catalogue and History are
 * mounted conditionally (`open` is always true), so the unmount path returns their focus. Copilot stays mounted while closed
 * (`open` toggles, the panel is hidden) so an unsaved proposal survives: `useSidePanel` calls `restore` when `open` turns false.
 */
export function useReturnFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, fallback?: () => HTMLElement | null) {
  const contentRef = useRef<T>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const returnFallback = useRef<HTMLElement | null>(null);
  const opened = useRef(false);
  const fallbackRef = useRef(fallback);
  useLayoutEffect(() => {
    fallbackRef.current = fallback;
  });

  // Layout effects run before Radix's focus scope moves focus into the dialog, so this still sees the opener. Captured
  // once per opening: a re-run while open (React strict mode in development) would see focus already inside the dialog.
  useLayoutEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    const result = pickReturnTarget(document.activeElement as HTMLElement | null, contentRef.current);
    returnTo.current = result.target;
    returnFallback.current = result.fallback;
  }, [open]);

  // Fallback order: the opener, its closest focusable ancestor outside nested layers, a caller-supplied launcher
  // (`fallback`, e.g. builder panels), then <main>. A Dialog opened from a menu item gets <main> (the menu is a
  // nested layer and Dialog supplies no launcher) — never <body>.
  // `lostWithin`: for a surface that is hidden instead of removed, focus still inside it counts as lost (see `restoreFocus`).
  const restore = useCallback(
    (lostWithin?: { contains(node: HTMLElement): boolean } | null) => restoreFocus(
      [returnTo.current, returnFallback.current, fallbackRef.current?.(), returnTo.current ? (mainRegion(returnTo.current) as HTMLElement | null) : null],
      document.activeElement as HTMLElement | null,
      lostWithin,
    ),
    [],
  );

  // Unmount fallback: the dialog is removed while open. Deferred like Radix's own return, once the DOM has settled.
  // (`opened` is read when the timer fires, after which nothing writes it: a dialog that was closed keeps `false`.)
  useLayoutEffect(() => {
    return () => {
      setTimeout(() => opened.current && restore(), 0);
    };
  }, [restore]);

  const onCloseAutoFocus = (event: Event) => {
    // Cancelling the event also skips Radix's own return to its (absent) trigger. With nothing to restore, Radix's
    // default runs as before.
    if (restore()) event.preventDefault();
  };
  return { contentRef, onCloseAutoFocus, restore };
}

/**
 * Modal dialog (Radix): focus trap, Escape and scrim click close, aria wired from `title`.
 * Open/closed motion comes from the motion-content/motion-scrim classes (Radix waits for the exit animation).
 * Focus returns to the element that opened it (see `useReturnFocus`).
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
  const { contentRef, onCloseAutoFocus } = useReturnFocus(open);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="motion-scrim fixed inset-0 z-50 bg-scrim" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <RadixDialog.Content
            ref={contentRef}
            onCloseAutoFocus={onCloseAutoFocus}
            // Radix modals hide the rest of the page but do not set aria-modal; say it so AT treat the dialog as modal (DV2-Q05).
            aria-modal="true"
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

/**
 * Drawer: side panel (overlay) or bottom sheet, sliding in from the inline-end / bottom. Modal like `Dialog`: focus
 * trap, Escape and scrim dismiss, everything behind it hidden from assistive technology.
 *
 * Its accessible name is, in order: `labelledBy` (an element inside `children`), the visible `title`, or `label`
 * (announced only). `fallbackFocus` says where focus returns when the opener can't take it back (see `useReturnFocus`).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  label,
  labelledBy,
  children,
  variant = "overlay",
  closeLabel,
  testId,
  fallbackFocus,
  side = "end",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  /** Accessible name for a drawer without a visible `title` (its content has its own header); announced, not shown. */
  label?: string;
  /** id of an element inside `children` that names the drawer (custom headers). */
  labelledBy?: string;
  children: ReactNode;
  variant?: "overlay" | "sheet";
  closeLabel: string;
  testId?: string;
  fallbackFocus?: () => HTMLElement | null;
  side?: "start" | "end";
}) {
  const { contentRef, onCloseAutoFocus } = useReturnFocus(open, fallbackFocus);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="motion-scrim fixed inset-0 z-40 bg-scrim md:bg-transparent" />
        <RadixDialog.Content
          ref={contentRef}
          onCloseAutoFocus={onCloseAutoFocus}
          aria-modal="true"
          // Radix names the dialog from its Title; only a custom header (labelledBy) replaces that. An explicit
          // `aria-labelledby={undefined}` would override Radix's own and leave the drawer unnamed.
          {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
          data-testid={testId}
          className={cn(
            "fixed z-50 flex flex-col border-line bg-surface outline-none",
            variant === "sheet"
              ? "motion-sheet inset-x-0 bottom-0 max-h-[92vh] rounded-t-xl border-t"
              : cn("motion-drawer top-0 bottom-0 w-[var(--drawer-w)] max-w-full shadow-[var(--shadow-popover)]", side === "start" ? "start-0 border-e" : "end-0 border-s"),
          )}
        >
          {title ? (
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
              <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
              <RadixDialog.Close aria-label={closeLabel} className="flex size-8 items-center justify-center rounded-md text-med hover:bg-card hover:text-hi">
                <X className="size-4" aria-hidden />
              </RadixDialog.Close>
            </div>
          ) : (
            <RadixDialog.Title className="sr-only">{label ?? closeLabel}</RadixDialog.Title>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
