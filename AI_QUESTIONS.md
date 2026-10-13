# AI questions / notes

## 2026-10-15 — hub e2e-army file cap reached (recorded, not a blocker)

The hub's verify job copies only the first 8 top-level `e2e-army/*.e2e.ts` files of a branch
(`readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8)` in `nql-agents src/lib/e2earmy.ts`),
and `tests/unit/e2e-army-tooling.test.ts` asserts the repo stays within that cap.

`main` now sits exactly at 8 files (#221 added `e2e-army/221-auth-isolation.e2e.ts`), so the required
#166 test (`e2e-army/166-mena-template.e2e.ts`) is the ninth and the cap guard fails on any fresh CI run
of the PR. Since the hub cannot run the ninth file, the repo has to stay at 8.

**Suggestion for the owner (hub-side, not changed here):** raise the hub cap above 8, or make the hub run
every `e2e-army/*.e2e.ts` file, so a new feature test no longer silently evicts the alphabetically last one.
Until then, #166 keeps the repo at 8 by merging the two same-route platform-admin API tests (#179 into
`e2e-army/200-route-error-headers.e2e.ts`); every test and tag is kept. See that file's header.

## #197 PR #259 — scope finding is a stacked-PR base issue (not code)

The QA round-2 finding "Scope/merge conflict" asks this PR to touch only the 5 scoped files plus docs,
and says it "re-adds part 1's work" (`src/app/account/security/page.tsx`, the user-menu link in
`src/components/shell/app-shell.tsx`, `e2e-army/196-account-security.e2e.ts`, `scripts/gate-groups.mjs`,
and the i18n keys `meta.accountSecurity`, `shell.userMenu.security`, `account.security.title/back/twoFactor.title/on/off`).

Root cause: **#196 is not merged into `main` yet.** `origin/main` is `d136811` and has no
`src/app/account/security/page.tsx`. This branch (`ai/197`) is stacked on `ai/196`, so `git diff
origin/main..HEAD` necessarily shows #196's files as added. Re-running the same diff shows the same
files, so a rebase inside this branch cannot change it.

What actually resolves it (harness / owner action, outside this branch):

- merge #196 (`origin/ai/196`, `1dd80fe`) into `main`, **or**
- retarget PR #259's base from `main` to `ai/196`.

Once #196 is in `main` the diff collapses to this part's changes. The feared conflicts do **not**
materialise: this branch's `page.tsx` blob (`6ef4395…`) is byte-identical to `origin/ai/196`'s, and the
i18n keys were added with identical text, so the 3-way merge has no add/add conflict and no duplicate
JSON keys (checked with a JSON parser that flags duplicate keys — none found).

## Status of the rest of round 2

Fixed with tests in this branch:

- Cancel during a pending enable/verify no longer reopens the secret (request-id guard in
  `src/app/account/security/two-factor-card.tsx`; Playwright "cancelling a pending enable keeps the
  secret hidden" fails without the guard).
- `enable()` maps only better-auth's `INVALID_PASSWORD` to the password line; other 400s use
  `apiErrorMessage` (Playwright "a non-password enable failure shows its own message" fails with the
  old broad mapping). `src/lib/api.ts` now parses better-auth's top-level `{ code, message }` body
  (was only reading our own nested `{ error: { code, message } }`); covered by
  `tests/unit/api-error-shape.test.ts`.
- `docs/implementation/BETA_USER_GUIDE.md` no longer leaks the "coming in a later part" wording.
