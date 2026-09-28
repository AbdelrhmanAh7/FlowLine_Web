"use client";

import Link from "next/link";
import { cloneElement, forwardRef, isValidElement, useId, useImperativeHandle, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ChangeEvent, type ForwardedRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ───────── Button ───────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent font-semibold hover:bg-accent-hover active:bg-accent-press",
  secondary: "bg-card text-hi border border-line-strong hover:bg-elevated",
  ghost: "text-med hover:text-hi hover:bg-card",
  danger: "bg-card text-danger border border-danger/40 hover:bg-danger/10",
  "danger-ghost": "text-danger hover:bg-danger/10",
};
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-sm gap-1.5 rounded-md",
  md: "h-8 px-3 text-base gap-2 rounded-md",
  lg: "h-10 px-4 text-base gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** When set, the button is disabled and explains why (tooltip + accessible description). */
  disabledReason?: string | null;
  tooltipSide?: "top" | "bottom";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, disabledReason, tooltipSide = "bottom", className, children, onClick, disabled, type = "button", ...rest },
  ref,
) {
  const reasonId = useId();
  const blocked = Boolean(disabledReason) || disabled || loading;
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-disabled={blocked || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      aria-busy={loading || undefined}
      disabled={disabled && !disabledReason}
      onClick={(e) => {
        if (blocked) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-[var(--dur-hover)] ease-[var(--ease-standard)] active:duration-[var(--dur-press)]",
        VARIANTS[variant],
        SIZES[size],
        blocked && "cursor-not-allowed opacity-50 hover:bg-[unset]",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
  if (!disabledReason) return btn;
  return (
    <span className="group relative inline-flex">
      {btn}
      <span
        id={reasonId}
        role="tooltip"
        className={cx(
          "pointer-events-none absolute right-0 z-50 w-max max-w-64 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-sm text-hi opacity-0 shadow-[var(--shadow-popover)] transition-opacity duration-[var(--dur-tab)] group-hover:opacity-100 group-focus-within:opacity-100",
          tooltipSide === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        )}
      >
        {disabledReason}
      </span>
    </span>
  );
});

export function ButtonLink({ href, variant = "secondary", size = "md", className, children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      href={href}
      className={cx("inline-flex items-center justify-center whitespace-nowrap transition-colors duration-[var(--dur-hover)]", VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("size-3.5 animate-spin motion-reduce:animate-none", className)} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ───────── Form fields ───────── */

/**
 * Text typed into a server-rendered field before React hydrates it would otherwise be discarded: the controlled
 * value ("" in state) wins on the next render. On mount, hand any such early text to onChange so state adopts it.
 */
function useKeepEarlyInput<T extends HTMLInputElement | HTMLTextAreaElement>(
  forwarded: ForwardedRef<T>,
  value: unknown,
  onChange: ((e: ChangeEvent<T>) => void) | undefined,
) {
  const el = useRef<T>(null);
  useImperativeHandle(forwarded, () => el.current as T);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !onChange || typeof value !== "string" || node.value === value || node.value === "" || value !== "") return;
    onChange({ target: node, currentTarget: node } as unknown as ChangeEvent<T>);
    // Mount only: this is about text entered before hydration, not later updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return el;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  const el = useKeepEarlyInput(ref, rest.value, rest.onChange);
  return (
    <input
      ref={el}
      aria-invalid={invalid || undefined}
      className={cx(
        "h-9 w-full rounded-md border bg-app px-3 text-base text-hi placeholder:text-muted transition-colors duration-[var(--dur-hover)] focus:border-accent focus:outline-none",
        invalid ? "border-danger" : "border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; mono?: boolean }>(function Textarea(
  { className, invalid, mono, ...rest },
  ref,
) {
  const el = useKeepEarlyInput(ref, rest.value, rest.onChange);
  return (
    <textarea
      ref={el}
      aria-invalid={invalid || undefined}
      spellCheck={mono ? false : undefined}
      className={cx(
        "w-full resize-y rounded-md border bg-app px-3 py-2 text-base text-hi placeholder:text-muted focus:border-accent focus:outline-none",
        mono && "data text-sm leading-5",
        invalid ? "border-danger" : "border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  const descId = htmlFor ? `${htmlFor}-desc` : undefined;
  const hasDesc = Boolean(error || hint);
  // Link the hint/error to the control so screen readers announce it on focus.
  const control =
    descId && hasDesc && isValidElement<{ "aria-describedby"?: string }>(children) ? cloneElement(children, { "aria-describedby": descId }) : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-[0.4px] text-med">
        {label}
      </label>
      {control}
      {error ? (
        <p id={descId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** WAI-ARIA tabs keyboard support: ←/→/Home/End move focus and activate. */
export function onTabListKeyDown<T extends string>(e: React.KeyboardEvent, ids: readonly T[], current: T, select: (t: T) => void, isDisabled?: (t: T) => boolean) {
  const enabled = ids.filter((t) => !isDisabled?.(t));
  const i = enabled.indexOf(current);
  let next: T | undefined;
  if (e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
  else if (e.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
  else if (e.key === "Home") next = enabled[0];
  else if (e.key === "End") next = enabled[enabled.length - 1];
  if (!next) return;
  e.preventDefault();
  select(next);
  const list = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
}

/* ───────── Status ───────── */

export type Tone = "success" | "warning" | "danger" | "info" | "muted" | "accent";
const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  muted: "text-muted",
  accent: "text-accent",
};
const TONE_BG: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted",
  accent: "bg-accent",
};

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", TONE_BG[tone], className)} />;
}

export function StatusBadge({ tone, children, upper, className }: { tone: Tone; children: ReactNode; upper?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap", upper ? "text-xs font-medium uppercase tracking-[0.4px]" : "text-sm", TONE_TEXT[tone], className)}>
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export const RUN_TONE: Record<string, Tone> = {
  queued: "muted",
  running: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "muted",
  pending: "muted",
  skipped: "muted",
  reused: "success",
  waiting_approval: "warning",
  uncertain: "warning",
};
export const RUN_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Queued",
  skipped: "Skipped",
  reused: "Reused",
  waiting_approval: "Needs approval",
  uncertain: "Outcome unknown",
};

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="data inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-card px-1 text-xs text-med">{children}</kbd>;
}

/* ───────── Surfaces & states ───────── */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-line bg-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="mb-1 text-2xl text-muted" aria-hidden>{icon}</div>}
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="max-w-sm text-base text-med">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, retrying }: { title: string; body?: ReactNode; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
      <div>
        <p className="font-semibold text-danger">⚠ {title}</p>
        {body && <p className="mt-1 text-base text-med">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} loading={retrying}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Logo({ withName = true, className }: { withName?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="size-6 rounded-md bg-[linear-gradient(135deg,#7c6cff_0%,#38bdf8_100%)]" />
      {withName && <span className="text-lg font-semibold tracking-tight">Flowline</span>}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-xs font-medium uppercase tracking-[0.4px] text-muted", className)}>{children}</p>;
}
