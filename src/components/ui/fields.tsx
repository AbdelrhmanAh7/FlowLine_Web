"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cloneElement, forwardRef, isValidElement, useImperativeHandle, useLayoutEffect, useRef, type ChangeEvent, type ForwardedRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

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

/**
 * Machine text (e-mails, URLs, keys, cron, JSONata — the fields styled `data`) stays left-to-right in Arabic too.
 * Pass `dir` explicitly to override.
 */
function machineDir(type: string | undefined, className: string | undefined): "ltr" | undefined {
  return type === "email" || type === "url" || /(^|\s)data(\s|$)/.test(className ?? "") ? "ltr" : undefined;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  const el = useKeepEarlyInput(ref, rest.value, rest.onChange);
  return (
    <input
      ref={el}
      dir={machineDir(rest.type, className)}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 w-full rounded-md border bg-app px-3 text-base text-hi placeholder:text-muted transition-colors duration-[var(--dur-base)] focus:border-accent focus:outline-none",
        invalid ? "border-danger" : "border-line-control",
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
      dir={mono ? "ltr" : undefined}
      aria-invalid={invalid || undefined}
      spellCheck={mono ? false : undefined}
      className={cn(
        "w-full resize-y rounded-md border bg-app px-3 py-2 text-base text-hi placeholder:text-muted focus:border-accent focus:outline-none",
        mono && "data text-sm leading-5",
        invalid ? "border-danger" : "border-line-control",
        className,
      )}
      {...rest}
    />
  );
});

const selectVariants = cva("peer block w-full appearance-none rounded-md border bg-app ps-2 pe-8 text-base text-hi transition-colors duration-[var(--dur-base)] focus:border-accent focus:outline-none disabled:text-muted", {
  variants: {
    size: { sm: "h-8", md: "h-9" },
    invalid: { true: "border-danger", false: "border-line-control" },
  },
  defaultVariants: { size: "md", invalid: false },
});

/**
 * Utilities that place a control inside its parent (width, flex/grid item behaviour, margin). The chevron needs a
 * wrapper, so these move to it and the wrapper takes the <select>'s old place in the layout; the rest styles the <select>.
 */
const PLACEMENT = /^-?(?:w|min-w|max-w|flex|grow|shrink|basis|self|order|col-span|col-start|col-end|justify-self|m[trblxyse]?)(?:-|$)/;
const utility = (c: string) => c.slice(c.lastIndexOf(":") + 1);
function splitPlacement(className: string | undefined) {
  const placed: string[] = [];
  const own: string[] = [];
  for (const c of (className ?? "").split(/\s+/)) if (c) (PLACEMENT.test(utility(c)) ? placed : own).push(c);
  return { placed, own: own.join(" ") };
}

/**
 * Styled native <select> with a visible chevron. Native (not Radix) on purpose: form picks keep platform behaviour and
 * E2E `selectOption`. For menu-style picks use the Radix-based primitives (Menu/Popover).
 * The chevron sits at the inline end (left in RTL); `dir` is mirrored onto the wrapper so an LTR select in an RTL page
 * keeps its chevron on the side its own padding reserves.
 */
export const Select = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & VariantProps<typeof selectVariants>>(function Select({ className, size, invalid, dir, children, ...rest }, ref) {
  const { placed, own } = splitPlacement(className);
  // An explicit width other than full (w-auto, w-40…) makes the wrapper shrink-wrap the <select>, like the bare <select> did.
  const shrinkWrap = placed.some((c) => utility(c).startsWith("w-") && utility(c) !== "w-full");
  return (
    <span dir={dir} className={cn("relative w-full", shrinkWrap ? "inline-block" : "block", placed)}>
      <select ref={ref} dir={dir} aria-invalid={invalid || undefined} className={cn(selectVariants({ size, invalid }), own)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-2 top-1/2 size-4 -translate-y-1/2 text-muted peer-disabled:opacity-50" />
    </span>
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
