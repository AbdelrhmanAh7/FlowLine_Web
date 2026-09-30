"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useId, type ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

const TAB_CLASS =
  "relative h-10 text-base capitalize text-muted transition-colors duration-[var(--dur-tab)] hover:text-med data-[state=active]:font-semibold data-[state=active]:text-hi data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent";
/** Dimmed and inert; an active tab keeps its own (brighter) colour. */
const BLOCKED_CLASS = "cursor-not-allowed text-muted/60 hover:text-muted/60";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Blocked without an explanation. Prefer `disabledReason`. */
  disabled?: boolean;
  /**
   * Blocked, and says why (the "disabled control with a reason" rule): the tab is `aria-disabled` and dimmed, is not
   * activatable and is skipped by arrow/Home/End/Tab, but stays hoverable and tappable — the reason shows in a
   * tooltip (hover, focus or tap) and is the tab's accessible description.
   */
  disabledReason?: string | null;
}

/**
 * Tabs (Radix): arrow keys follow reading direction, Home/End jump — RTL comes from DirectionProvider.
 * Panels animate on switch (motion-enter). `listClassName`/`tabClassName` restyle the tab strip (default: 40px tabs
 * inset 20px, for full-width drawers); blocked tabs are rendered outside Radix's roving focus so they can carry
 * aria-disabled and receive pointer events (a native `disabled` button gets none, so it could not explain itself).
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  listClassName,
  tabClassName,
  children,
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  listClassName?: string;
  tabClassName?: string;
  children: ReactNode;
}) {
  const baseId = useId();
  const reasonId = (id: string) => `${baseId}-reason-${id}`;
  return (
    <RadixTabs.Root value={value} onValueChange={(v) => onChange(v as T)} className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <RadixTabs.List aria-label={label} className={cn("flex gap-5 border-b border-line px-5", listClassName)}>
        {tabs.map((t) => {
          const reason = t.disabledReason || undefined;
          if (!t.disabled && !reason) {
            return (
              <RadixTabs.Trigger key={t.id} value={t.id} className={cn(TAB_CLASS, tabClassName)}>
                {t.label}
              </RadixTabs.Trigger>
            );
          }
          const selected = t.id === value;
          const tab = (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-disabled="true"
              aria-describedby={reason ? reasonId(t.id) : undefined}
              tabIndex={-1}
              data-state={selected ? "active" : "inactive"}
              data-disabled=""
              className={cn(TAB_CLASS, BLOCKED_CLASS, tabClassName)}
            >
              {t.label}
            </button>
          );
          return reason ? (
            <Tooltip key={t.id} content={reason} openOnTap>
              {tab}
            </Tooltip>
          ) : (
            tab
          );
        })}
      </RadixTabs.List>
      {/* The reasons live outside the tablist (only tabs belong in it) and outside the tabs (so they don't become their names). */}
      {tabs.map((t) =>
        t.disabledReason ? (
          <span key={t.id} id={reasonId(t.id)} className="sr-only">
            {t.disabledReason}
          </span>
        ) : null,
      )}
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  return (
    <RadixTabs.Content value={value} className={cn("motion-enter min-h-0 flex-1 overflow-y-auto outline-none", className)}>
      {children}
    </RadixTabs.Content>
  );
}

/** WAI-ARIA tabs keyboard support for hand-built tab lists (←/→/Home/End; arrows follow the reading direction). */
export function onTabListKeyDown<T extends string>(e: React.KeyboardEvent, ids: readonly T[], current: T, select: (t: T) => void, isDisabled?: (t: T) => boolean) {
  const enabled = ids.filter((t) => !isDisabled?.(t));
  const i = enabled.indexOf(current);
  const rtl = getComputedStyle(e.currentTarget as Element).direction === "rtl";
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  let next: T | undefined;
  if (e.key === forward) next = enabled[(i + 1) % enabled.length];
  else if (e.key === backward) next = enabled[(i - 1 + enabled.length) % enabled.length];
  else if (e.key === "Home") next = enabled[0];
  else if (e.key === "End") next = enabled[enabled.length - 1];
  if (!next) return;
  e.preventDefault();
  select(next);
  const list = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
}
