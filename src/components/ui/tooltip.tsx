"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "./cn";
import { IDLE_TAP, tapCancel, tapClick, tapDown, tapLeave, type TapState } from "./tap-toggle";

/**
 * Accessible tooltip (Radix): hover/focus shows it, Escape dismisses. Motion via data-state in globals.css.
 *
 * Radix never opens a tooltip on touch (focus that follows a pointer-down is ignored, touch pointer-moves are
 * ignored). `openOnTap` makes a tap on the trigger toggle it, so a "why is this disabled?" reason is reachable on a
 * phone; a tap elsewhere dismisses it (Radix outside-press). Use it only on controls whose tap does nothing else.
 */
export function Tooltip({
  content,
  side = "bottom",
  openOnTap = false,
  children,
}: {
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  openOnTap?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Radix closes an open tooltip on pointer-down, before the click: remember whether this tap started on an open one.
  // The memory lasts one press: a drag-off or a cancelled gesture drops it (DV2-R01; rules in tap-toggle.ts).
  const press = useRef<TapState>(IDLE_TAP);
  // Our own "a pointer is pressing this trigger" flag. Radix keeps one too, but a cancelled touch never clears it, so a
  // later keyboard focus would not open the reason (DV2-R01/R02). Cleared like Radix's (any pointerup) and on cancel/click.
  const pressing = useRef(false);
  const tap = openOnTap
    ? {
        onPointerDown: () => {
          press.current = tapDown(open);
          pressing.current = true;
          document.addEventListener("pointerup", () => { pressing.current = false; }, { once: true });
        },
        onPointerLeave: (e: PointerEvent) => {
          press.current = tapLeave(press.current, e.buttons);
        },
        onPointerCancel: () => {
          press.current = tapCancel();
          pressing.current = false;
        },
        // A focus that does not come from a press (keyboard, or script focus from the tab strip) always shows the reason.
        onFocus: () => {
          if (!pressing.current) setOpen(true);
        },
        onClick: (e: MouseEvent) => {
          pressing.current = false;
          e.preventDefault(); // Radix closes the tooltip on click unless the click is default-prevented
          const next = tapClick(press.current, open, e.detail);
          setOpen(next.open);
          press.current = next.state;
        },
      }
    : undefined;
  return (
    <RadixTooltip.Root open={openOnTap ? open : undefined} onOpenChange={openOnTap ? setOpen : undefined}>
      <RadixTooltip.Trigger asChild {...tap}>
        {children}
      </RadixTooltip.Trigger>
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
