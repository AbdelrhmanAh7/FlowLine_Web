"use client";

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

/* ───────── Button ───────── */

const buttonVariants = cva(
  "motion-press inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-[var(--dur-base)] ease-[var(--ease-standard)] active:duration-[var(--dur-fast)]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent font-semibold hover:bg-accent-hover active:bg-accent-press",
        secondary: "bg-card text-hi border border-line-strong hover:bg-elevated",
        ghost: "text-med hover:text-hi hover:bg-card",
        danger: "bg-card text-danger border border-danger-border hover:bg-danger-bg",
        "danger-ghost": "text-danger hover:bg-danger-bg",
      },
      size: {
        sm: "h-7 px-2.5 text-sm gap-1.5 rounded-md",
        md: "h-8 px-3 text-base gap-2 rounded-md",
        lg: "h-10 px-4 text-base gap-2 rounded-lg",
        icon: "size-8 rounded-md",
        "icon-sm": "size-7 rounded-md",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariantProps["variant"]>;
export type ButtonSize = NonNullable<ButtonVariantProps["size"]>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Server-confirmed success: draws an animated check over the label until the parent clears it (the label keeps the button's width and accessible name). */
  confirm?: boolean;
  /** When set, the button is disabled and explains why (tooltip on hover/focus/tap + accessible description). */
  disabledReason?: string | null;
  tooltipSide?: "top" | "bottom";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, confirm, disabledReason, tooltipSide = "bottom", className, children, onClick, disabled, type = "button", "aria-describedby": describedByProp, ...rest },
  ref,
) {
  const blocked = Boolean(disabledReason) || disabled || loading;
  const reasonId = useId();
  // The reason is the button's accessible description, always in the DOM (the Radix tooltip mounts only while open).
  const describedBy = [describedByProp, disabledReason ? reasonId : null].filter(Boolean).join(" ") || undefined;
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      aria-describedby={describedBy}
      disabled={disabled && !disabledReason}
      onClick={(e) => {
        if (blocked) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(buttonVariants({ variant, size }), confirm && "relative", blocked && "cursor-not-allowed opacity-50 hover:bg-[unset]", className)}
      {...rest}
    >
      {loading && <Spinner />}
      {confirm ? (
        <>
          {/* The label stays in place (accessible name, no layout shift: the button keeps its width); the check is drawn over it. */}
          <span className="inline-flex items-center gap-[inherit] opacity-0">{children}</span>
          <span aria-hidden className="absolute inset-0 flex items-center justify-center">
            <ConfirmCheck />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
  if (!disabledReason) return btn;
  return (
    // openOnTap: Radix never opens a tooltip on touch, so a tap on the blocked button shows the reason.
    <Tooltip content={disabledReason} side={tooltipSide} openOnTap>
      {/* A span keeps hover/focus events flowing to the tooltip while the button is inert. The reason stays outside the
          button so it describes it without becoming part of its name. */}
      <span className="inline-flex">
        {btn}
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      </span>
    </Tooltip>
  );
});

/** The one-shot success check: pops in, then the stroke draws itself. */
export function ConfirmCheck({ className }: { className?: string }) {
  return (
    <span className="motion-confirm inline-flex items-center gap-1.5">
      <svg viewBox="0 0 12 12" className={cn("size-3.5", className)} aria-hidden>
        <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="24" className="motion-check-draw" />
      </svg>
    </span>
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children, ...rest }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}

/** Square icon-only button. `aria-label` is required (there is no visible text). */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { "aria-label": string }>(function IconButton({ size = "icon", className, ...rest }, ref) {
  return <Button ref={ref} size={size} className={className} {...rest} />;
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5 animate-spin motion-reduce:animate-none", className)} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
