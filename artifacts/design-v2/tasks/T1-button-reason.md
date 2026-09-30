# Task T1 (OpenCode): restore the accessible disabled reason on Button

Repo: this worktree (Next.js 16, React 19, TypeScript). Edit ONLY `src/components/ui/button.tsx`. Do not commit, do not
run servers, browsers or E2E. You may run `pnpm -s typecheck`, `pnpm -s lint` and `pnpm -s test`.

**Bug.** `Button` with `disabledReason` must keep the reason as its accessible description, always present in the
DOM, not only while a tooltip is open. E2E tests check `toHaveAccessibleDescription(...)` on such buttons, for example
"Fix 2 issues before running", "Enter an email", or "Only workspace owners and editors…". They now get "".

**Cause.** The new Button renders the reason only through the Radix `<Tooltip content>` (see `src/components/ui/tooltip.tsx`),
whose content isn't mounted until it opens. The old implementation (git show `cbd8563^:src/components/ui.tsx`,
the `Button` function) did this:
- `const reasonId = useId()`;
- `aria-describedby={disabledReason ? reasonId : undefined}` on the `<button>`;
- an always-rendered element with `id={reasonId}` holding the text.

**Fix.**
- Generate an id with `useId()` and add `aria-describedby` to the `<button>` when `disabledReason` is set. Merge it
  with any `aria-describedby` passed in `rest`, space-separated.
- Render the reason text always in the DOM, visually hidden (Tailwind `sr-only`), with that id.
- Keep the Radix Tooltip for the visual hover/focus hint.
- Keep all other behaviour exactly: `aria-disabled`, click blocked, `disabled={disabled && !disabledReason}`,
  `confirm`/`ConfirmCheck`, `loading`/`aria-busy`.
- Use semantic tokens only, no raw colors.

Finish with typecheck + lint + unit passing, and print a short summary of the diff.
