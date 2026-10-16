# Task T2 (OpenCode): /sign-in scrolls horizontally in Arabic RTL at 375 px

Repo: this worktree (Next.js 16, React 19, Tailwind v4, Arabic-first RTL). Do not commit, do not start servers, browsers
or E2E. You may run `pnpm -s typecheck`, `pnpm -s lint` and `pnpm -s test`.

**Failing test.** `e2e/arabic.spec.ts:144` "no horizontal scroll in RTL at 375 / 1024 / 1440". Actual result:
`/sign-in @375: page must not scroll horizontally. Expected <= 375, Received 415`. The page content is 40 px too wide
in Arabic at 375 px.

**Where.** The sign-in page is `src/app/(auth)/**`: `auth-form.tsx`, its layout/page, and any decorative or landing
component it uses (`src/components/landing/*`, `src/components/theme-switcher.tsx`). The design-v2 changes are
`git diff fb563e5 -- "src/app/(auth)" src/components/landing src/components/theme-switcher.tsx`.

**Find the element wider than the viewport.** Typical causes:
- an absolutely positioned decoration/gradient using physical `left/right` or a translate that overflows in RTL;
- a fixed `w-[…]` / `min-w-…`;
- a flex row that doesn't wrap;
- a missing `overflow-x-clip` on a decorative wrapper.

**Fix at the source.**
- Use logical properties (`start/end`, `ms/me`, `ps/pe`).
- Allow wrapping, or clip the decorative layer only (e.g. `overflow-x-clip` on the decorative container).
- Do NOT hide overflow on `html`/`body` globally, and do not change the test.
- Use semantic tokens only.

Edit only the files needed, and list them in your final summary with the reason.
