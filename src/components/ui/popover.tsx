"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Popover (Radix): anchored floating panel for pickers and inspectors. Motion via motion-content. */
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({
  children,
  className,
  align = "start",
  side = "bottom",
  role,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  role?: string;
  ariaLabel?: string;
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        side={side}
        sideOffset={4}
        collisionPadding={8}
        {...(role ? { role } : {})}
        aria-label={ariaLabel}
        className={cn("motion-content z-40 rounded-lg border border-line bg-elevated p-2 shadow-[var(--shadow-popover)] outline-none", className)}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
