# design-v2 pre-commit review (read-only)

**Reviewer:** Sonnet 5.5 (`claude-sonnet-5-5`), read-only. Worktree `FL-wt-design`, branch `design-v2`, HEAD `fb563e5`.
**Candidate:** `refs/checkpoints/design-v2-closeout-8` = `a4eeabd`; the working tree equals it (per the brief; I did not re-hash it).
**Reviewed:** `git diff fb563e5` (72 tracked files, +2217/-929) and the untracked set from `git status --porcelain --untracked-files=all`
(snapshot: **660** files, 56.0 MB; excluded from the review as instructed: `helper-logs/`, `.profile/`, `test-results`, `.env*`, `scratch-css.mjs`).

**Verdict: no P0 and no P1 found in the product code or the tests.** There are 3 P2 (records/evidence/scanner) and several P3.
Nothing here needs a code change to be safe to commit; the P2 items are about what the commit claims and what goes into it.

## What I ran and what I did not
- **Ran:** `pnpm -s lint` (exit 0, no output); `pnpm -s typecheck` (exit 0; it took 3 s, so it is an incremental result from the existing `tsconfig.tsbuildinfo`).
- **Read:** the full diffs of `src/components/ui/*`, `src/i18n/engine-text.ts`, `en.ts`/`ar.ts`, the run inspector, both switchers, `src/theme/client.tsx`,
  `globals.css`, the landing motion components, the admin/AI/OAuth/SSO/billing/integrations/builder diffs, all changed and new specs,
  and `scripts/check-evidence-secrets.mjs`.
- **Did not run:** vitest, Playwright, any server or browser, or `pnpm check:evidence` (the scanner reads `.env*` in-process, which the brief said not to do).
  So the "unit 364/364" and "`check:evidence` 0 hits" figures in `closeout/RESUME.md` are **not re-verified by me**.
- **Did not check:** every one of the 520 PNGs (I viewed 4: the two >1 MB admin captures and two "masked" ones); the `manual-cp8/` folder that Codex is still filling
  (the untracked count went from 660 to 706 while I worked); the contents of the `.zip` traces (unreadable by design).

---

## 1. Correctness findings (product code changed since `fb563e5`)

### P0 / P1
None found.

### P2 (records and safety net, not runtime behaviour)

**P2-1. The committed records would over-state what was verified.**
- `artifacts/design-v2/BUGS.md:10-22` (status table) still says "pending Codex retest" for Q01-Q05, V01-V03, L01. The per-issue sections (lines ~148-247) already record the cp7 retest
  (8 of 9 FIXED, Q05 PARTIAL, then `aria-modal` added on cp8). The table and the sections disagree.
- `artifacts/design-v2/NOTES.md:140` (the "Automated gates" row of the §9 table): "**final gate: see below**", but nothing follows the table (the file ends at line 142). It reads as if a final gate exists.
- `artifacts/design-v2/gate/full-20260929-2019/GATE.md` is headed "complete, on one frozen candidate" and reports 77/77, 25/25, 25/25, 306 unit. That candidate is `09a1fbe`
  (cp3), **not** `a4eeabd`. NOTES.md §9 does say "earlier candidate", which is honest; GATE.md itself carries no "superseded" line, and `closeout/RESUME.md` says the cp8 final gate has not run yet.
  The closeout smokes (cp4-cp7) and `screenshots-cp5/` are likewise tied to older checkpoints.
- Fix before committing: update the BUGS table, replace the "see below" with the real final-gate path (or "not yet run"), and add one line to GATE.md
  ("superseded by the gate on `<final SHA>`"). AGENTS.md: "Unverified integrations must never be presented as production-verified"; "Evidence ... tied to the tested SHA".

