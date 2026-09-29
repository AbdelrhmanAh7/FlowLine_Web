"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cloneElement, forwardRef, isValidElement, useId, useImperativeHandle, useLayoutEffect, useRef, type ChangeEvent, type ForwardedRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
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
      dir={mono ? "ltr" : undefined}
      aria-invalid={invalid || undefined}
      spellCheck={mono ? false : undefined}
      className={cn(
        "w-full resize-y rounded-md border bg-app px-3 py-2 text-base text-hi placeholder:text-muted focus:border-accent focus:outline-none",
        mono && "data text-sm leading-5",
        invalid ? "border-danger" : "border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

const selectVariants = cva("w-full appearance-none rounded-md border bg-app px-2 text-base text-hi transition-colors duration-[var(--dur-base)] focus:border-accent focus:outline-none disabled:text-muted", {
  variants: {
    size: { sm: "h-8", md: "h-9" },
    invalid: { true: "border-danger", false: "border-line-strong" },
  },
  defaultVariants: { size: "md", invalid: false },
});

/**
 * Styled native <select>. Native (not Radix) on purpose: form picks keep platform behaviour and E2E `selectOption`.
 * For menu-style picks use the Radix-based primitives (Menu/Popover).
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & VariantProps<typeof selectVariants>>(function Select({ className, size, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(selectVariants({ size, invalid }), className)} {...rest}>
      {children}
    </select>
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
