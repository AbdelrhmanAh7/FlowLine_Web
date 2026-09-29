"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tabs (Radix): arrow keys follow reading direction, Home/End jump — RTL comes from DirectionProvider.
 * Panels animate on switch (motion-enter).
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
  children,
}: {
  tabs: readonly { id: T; label: ReactNode; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={(v) => onChange(v as T)} className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <RadixTabs.List aria-label={label} className="flex gap-5 border-b border-line px-5">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.id}
            value={t.id}
            disabled={t.disabled}
            className={cn(
              "relative h-10 text-base capitalize transition-colors duration-[var(--dur-tab)] data-[state=active]:font-semibold data-[state=active]:text-hi",
              "text-muted hover:text-med data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent",
            )}
          >
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
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