**P2-2. `scripts/check-evidence-secrets.mjs` can pass vacuously and has scan gaps.** It never prints a value (see §2), which is the important part. The gaps:
- `:17-27,67-68`: if no env file exists (fresh clone, CI), `secrets` is empty, the scan is a no-op, and it still prints "0 hit(s)" and exits 0. `package.json` now puts it in `pnpm check`, so the gate
  can pass with nothing checked. Suggest: exit 1 (or a loud warning) when `secrets.length === 0` unless an explicit `--allow-empty`.
- `:19`: `.zip` and images are skipped. The 11 Playwright `trace.zip` files (~6.4 MB) and 520 PNGs are therefore outside every "0 hits" claim. Traces record request bodies and headers.
- `:45`: `git diff --cached --name-only` is called without `-z` (or `-c core.quotepath=off`), so a staged path with non-ASCII characters comes back quoted/octal-escaped and
  `existsSync` fails, which silently skips it. Today that only concerns 12 Arabic-named PNGs, but a non-ASCII text file would be skipped too.
- `:17`: `SECRET_NAME` does not match names such as `DATABASE_URL`, `*_DSN`, `*_URL` with credentials. Mitigated when the password is also its own variable (`POSTGRES_PASSWORD`).
- It does not catch encoded forms (URL-encoded, JSON-escaped, base64) of a value.

**P2-3. `test-results-*` folders are not ignored and contain unscannable traces.** `.gitignore:10` (`test-results/`) matches only a directory named exactly `test-results`.
`artifacts/design-v2/closeout/test-results-smoke*/` (34 files) and `gate/*/test-results-*/` (10 files) hold 44 files in all, including 11 `trace.zip` plus `error-context.md` page snapshots; a directory `git add` would stage them.
See §3 for the exclusion list; suggest adding `artifacts/**/test-results*/` to `.gitignore`.

### P3

**P3-1. `Tooltip openOnTap` can keep a stale "was open" flag** (`src/components/ui/tooltip.tsx:27-36`). `openAtPointerDown` is reset only in `onClick`. A pointer-down that is dragged off the
control (no click) leaves it `true`, and the next keyboard activation then runs `setOpen(!true)` and closes the tooltip instead of opening it. Fix: reset it on `onPointerCancel`/`onPointerLeave` or on `onKeyDown`.

**P3-2. A blocked tab's reason is not reachable by keyboard** (`src/components/ui/tabs.tsx:70-83`). The blocked tab is `tabIndex={-1}` and skipped by arrows/Tab, by design. Screen-reader users get
`aria-describedby`; pointer and touch users get the tooltip; a sighted keyboard-only user cannot see why the "Error" tab is dimmed. Only affects the run inspector's Error tab on a non-failed step.
The WAI-ARIA tabs pattern allows a focusable `aria-disabled` tab. Not a regression (the old button was `title=` only, also mouse-only).

**P3-3. Q01 message mapping (`src/i18n/engine-text.ts`): no way found to show a wrong outcome, but three edge cases can name the wrong thing or rewrite user text.**
- Every shape is tried only inside its own `code` bucket (`:377-378,390`) and English output is pinned byte-for-byte to the real emitters
  (`tests/unit/run-messages.test.ts`, which imports the real `mapProviderError`/`safetyRefusal`), so drift falls back to the stored English rather than to a wrong sentence. The Arabic
  catalogue entries I read keep the meaning, the status, the provider and the "not retried / not sent elsewhere" statements (`ar.ts` `errorShape`).
- `:254-258` `approvalActionId` picks the pending approval of the node, else the **first** approval of the node. If a node ever has approvals for different actions (an agent node
  with several tool approvals), a non-pending case (rejected, cancelled-in-flight) can name the wrong action's title in the UI language.
- `worker/agent-runner.ts:344` stores the **reviewer's free-text note** as the message of an `APPROVAL_REJECTED` error. The shape `^(.+) was rejected$` (`:285`) would then rewrite a note that
  happens to end in "was rejected", and `actionName` (`:261-263`) would replace its "title" with the action title when `ctx.actionId` is set. Very unlikely; the note text is otherwise shown as written.
