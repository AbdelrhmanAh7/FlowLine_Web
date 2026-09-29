"use client";

import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Dropdown menu (Radix): roving focus, typeahead, Escape/outside-click close, sub-menus possible.
 * Motion via motion-content (Radix waits for the exit animation before unmounting).
 */
export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({ children, className, align = "start", side = "top" }: { children: ReactNode; className?: string; align?: "start" | "center" | "end"; side?: "top" | "bottom" }) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        side={side}
        sideOffset={4}
        className={cn("motion-content z-50 w-56 rounded-lg border border-line bg-elevated p-1 shadow-[var(--shadow-popover)] outline-none", className)}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  href,
  danger,
  disabled,
  disabledTitle,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  className?: string;
}) {
  const cls = cn(
    "flex h-8 w-full items-center rounded-md px-2.5 text-start text-base outline-none data-[highlighted]:bg-card",
    danger ? "text-danger" : disabled ? "cursor-not-allowed text-muted" : "text-hi",
    className,
  );
  if (disabled) {
    return (
      <RadixMenu.Item disabled title={disabledTitle} className={cls} onSelect={(e) => e.preventDefault()}>
        {children}
      </RadixMenu.Item>
    );
  }
  if (href) {
    return (
      <RadixMenu.Item asChild className={cls}>
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {children}
        </a>
      </RadixMenu.Item>
    );
  }
  return (
    <RadixMenu.Item className={cls} onSelect={onSelect}>
      {children}
    </RadixMenu.Item>
  );
}

/** Next.js Link inside a menu item (client-side navigation). */
export function MenuLink({ children, href, danger, className }: { children: ReactNode; href: string; danger?: boolean; className?: string }) {
  return (
    <RadixMenu.Item asChild className={cn("flex h-8 w-full items-center rounded-md px-2.5 text-start text-base outline-none data-[highlighted]:bg-card", danger ? "text-danger" : "text-hi", className)}>
      <a href={href}>{children}</a>
    </RadixMenu.Item>
  );
}

export const MenuSeparator = () => <RadixMenu.Separator className="my-1 h-px bg-line" />;

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="px-2.5 pt-1 text-xs text-muted">{children}</RadixMenu.Label>;
}

/** Radio group (single choice) — used by the language and theme pickers. */
export const MenuRadioGroup = RadixMenu.RadioGroup;

export function MenuRadioItem({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixMenu.RadioItem
      value={value}
      className={cn(
        "flex h-8 w-full cursor-pointer items-center justify-between rounded-md px-2.5 text-start text-base text-hi outline-none data-[highlighted]:bg-card data-[state=checked]:font-medium",
        className,
      )}
    >
      {children}
      <RadixMenu.ItemIndicator aria-hidden className="text-accent">
        ✓
      </RadixMenu.ItemIndicator>
    </RadixMenu.RadioItem>
  );
}
