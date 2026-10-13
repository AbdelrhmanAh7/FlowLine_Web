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

## Questions for #197 (account security page 2/4)

### Blocked: prerequisite #196 (part 1/4) is not on `main`

The brief says #197 edits `src/app/account/security/page.tsx`, which #196 creates, and that #196 must be merged first.

Checked on 2026-10-13 from `ai/197` (based on `main` at 9c754b2):
- `src/app/account/` has no `security/` directory; `e2e/account-security.spec.ts` does not exist either.
- Branch `ai/196` holds only the e2e-army test and a `docs/DEVELOPER_GUIDE.md` change (f59477d). It has no page, menu link or spec yet. The team plan lists #196 as RUNNING.

I did not re-create the page, the status badge or `e2e/account-security.spec.ts` here. That would duplicate #196's scope and conflict when both merge. I also did not write the e2e-army test, since there is no page to run it against.

### What is needed to continue
1. Merge #196 into `main`.
2. Rebase `ai/197` on `main` (or re-dispatch #197).
3. Run #197 as written: new `two-factor-card.tsx`, `page.tsx` edit, `ar.json`/`en.json` keys under `account.security.twoFactor.*`, the new case in `e2e/account-security.spec.ts`, the e2e-army test, and one bullet in `docs/implementation/BETA_USER_GUIDE.md`.

If you want #197 to proceed before #196 merges, say which branch to stack it on (`ai/196` once it has the page).

## Re-check (2026-10-13, second dispatch)

Still blocked. `ai/196` still has only f59477d committed; its worktree (`impl/FlowLine_Web-196`) holds the page, spec, menu link and i18n keys as uncommitted changes from a running agent. Stacking #197 on that unfinished state would conflict with #196's files (`page.tsx`, `e2e/account-security.spec.ts`, `en.json`/`ar.json`, `BETA_USER_GUIDE.md`). Re-dispatch #197 once #196 is committed and merged.
