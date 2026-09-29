"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Accessible tooltip (Radix): hover/focus shows it, Escape dismisses. Motion via data-state in globals.css. */
export function Tooltip({ content, side = "bottom", children }: { content: ReactNode; side?: "top" | "bottom" | "left" | "right"; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "motion-content z-50 w-max max-w-64 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-hi shadow-[var(--shadow-popover)]",
          )}
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;