- `:394-398`: for code `APPROVAL_REQUIRED` with an unrecognised message, the whole stored text is replaced by "Waiting for approval to run {title}". Semantically right, but it drops any extra text.
- Messages outside the shapes (for example the agent default "Rejected by an approver") stay English in the Arabic UI. That is incomplete, not misleading, and already tracked as DV2-Q01a.

**P3-4. Stale doc comment.** `src/components/language-switcher.tsx:9` says the default is "the 28px-tall buttons"; the code is `h-8` (`:52`), which is 26 px at the 13 px root (the theme switcher's comment states this correctly).

**P3-5. Dialog focus return: latent gap and thin E2E coverage.**
- `src/components/ui/dialog.tsx:27-36` remembers `document.activeElement` at open. If a dialog is ever opened from a Radix menu item (the menu closes and removes the focused item), the remembered element
  is gone, the fallback is empty, and Radix's default runs (focus on `<body>`). No caller does this today (`grep`: the only `MenuItem onSelect` is sign-out).
- Only the phone run sheet asserts focus return in E2E (`e2e/responsive.spec.ts:162`). The desktop `Dialog` case rests on the pure-logic unit test and the Codex Chrome retest (Q02 FIXED on cp7).
- The unmount fallback (`dialog.tsx:44`) is correct by my reading, including React strict mode (the `opened` guard at `:33`).

**P3-6. Global `reducedMotion: "reduce"` in `playwright.config.ts:41-43`.** Every spec that does not opt back in runs with animations off, so Radix `Presence` exit paths (dialog close, focus return after the
exit animation) are exercised with motion only by `run-states`, the motion block of `landing.spec`, the `@cross-browser` hydration contexts and the manual Chrome passes. Documented and deliberate (stability); noting the trade-off.

**P3-7. `useCanvasColors` snapshot has a DOM side effect** (`src/theme/client.tsx:85-97`): `getSnapshot` appends and removes a probe `<span>` on the first read per `theme:matchMedia` key. It is cached per key and the
observer watches only `data-theme` on `<html>`, so there is no loop, but a `getSnapshot` should be pure.

**P3-8. `Select` wrapper: `splitPlacement`** (`src/components/ui/fields.tsx`, `PLACEMENT` regex) moves only width/flex/grid/margin utilities to the wrapper. A caller passing `hidden`, `sr-only` or a `style` prop would hide
the `<select>` but leave the wrapper and chevron visible. I did not enumerate every `<Select>` caller, so this is unverified for them.

**P3-9. `Button confirm`** (`src/components/ui/button.tsx`, `blocked = ...` does not include `confirm`): the button stays clickable during the 1.4 s check, so a second click re-submits (for the approval box the server
rejects it with a conflict, so no harm; the box normally unmounts on refetch).

**P3-10. Line endings.** 8 files (`globals.css`, `engine-text.ts`, `ar.ts`, `en.ts`, `tokens.ts`, `generate.ts`, `feature-scenes.tsx`, `scroll-root.tsx`) are CRLF in the working tree. `.gitattributes` (`* text=auto eol=lf`) normalises them
when staged; expect the "CRLF will be replaced by LF" warnings. No content impact.

**P3-11. New test that can pass vacuously.** `e2e/reduced-motion.spec.ts:36-37` accepts `"missing"` for the flowing-edge animation (`.catch(() => "missing")`). If the flowing edge never renders, that line passes; the running-node assertions
just above it are the real checks. This is a new file, so it is not a weakening against `fb563e5`.

### Areas I looked at and found sound
- **Dialog / Drawer** (`ui/dialog.tsx`, `ui/focus-return.ts`): opener captured before Radix moves focus; capture-once guard for strict mode; restore only when focus is lost; `preventDefault` only when something was actually restored;
  `aria-modal="true"` on both; the Drawer's `aria-labelledby` is spread only when set (an explicit `undefined` would unname it, which the comment says and the code avoids); `label ?? closeLabel` for the sr-only title;
  the sheet variant scrolls inside its wrapper. Only 2 `<Drawer>` callers exist (inspector, style guide), so the new inner wrapper does not affect other layouts.
- **Button** (`ui/button.tsx`): the reason is `aria-describedby` from an always-mounted sr-only span outside the button; the blocked click calls `preventDefault` without `stopPropagation`, so the tooltip's tap handler still runs.
  `confirm` keeps the label in the DOM (accessible name and width kept) and only draws the check over it.
- **Tabs** (`ui/tabs.tsx`): blocked tabs are custom `role="tab"` buttons outside Radix roving focus, `aria-disabled`, with the tooltip trigger not overriding their `data-state` (Slot lets the child's prop win).
- **Tooltip** (`ui/tooltip.tsx`): pointer-down/click ordering matches Radix (ours runs first via `composeEventHandlers`; `preventDefault` on click stops Radix's close).
- **Inspector phone Drawer** (`runs/inspector.tsx:318-330`): conditional mount with `open`, `onOpenChange` clears `run`, name from `sheetLabel`, `fallbackFocus` = `#run-row-<id>` (the id exists on the row button),
  and the fallback ref is refreshed every render so the last function survives the unmount. `actionIdOf` (`:30`) applies an action id only when the loaded run is the row's own run. The migration to `Tabs`/`TabPanel` kept all four
  payload branches, and the rerun dialog error now shows inline (`role="alert"`) instead of vanishing in a toast.
- **Theme/language switchers and `src/theme/client.tsx`:** server and client snapshots agree (`server` theme from context, `dataset.theme` after hydration); `aria-label` equals the visible label in every density; `title` and
  `aria-pressed` kept; the canvas colours use per-theme constants on the server and a memoised probe on the client.
- **`globals.css`:** selection pulse moved to `::after` so it can no longer replace another `animation` on the same node (host `relative`, no `overflow-hidden`: verified in `flow-node.tsx:126`);
  the reduced-motion block forces reveals visible, zeroes transition delays, and gates the pin/scrub/parallax; a reveal is at most 100 ms stagger + 200 ms (`--dur-tab`), inside the 300 ms rule.
- **`/design-system`** returns 404 in production unless `FLOWLINE_ENV=test` (`src/app/design-system/page.tsx`).
- **Dependencies:** `@radix-ui/react-select` is removed from `package.json` and the lockfile (66 pure deletions, no additions); no `src`, `e2e`, `tests` or `scripts` file references it.

---

## 2. Security and honesty

- **No secret echoes.** `SecretInput` changed by one class token only (`components/secret-input.tsx:31`, `border-line-strong` to `border-line-control`); it is still uncontrolled `type=password`, LTR, with `ref`.
  `tests/unit/secret-input-refs.test.ts` and every `takeSecret` call are untouched (I did not run that test). The AI/OAuth/SSO/admin secret dialogs moved onto `ui/Dialog`, with no change to how secrets are read or cleared.
  Observation (pre-existing, not a regression): the integrations connect dialog uses a controlled `<Input type="password">` for `f.secret` fields (`integrations/page.tsx`, identical lines before and after).
- **No misleading success.** `Button confirm` is fed only from server-confirmed callbacks (`DecisionBox` `onSuccess` in the inspector; the OAuth-app save after the awaited `PUT`). Failures that were silent or transient
  are now inline and assertive (rerun start: `data-testid="rerun-error"`; trigger-secret rotation: `rotate-error`; AI paid test: `role="alert"` on failure).
- **"Test double" labels intact.** `ai-providers.tsx:42-44` (`data-testid="ai-test-double"`) is untouched, `aiHub.testDouble` exists in both `en.ts:2040` and `ar.ts:2184`, and no diff line removes or weakens
  "test double" / "not live-verified" / "not verified" wording. The landing integrations scene shows "Verified live / Not verified" from the real registry (`listProviders().verification.live`), and the Copilot copy now says it is experimental.
- **The evidence scanner cannot print a value.** The only outputs are `SECRET FOUND: <relative path> contains the value of <file>:<VAR NAME>` and the summary count (`:63-67`); `s.value` is used only in `includes()`.
  (Caveat: it can pass vacuously; see P2-2.)
- **What I scanned in the untracked text files (128 files), counts only:** 0 hits for `sk-`, `sk-ant-`, `AKIA`, `ghp_`, `xox*`, PEM private keys, JWT-shaped strings, `AIza`, `pdl_`, `whsec_`, `re_…`, session-token cookies,
  `Authorization: Bearer`, `postgres://user:pass@`, and quoted JSON `password/secret/token/apiKey` values. `Set-Cookie` matches (16) are the better-auth "plugin order" warning text in stack logs, with no cookie values.
  One env-style hit: `BUGS.md:69` is `FLOWLINE_ENCRYPTION_KEY=<value>` (a placeholder, not a value). `dv2-02/*.json/txt` hold only 12-hex key ids and PASS lines. No non-test email addresses.
- **Screenshots viewed:** `admin-credential-saved-masked.png`, `admin-stepup.png` (the two files over 1 MB), `admin-totp-enrolled-masked.png`, `api-key-reveal-masked.png`. All secret and code fields are painted solid magenta; the visible values are fixtures
  (`fake-google-client`, `test_0123456789abcdef…`, `qa-owner-…@flowline-qa.test`). The rest of the PNG set is not reviewed by me (the scanner cannot read images either).

---

## 3. What should not be committed, and the exact staging plan

### Numbers (snapshot of 660 untracked files)
- **Size:** 56.0 MB total; 520 PNG, 37 JSON, 34 TXT, 29 MD, 11 ZIP, 11 TS, 6 LOG, 3 MJS, 2 TSX, 2 PS1, 2 CSV, 1 CJS, plus `.current-run` and `STOP`.
  By area: `chrome-qa` 220 files / 25.9 MB, `visual-review` 135 / 10.3 MB, `gate` 165 / 9.8 MB, `closeout` 114 / 11.2 MB.
- **Files over 1 MB (2, both untracked):**
  - `artifacts/design-v2/chrome-qa/screenshots/admin-stepup.png` (1,423,456 B)
  - `artifacts/design-v2/chrome-qa/screenshots/admin-credential-saved-masked.png` (1,419,839 B)
  - Both are full-page captures, masked and fixture-only (viewed). Next largest are 11 `trace.zip` at 0.33-0.97 MB (all in `test-results-*`).
- **Raw transcripts:** none found (0 hits for assistant/tool_use JSON, Codex banners, "session id", "tokens used", "mcp startup"). The `BRIEF.md` files are prompts, and the `REPORT.md` files are reports; `helper-logs/` (8 files, 1.2 MB) is correctly gitignored.
- **Absolute user paths in untracked text artifacts:** **35 files, 241 lines** (`C:\Users\<user>\Desktop\Personal_Project\FL-wt-design\...`, mostly Playwright stack frames). Top: `closeout/smoke-cp5.json` 57,
  `closeout/smoke-cp6.json` 41, `gate/e2e-chromium.txt` 18, `gate/rerun-…/results-A.json` 17, `closeout/smoke-cp5.txt` 12, then 9 each in `results-B/C/A-retest.json`, `results-chromium/firefox.json`, `smoke-cp7.json`, `smoke-cp4.json`;
  the remaining 24 files have 1-8. **Tracked diff: 0.** Precedent: 82 files already tracked at `fb563e5` carry the same kind of path (`artifacts/ai-hub/...`). Low risk (a username and a folder name); a `sed` to `<worktree>` is optional.
- **Leftover temp scripts:** `scratch-css.mjs` (repo root; already on your exclude list); `gate/.current-run` (20 B marker) and `gate/rerun-20260929-2012/STOP` (0 B sentinel).
  Small helper scripts that are *referenced* by the evidence and can stay: `closeout/sampler.ps1` and `gate/rerun-…/sampler.ps1` (RESUME/GATE), `gate/rerun-…/verify-selection.cjs` (TARGETED-RERUN.md:22),
  `visual-review/driver.mjs` (capture driver).
- **Working notes that should not go in:** `KIMI_RESUME.md` (root; its "Fix first" list is long stale and it would mislead), `artifacts/design-v2/NOTES-draft.md` (superseded by `NOTES.md`),
  `artifacts/design-v2/closeout/RESUME.md` (lead's transient resume/authorisation notes, will be stale at commit; your call).
- **Non-ASCII file names:** 12 files `chrome-qa/screenshots/landing-reduced-ar-<داكن|فاتح>-<width>.png`. Not referenced by any report. They round-trip badly through git on macOS (NFC/NFD), and break the scanner's staged-path list (P2-2). Rename to ASCII (`dark`/`light`) or leave out.
- **Still growing:** `chrome-qa/manual-cp8/` (Codex computer-use pass) was empty of files when I started and had 46+ new files when I finished. Review it (secret scan, screenshots of key/TOTP dialogs) after Codex finishes; it is **not** covered by the counts above.

### Proposed staging (explicit; nothing here matches `helper-logs/`, `.profile/`, `test-results`, `.env*`, `scratch-css.mjs`)
```bash
# 0. Before staging (edits, see P2-1): BUGS.md status table + line 37 trace reference, NOTES.md:140, GATE.md "superseded" line;
#    optionally rename the 12 Arabic-named PNGs to ASCII; optionally add  artifacts/**/test-results*/  to .gitignore (then commit that too).

# 1. Product, tests, tooling: the 72 tracked modifications (all reviewed, all intended; no deletions or renames in the tree)
git add -u

# 2. New code, tests, docs
git add scripts/check-evidence-secrets.mjs
git add src/app/design-system src/components/ui/focus-return.ts src/design/contrast.ts
git add e2e/landing.spec.ts e2e/reduced-motion.spec.ts e2e/run-states.spec.ts e2e/theme.spec.ts
git add tests/unit/design-system.test.ts tests/unit/dialog-focus.test.ts tests/unit/dv2-visual-fixes.test.ts tests/unit/landing-header.test.ts tests/unit/run-messages.test.ts
git add docs/design-system/README.md

# 3. Evidence: whole folders, with pathspec excludes for the unscannable/transient parts
git add artifacts/design-v2/NOTES.md artifacts/design-v2/BUGS.md artifacts/design-v2/SONNET-REVIEW.md
git add artifacts/design-v2/tasks artifacts/design-v2/dv2-02
git add artifacts/design-v2/chrome-qa  ':(exclude)artifacts/design-v2/chrome-qa/**/.profile' ':(exclude)artifacts/design-v2/chrome-qa/screenshots/landing-reduced-ar-*'
git add artifacts/design-v2/visual-review
git add artifacts/design-v2/gate \
    ':(exclude)artifacts/design-v2/gate/.current-run' \
    ':(exclude)artifacts/design-v2/gate/*/test-results-*' \
    ':(exclude)artifacts/design-v2/gate/*/STOP'
git add artifacts/design-v2/closeout \
    ':(exclude)artifacts/design-v2/closeout/test-results-*' \
    ':(exclude)artifacts/design-v2/closeout/RESUME.md'
# (chrome-qa/manual-cp8 comes with the chrome-qa line above, so only run that line after Codex has finished and the folder is reviewed)

# 4. Never stage: KIMI_RESUME.md, scratch-css.mjs, artifacts/design-v2/NOTES-draft.md, helper-logs/, .profile/, test-results*/, .env*

# 5. Verify what is staged, then scan (the scanner reads the STAGED list plus artifacts/, so run it after `git add`)
git diff --cached --stat | tail -3
git diff --cached --name-only -z | xargs -0 -n1 echo | grep -E 'test-results|helper-logs|\.profile|\.env|scratch-css|KIMI_RESUME|NOTES-draft|trace\.zip' ; echo "(expect no lines above)"
pnpm check:evidence
```
Expected effect (snapshot): 62 of the 660 untracked files are left out (10.2 MB: 11 traces plus their `error-context.md`/`.last-run.json`, the 12 Arabic PNGs, `RESUME.md`, `NOTES-draft.md`, `KIMI_RESUME.md`,
`scratch-css.mjs`, `.current-run`, `STOP`); 598 files (47.2 MB) plus the 72 tracked edits are committed, plus `manual-cp8/` once it is reviewed.
The `BUGS.md` DV2-01 text (line 37) cites `test-results-A/.../trace.zip`; either say "kept locally, not committed" or accept committing that one 0.97 MB trace (fake provider only, but unscannable).

---

## 4. Test integrity versus `fb563e5` (`e2e/` and `tests/`)

**No assertion was deleted or weakened.** Tracked changes are confined to `e2e/`; `tests/` has **no** modified tracked file (5 new files only).

| File | Change | Removed `expect`? |
|---|---|---|
| `e2e/helpers.ts` (+84) | added `FAKE_PROVIDER`, `setupStuckSheetsRun`, `resetFakeProvider`, `cancelRunQuietly` | none |
| `e2e/hydration.spec.ts` (+51, 1 import line) | added the Arabic + light public-page hydration test | none |
| `e2e/phase2.spec.ts:245-248` | `toHaveURL(/integrations/)` replaced by `toHaveURL(/integrations\?oauth=reconnected/, {timeout: 20s})` **plus** new `expect(dialog).toBeHidden()` | 1 replaced by a **stricter** one |
| `e2e/phase3.spec.ts:172,283` | selector `"✦ Copilot"` to `"Copilot", exact: true` (the baseline builder already renders `<Sparkles/> Copilot`, so the old name was stale); assertions unchanged | none |
| `e2e/responsive.spec.ts` | `OUT` from env with the same default; the 3 run-inspector `expect`s stay in the `else` (desktop/tablet) branch; the phone branch keeps step-panel visible + "failed" text + Runs list visible (after close) and adds 6 checks (named dialog, focus inside, Escape closes, URL loses `run`, list visible, focus back on `#run-row-…`); `"✦ Copilot"` selector as above (`:296`) | 3 moved, 0 dropped |
| `e2e/tools/design-screenshots.mjs` | 5 screens added | n/a |

- New specs `landing`, `reduced-motion`, `run-states`, `theme` and new unit files: I found no `test.skip`, `fixme`, `.only`, `it.skip`, `xit` or `expect(true)`. The count of skip/fixme/only lines across `e2e/` + `tests/` is 1 at `fb563e5`
  and 1 now (the same pre-existing line).
- `landing.spec.ts` branches on `CSS.supports("animation-timeline: view()")` but asserts the static fallback in the other branch instead of returning early; its motion block opts out of the global reduced-motion setting explicitly (`:112`).
- Config change to be aware of: `playwright.config.ts:41-43` adds global `reducedMotion: "reduce"` (P3-6). `tests/unit/design-system.test.ts:15-17` compares `tokens.generated.css` to `generateCss()`; I did not run it, so token freshness is unverified by me.

---

## 5. Suggested order for the lead
1. Edit BUGS.md/NOTES.md/GATE.md (P2-1). 2. Decide on the 12 Arabic PNGs, the `.gitignore` line and the scanner guard (P2-2/P2-3; the scanner change is optional for this commit).
3. Wait for Codex's `manual-cp8/`, review it, then run the final gate on the frozen candidate. 4. Stage with the list in §3, run `pnpm check:evidence` after staging, and read `git diff --cached --stat`.
