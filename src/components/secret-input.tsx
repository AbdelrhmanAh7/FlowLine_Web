"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "@/components/ui";

/**
 * Write-only secret field (docs/security/CREDENTIALS_DESIGN.md MUST 9).
 * - UNCONTROLLED: the value lives only in the DOM element — never in React state, the TanStack cache, mutation
 *   variables, drafts, URLs or server-rendered HTML. Callers read `ref.current.value` at submit time and clear it on
 *   success AND failure; unmounting (close / navigation) discards it.
 * - `type=password` + `autocomplete=new-password` + password-manager ignore hints, so browsers and extensions neither
 *   autofill nor offer to save it (they may still ignore hints — the value is never shown back regardless).
 * - A non-login `name`, no spellcheck/autocapitalize, LTR.
 */
export const SecretInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "type" | "onChange">>(function SecretInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="password"
      name="flowline-credential-value"
      autoComplete="new-password"
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore=""
      data-form-type="other"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      dir="ltr"
      className={cx(
        "h-9 w-full rounded-md border border-line-strong bg-app px-3 font-mono text-base text-hi placeholder:text-muted transition-colors duration-[var(--dur-hover)] focus:border-accent focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
});

/** Reads and immediately clears a secret field. */
export function takeSecret(el: HTMLInputElement | null): string | undefined {
  if (!el) return undefined;
  const v = el.value;
  el.value = "";
  return v === "" ? undefined : v;
}
