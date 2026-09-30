# design-v2: bugs found during verification

## Beta continuation — 2026-09-30

Current executor record: [beta findings](../beta-execution/20260930T122429Z/BUGS.md). cp20 cumulative browsers pass 114/50/50; the failed old unit result remains preserved. cp21 product/E2E equals cp20 and updates the shared-close-handler assertion; current unit/contract/integration pass 388/465/460. Claude review pending; own checks are not independent review.

DV2-02 follow-up for FlowLine/.env.test and FL-wt-aihub/.env.test is now remediated under the binding beta brief: independent replacement keys and fresh dedicated test DBs, old DBs intact, no fallback, app crypto/persistence/old-key rejection checks. Audited dev/staging settings and running staging containers do not reuse the exposed key. 2,592 reachable history text blobs have zero affected-key hits; pixels/zips/unreachable transcripts excluded. See ../beta-execution/20260930T122429Z/key-rotation.json. Earlier open statuses below describe their historical checkpoints, not current remediation.

Journey 9 is complete with cp16/cp18/cp20 source-mapped checks. R01–R04 remain open. In particular R04's approval-display impact needs Claude review before treating it as harmless; no security/data/core-journey issue is waived by its old P3 label. U1/U2/U3 are accepted by the binding brief only where usable/accessibility checks pass. No beta-ready, external-provider or production claim.

Severity: P0 = security / tenancy / data loss / money; P1 = core journey broken or misleading; P2 = degraded with a
workaround; P3 = cosmetic. Class: application defect, test defect, environmental, or unresolved observation.

## Status summary (kept current by the lead)

Current additions supersede historical checkpoint statuses: cp28 is under its complete gate. DV2-H01 (P1, application navigation) was reproduced twice in actual Chrome: landing section -> Sign in -> Back restored the hash URL but left Sign in content. The three section anchors now use Next Link; EN/AR regressions cover all sections and Back/Forward content. cp27 Chromium/Firefox passed; WebKit exposed a new-test innerText/textContent mismatch, corrected on cp28 without removing assertions. Final Chrome and all gates remain required. Evidence: `../beta-execution/20260930-landing-executor/chrome-current/REPORT.json` and `cp27-webkit/report.sanitized.json`.

| ID | Sev | Class | Found by | Status |
|---|---|---|---|---|
| DV2-K01 | P2 | app (keyboard) | exhaustive headed Chrome | FIXED/RETESTED cp16: phone navigation focus/containment/Escape |
| DV2-K02 | P2 | app (keyboard) | exhaustive headed Chrome | FIXED/RETESTED cp16: node drawer focus and Escape from inputs |
| DV2-K03 | P2 | app (keyboard) | exhaustive headed Chrome | FIXED/RETESTED cp16: OAuth/admin inline confirmations |
| DV2-K04 | P2 | app (keyboard) | exhaustive headed Chrome | FIXED/RETESTED cp16: run dock and desktop inspector focus/Escape |
| DV2-K05 | P2 | app (keyboard) | exhaustive headed Chrome cp14 | FIXED/RETESTED cp16: destructive confirmation lifecycle and surviving focus |
| DV2-K06 | P2 | app (closeout regression) | cumulative Chromium cp16 | FIXED/RETESTED cp18: preserve mouse-selected canvas focus and selection on drawer dismissal |
| DV2-K07 | P2 | app (keyboard, WebKit) | cumulative WebKit cp18 | FIXED/RETESTED: cp20 focused WebKit 28/28 and final WebKit 50/50; mapped headed H en/ar removal checks 6/6 |
| DV2-F01 | P2 | app | Codex headed Chrome cp11 | FIXED and retested on cp12: ordinary 404, cached panel removed, API denied (A-retest) |
| DV2-01 | P2 | test defect | automated rerun | FIXED in the test; retested (pass) |
| DV2-02 | P2 | key exposure / evidence | lead's secret scan | containment + replacement + verification DONE; other test envs OPEN (owner) |
| DV2-Q01 | P2 | app | Codex Chrome QA | FIXED (UI translation by code; `src/i18n/engine-text.ts`); **retested FIXED (requested cases) by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-Q01a | P3 | app (remaining coverage) | lead | OPEN: provider/engine payload text and rarer AI codes stay raw (list in Q01 fix notes) |
| DV2-Q02 | P2 | app | Codex Chrome QA | FIXED (`ui/dialog.tsx` return focus); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-Q03 | P2 | app | Codex Chrome QA | FIXED (landing header wraps; compact switchers); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-Q04 | P2 | app | Codex Chrome QA | FIXED (phone language/theme controls); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-Q04a | P3 | observation | worker | OPEN: below 1024 px the keyboard order (preferences → account) differs from the visual order |
| DV2-Q05 | P2 | app | Codex Chrome QA | FIXED and retested on cp12: named modal, focus loop, Escape and focus return (A-retest; B-resume phone recheck) |
| DV2-V01 | P3 | app (pre-existing) | Codex visual review | FIXED (React Flow node-type border reset); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-V02 | P3 | app | Codex visual review | FIXED (`nodeText` subtitles); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-V03 | P3 | app | Codex visual review | FIXED (`<bdi>` isolation of user-authored names); **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-L01 | P2 | app (a11y target size) | new E2E header test, first real run | FIXED on cp7: `landing.spec` + theme/arabic/auth specs 39/39; **retested FIXED by Codex on cp7** (`chrome-qa/retest/REPORT.md`) |
| DV2-M01 | P2 | app (a11y) | Codex Chrome cp8 | FIXED and retested on cp12: Add node Escape returns focus; cross-browser keyboard 17/17 per browser (the Chromium targeted run additionally passed 3/3 admin tests) |
| DV2-M02 | P2 | app (a11y) | Codex Chrome cp8 | FIXED and retested on cp12: proposal survives Escape/X, nested Escape, no refetch focus steal, non-modal panels |
| DV2-R01 | P3 | app | Sonnet pre-commit review | OPEN: `ui/tooltip.tsx` tap-toggle can keep a stale pressed state after a drag-off (next tap toggles the wrong way) |
| DV2-R02 | P3 | app (a11y) | Sonnet pre-commit review | OPEN: a blocked tab is skipped by arrow keys, so its reason is reachable by hover/tap and the screen-reader description only, not by keyboard focus |
| DV2-R03 | P3 | app | Sonnet pre-commit review | OPEN: dialog focus return falls back to `<body>` if the opener was removed (e.g. a closed menu item); no current caller does this |
| DV2-R04 | P3 | app (edge) | Sonnet pre-commit review | OPEN: `approvalActionId` may name the wrong action when one agent node has several pending approvals; reviewer free text passes through the Q01 regexes (display only) |

Owner decisions from the visual review (not defects): U1 landing composition narrower than the deck (design-v2 change);
U2 template/integration density (predates design-v2); U3 settings has 9 tabs (predates design-v2: Phase 4 + AI hub).
See `visual-review/REPORT.md`.

## DV2-01: `phase2.spec.ts` "repair a connection" navigates away mid-OAuth (test defect, P2, FIXED in the test)

- **Retest (cp7): BLOCKED (outside this retest brief): the automated OAuth test synchronization finding was not rerun; no test-suite result is claimed.**

- **Seen:**
  - Interrupted run `gate/e2e-chromium-2.txt` #43.
  - Controlled rerun `gate/rerun-20260929-2012/batch-A.txt`, under stable memory: at least 11.9 GB available, 1 worker.
  - Same error both times: `page.goto: net::ERR_ABORTED at /w/<slug>/flows` at `e2e/phase2.spec.ts:248`.
  - It passed in the first design-v2 run (`gate/e2e-chromium.txt`, before the P1 fix batch) and on `ai-hub`.
- **Cause (from the trace, `rerun-20260929-2012/test-results-A/phase2-repair-*/trace.zip`, kept locally and excluded from the commit):**
  - Clicking "Continue to Google Sheets" starts the OAuth round-trip asynchronously:
    `/api/oauth/start` → fake `/oauth/authorize` → `/api/oauth/callback` → `/integrations?oauth=reconnected`.
  - The test's wait for that return was weak:
    - `toHaveURL(/integrations/)` is already true before the round-trip.
    - "the Google Sheets alert has count 0" used to become true only after the reload. The P1-7 fix migrated the
      Reconnect dialog to the design-system (Radix) modal. That correctly hides everything outside an open modal from
      the accessibility tree, including the banner, so the check now passed immediately.
  - The test's `page.goto(/flows)` therefore raced the OAuth navigation, and the browser aborted it.
- **Product behaviour is correct:** the reconnect completes and returns with `oauth=reconnected`.
- **Fix (test synchronisation only; nothing removed, assertions strengthened):**
  - Wait for the real return, the URL containing `oauth=reconnected`.
  - Wait for the dialog to close before checking the banner and navigating.
- **Retest:** see the rerun report.

## DV2-02: the worktree test encryption key was exposed through a helper transcript (key exposure / evidence hygiene, P2)

- **Retest (cp7): BLOCKED (outside this retest brief): secret containment and cross-environment key rotation were not audited; no .env files or secret values were read.**

| Track | Status |
|---|---|
| Containment | **DONE:** log redacted, checkpoints rebuilt |
| Key replacement (FL-wt-design test environment) | **DONE:** new workspace and platform test keys, new DB `flowline_test_dv2` |
| Verification | **DONE for this worktree:** crypto checks and secret scans below. The full gates on the new DB are in the closeout gate. |
| Same key in other test environments | **OPEN, owner decision:** `FlowLine/.env.test` (`flowline_test`) and `FL-wt-aihub/.env.test` (`flowline_test_aihub`) |
| Recurrence prevention | **DONE:** helper output is gitignored; `pnpm check:evidence` runs in `pnpm check` |

- **Unrelated matches, not secrets:** `SLACK_OAUTH_CLIENT_SECRET` and `FLOWLINE_BILLING_STRIPE_KEY` are intentional fake
  fixtures (`fake-…`, `sk_test_f…`), deliberately committed as test doubles. The DV2-01 trace was unzipped and scanned,
  and no `.env.test` secret is in it.

### How it was exposed
- **The leak:** Kimi ran `grep ENCRYPTION` over `.env.test`. Its tool output `15:FLOWLINE_ENCRYPTION_KEY=<value>` became
  part of Kimi's conversation, which was sent to Kimi's cloud model provider. The lead redirected Kimi's stdout into
  `artifacts/design-v2/kimi-resume.log`, which put the value in local evidence and in three local checkpoint refs.
- **It was already non-confidential before that:**
  - The same value is the test key in `FlowLine/.env.test` and `FL-wt-aihub/.env.test`.
  - It appears in at least 5 of this session's Claude subagent transcripts (`~/.claude/projects/.../subagents/*.json`),
    so it was also sent to Anthropic's API in agent contexts.
  - It was not found in `~/.kimi`, `~/.codex`, or the OpenCode / Command Code stores. Kimi CLI's own history location
    was not identified.
- **"Never pushed" is not proof of non-exposure:** the pushed history is clean (below), but the value left the machine
  through AI providers.

### Where the key is used (compared by sha256; no values printed)
- **Uses the exposed key:**
  - `FL-wt-design/.env.test` (`flowline_test_design`), until it was replaced;
  - `FlowLine/.env.test` (`flowline_test`);
  - `FL-wt-aihub/.env.test` (`flowline_test_aihub`).
- **Does not use it:**
  - the development env `FlowLine/.env` (DB `flowline`);
  - `FlowLine/.env.staging` and the running staging web and worker containers, neither as the current key nor in
    `KEYS_OLD`.
- **Conclusion:** the key is reused only by disposable test databases, so the authorised replacement path applied. Only
  encrypted test fixtures in those DBs depend on it: connections, AI keys, OAuth apps and account tokens.
- **The platform key too:** the design worktree's platform test key had been generated by the helper, so it was replaced
  as well.

### Containment
- **Redaction:** the value is redacted in the working tree.
- **Checkpoints:** the three local checkpoints were rebuilt with identical code trees:
  - `design-v2-20260929-e2e-rerun`: `6c53051` → `17b9160`
  - `…-2`: `741f379` → `0f14e6b`
  - `…-3`: `7f98337` → `09a1fbe`
- **Old objects:** the superseded objects are unreachable and local-only. No gc was run, no refs were expired, and
  nothing was force-pushed.

### Key replacement (`FL-wt-design` test environment only)
- **New keys:** new workspace and platform test keys (32 random bytes each), stored only in the gitignored `.env.test`.
  - Public key ids, which every envelope embeds (`dv2-02/key-ids.json`):
    - workspace `cf55e2d177c9` → `3e896b951ec8`;
    - platform `cda7c911a6b5` → `9f851b7d7d64`.
  - `FLOWLINE_ENCRYPTION_KEYS_OLD` and `FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD` are **empty**, so there's no fallback to
    the exposed keys.
- **New database:** `flowline_test_dv2`, created empty and migrated; `.env.test` points to it.
- **Old database:** `flowline_test_design` is left untouched. It still holds ciphertext under the exposed key, so treat it
  as compromised test data.
- **Rotation does not make previously copied ciphertext confidential again.**

### Verification
- **Crypto:** `dv2-02/crypto-verify.txt`, run through the app's own `src/server/crypto.ts`: **10 / 10 PASS**.
  - New ciphertext uses the new key id, and the new key opens it.
  - The exposed key **cannot** decrypt new ciphertext, in both the workspace and platform rings.
  - No `*_KEYS_OLD` is set, and the DB is `flowline_test_dv2`.
- **Staging:** the staging containers do not hold the exposed key, either as current or fallback.
- **Secret scans:**
  - Working tree: the exposed keys appear nowhere except the gitignored, redacted `helper-logs/`.
  - `pnpm check:evidence`: 0 hits.
  - History: `git log --all -S <value>` for all 10 distinct secret values in every local Flowline env file (dev, all
    test, staging), across all 16 refs (branches, `origin/*`, tags, `refs/checkpoints/*`): **0 commits**.
  - Scan limits:
    - Pickaxe doesn't look inside compressed files.
    - Values under 12 characters and `fake` fixtures are excluded.
    - The exposed design platform key was scanned in the worktree and checkpoints before its temporary backup was
      deleted. It was never committed, because `.env.test` is gitignored.
- **App behaviour on the new key and DB:** proven by the integration suite and the browser gates in the closeout gate.

### Recurrence prevention
- **Helper output:** raw helper CLI output (Kimi, OpenCode, Command Code, Codex stdout) now goes to
  `artifacts/**/helper-logs/`, which is gitignored. The existing raw logs were moved there.
- **Scanner:** `scripts/check-evidence-secrets.mjs` (`pnpm check:evidence`, now part of `pnpm check`). It compares
  `artifacts/` and every staged file against the actual values in the local env files, and fails naming only the file
  and variable. A self-test with a planted real value failed as expected.

### Recommended next step (owner)
- **Rotate the other two test environments the same way:** `FlowLine/.env.test` and `FL-wt-aihub/.env.test`, each with a
  new key and a new test DB. They are test-only, but the value is known to AI providers.
- **Not done here:** those are other checkouts' configurations, outside this closeout.

## DV2-Q01: generated approval and failure messages stay English in Arabic run UI

- **Retest (cp7): FIXED for the requested cases: Arabic approval wait, OpenAI 401 and CONNECTION_AUTH wrapper/suggested fix survive inspection; provider names, codes and raw provider detail remain. Q01a remains outside the full localization claim. See [report](chrome-qa/retest/REPORT.md) and screenshots q01-ar-approval / q01-ar-ai401 / q01-ar-revoked.**

- **Severity:** P2.
- **Classification:** application defect.
- **Tested:** 2026-09-29, headed Google Chrome 153.0.8010.54; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc` (tree `435c3db7af882dce0f3ac24530c02d0ad6b889ec`), HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. In a synthetic workspace, connect the local fake Google Sheets provider. Configure an Append row step with valid string cells and Require human approval; run it.
  2. Switch the UI to Arabic, open Run history and expand the waiting run (reviewer run #10).
  3. Separately, run a fake OpenAI step after the authorized `401`, `times:1` fault and open that failed run in Arabic (reviewer run #4).
  4. Refresh; the same messages remain English.
- **Expected:** Flowline-generated approval and actionable error wording uses the selected Arabic locale. User-entered node names/provider payloads can retain their source text.
- **Actual:** The waiting row says `Waiting for approval to run Append row`. The AI row/error panel says `OpenAI rejected the API key (401). Rotate the key in Settings → AI Providers.` while the surrounding UI and suggested fix are Arabic. These are generated system messages, not the reviewer-entered names. The error's suggested fix is translated, providing a workaround.
- **Sanitized evidence:** [Arabic approval](chrome-qa/screenshots/q01-ar-approval-english-message.png), [Arabic failure](chrome-qa/screenshots/q01-ar-error-english-message.png), [report](chrome-qa/REPORT.md).
- **Provider boundary:** TEST DOUBLES ONLY; no live provider verified.

## DV2-Q02: closing the AI connection dialog loses keyboard return focus

- **Retest (cp7): FIXED: OpenAI Escape, Cancel and Close restore the exact Add connection trigger; Integrations Escape and Cancel restore Connect. See [measurements](chrome-qa/retest/measurements.json), focus.**

- **Severity:** P2.
- **Classification:** application defect.
- **Tested:** 2026-09-29, headed Google Chrome 153.0.8010.54; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc`, HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. As workspace owner, open Settings → AI Providers at desktop width.
  2. Focus the OpenAI Add connection button and press Enter.
  3. Tab within the named Connect OpenAI dialog, then press Escape.
  4. Observe focus after the dialog is gone; press Tab once. Repeat from the same trigger (also reproduced after mouse opening).
- **Expected:** Escape closes the dialog and restores focus to the Add connection trigger, preserving the user's keyboard position.
- **Actual:** Escape closes it, but `document.activeElement` becomes `BODY`, including on a later observation. The next Tab focuses `Skip to content` at the beginning of the document. Tab containment inside the open dialog and the input's visible focus ring work; the failure is return focus.
- **Sanitized evidence:** [Post-dismissal page](chrome-qa/screenshots/q02-dialog-focus-lost.png), [visible focus](chrome-qa/screenshots/dialog-visible-focus.png), [measurements — focusSteps/focusReturn](chrome-qa/measurements.json).
- **Provider boundary:** No provider call needed for reproduction; catalog is the test installation.

## DV2-Q03: English public header overflows at 768px and clips Start free

- **Retest (cp7): FIXED: EN/AR, light/dark at 768, 1024, 1279, 1280 and 1440 have no document overflow and fully visible Start free. See [report](chrome-qa/retest/REPORT.md).**

- **Severity:** P2.
- **Classification:** application defect.
- **Tested:** 2026-09-29, headed Google Chrome 153.0.8010.54; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc`, HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. Open `http://localhost:3100/`, select English and Light at desktop width.
  2. Set the viewport to 768 × 950 and refresh. Reproduced with reduced motion.
  3. Inspect the header and document width. Repeat in Dark.
  4. Compare the adjacent 767px width.
- **Expected:** All header controls fit or collapse into accessible navigation; no document-level horizontal overflow at the required 768px breakpoint.
- **Actual:** `innerWidth=768`, `document.documentElement.scrollWidth=832`; the right header group and Start free link end at approximately x=832.21. The CTA is visibly cut off at the right edge; Sign in wraps. Both Light and Dark reproduce. At 767px the compact header avoids document overflow. The hero's Start building link remains available as a workaround.
- **Sanitized evidence:** [768px screenshot](chrome-qa/screenshots/q03-landing-en-768-overflow.png), [measurements — overflow768/landingMetrics](chrome-qa/measurements.json).
- **Provider boundary:** Public-page layout only; no provider verification.

## DV2-Q04: phone landing removes language and theme controls without a replacement

- **Retest (cp7): FIXED: language and Light/Dark/System controls work at 375 and 360 via touch and keyboard; compact targets are at least 32.5 px. Q04a remains: preferences precede account controls in Tab order despite appearing on the lower row. See [report](chrome-qa/retest/REPORT.md).**

- **Severity:** P2.
- **Classification:** application defect.
- **Tested:** 2026-09-29, headed Google Chrome 153.0.8010.54; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc`, HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. Open the public landing page in Arabic at 375 × 950 (also observed at 360 and in English).
  2. Inspect the header and keyboard-accessible controls; attempt to find the language/theme selectors or a replacement menu.
  3. Widen to desktop and observe the selectors return.
- **Expected:** A phone visitor can choose English/Arabic and Light/Dark/System from the public page, either directly or through a reachable menu.
- **Actual:** The phone header contains only Flowline, Sign in and Start free. There are zero accessible language/theme buttons and no menu button. To change these preferences the visitor must navigate to an authentication page or use a larger viewport.
- **Sanitized evidence:** [Arabic phone landing](chrome-qa/screenshots/q04-mobile-landing-missing-switchers.png), [English phone landing](chrome-qa/screenshots/landing-reduced-en-Light-375.png), [report](chrome-qa/REPORT.md).
- **Provider boundary:** Public-page interaction only; no provider verification.

## DV2-Q05: mobile run inspector overlay is not keyboard-modal and ignores Escape

- **Retest (cp7): PARTIAL: at 375, the named dialog receives and traps focus, Escape closes it and focus returns to the run row (Arabic success and English pending run, including reload). However aria-modal is absent and Chrome accessibility reports modal=false. The original modal-semantics requirement remains unmet. See [report](chrome-qa/retest/REPORT.md) and measurements.modal.pending.ax.**

- **Severity:** P2.
- **Classification:** application defect.
- **Tested:** 2026-09-29, headed Google Chrome 153.0.8010.54; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc`, HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. Open a selected run in Run history at 375 × 950 (`/w/<workspace>/runs?run=<selected-run>`); reviewer used pending run #10. The inspector appears as a bottom sheet over a dimmed background.
  2. Reload with the run selected. Inspect accessible dialog semantics and begin keyboard navigation from the initial focus.
  3. Press Tab eight times and then Escape. Reproduced in the English UI; Arabic overlay was also visually inspected.
- **Expected:** The visually modal inspector has a named dialog role, moves focus into itself, contains keyboard focus while open, and supports Escape dismissal with a sensible return target.
- **Actual:** There are zero `[role=dialog]` and zero `[aria-modal=true]` elements; focus starts on BODY. Tab visits Skip to content, Open menu, background search, All runs, Succeeded, Failed, Running and Needs attention behind the overlay. None of these focus stops is inside the sheet. Escape leaves the sheet visible. Pointer operation/close control is a workaround.
- **Sanitized evidence:** [Background focus under overlay](chrome-qa/screenshots/q05-mobile-inspector-focus-behind-overlay.png), [stable Arabic sheet](chrome-qa/screenshots/mobile-inspector-light-stable.png), [measurements — mobileModal/mobileTabs](chrome-qa/measurements.json).
- **Provider boundary:** The inspected run used a local Sheets TEST DOUBLE; the accessibility defect does not verify a live integration.

- **Final cp12 retest:** FIXED. A-retest verifies the named modal, focus trap after reload and Escape return to the run row; B-resume verifies the 375px focus loop and dismissal again. Chromium full gate 109/109 includes the responsive phone-sheet assertions. See `chrome-qa/final-cp10/REPORT.md`.

## DV2-V01: output nodes retain a square outer border around the rounded card

- **Retest (cp7): FIXED: output wrappers have zero border and no box shadow in EN/AR and light/dark, including selected/skipped Nurture; rounded inner cards remain. See [report](chrome-qa/retest/REPORT.md), nodes screenshots.**

- **Severity:** P3.
- **Classification:** application visual defect — component anatomy / skipped state.
- **Tested:** 2026-09-29, headless real Google Chrome 153.0.8010.54 through Playwright `channel: "chrome"`; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc` (tree `435c3db7af882dce0f3ac24530c02d0ad6b889ec`), HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. Create a synthetic workspace and use the Lead Qualifier template.
  2. Open the builder at 1440px, deselect nodes and inspect Hot lead and Nurture. Compare their perimeter with the trigger/transform/condition cards.
  3. Run the local flow successfully; inspect the skipped Nurture branch. Repeat with light theme and Arabic.
- **Expected / reference:** slide 4's canvas component and slide 8's nodes have a single rounded card perimeter; slide 13's skipped/degraded treatment should retain the intended subdued/dashed card anatomy. The reference specifies 1px borders and 8px node rounding.
- **Actual:** output nodes have a bright square rectangle outside the rounded inner card. Nurture's inner skipped card is dashed/faded, but its outer rectangle remains solid. This is visible without node selection. Browser measurements show `.react-flow__node-output` has `1px solid rgb(187,187,187)` and `border-radius: 0px`, outside the inner rounded 1px card; other sampled node wrappers have zero border.
- **Evidence:** [Dark English canvas](visual-review/screenshots/builder-dark-en-1440.png), [light Arabic canvas](visual-review/screenshots/builder-light-ar-1440.png), [node anatomy](visual-review/node-anatomy.json), [geometry](visual-review/geometry.json), [report](visual-review/REPORT.md).
- **Boundary:** local synthetic nodes only; no live provider required. No product code or baseline changed by the reviewer.

## DV2-V02: Arabic auth illustration has untranslated category subtitles

- **Retest (cp7): FIXED: Arabic sign-up illustration subtitles are Arabic in light and dark (technical JSONATA retained). See [light](chrome-qa/retest/screenshots/signup-ar-light-1440.png) and [dark](chrome-qa/retest/screenshots/signup-ar-dark-1440.png).**

- **Severity:** P3.
- **Classification:** application visual localization defect.
- **Tested:** 2026-09-29, headless real Google Chrome 153.0.8010.54 through Playwright `channel: "chrome"`; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc` (tree `435c3db7af882dce0f3ac24530c02d0ad6b889ec`), HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. Open `/sign-up` at 1440px and select Arabic.
  2. Inspect the three workflow cards in the decorative half of the split screen.
  3. Repeat in dark and light themes.
- **Expected / reference:** slide 6's split auth composition and slide 4's node category anatomy should follow the repository's Arabic-first requirement. Product-supplied category/type wording should use the active locale; technical names such as JSONata may retain their name.
- **Actual:** node titles and surrounding form are Arabic, but the subtitles remain `TRIGGER · MANUAL`, `TRANSFORM · JSONATA`, and `OUTPUT · RESULT`. These are product illustration labels, not user-entered names or provider payloads. The corresponding category concepts elsewhere in the Arabic UI are translated.
- **Evidence:** [Dark Arabic auth](visual-review/screenshots/auth-dark-ar-1440.png), [light Arabic auth](visual-review/screenshots/auth-light-ar-1440.png), [English comparison](visual-review/screenshots/auth-dark-en-1440.png), [report](visual-review/REPORT.md).
- **Boundary:** distinct from DV2-Q01, which concerns generated run/approval messages. No provider or authentication submission is needed to reproduce.

## DV2-V03: English step names reorder numbers and punctuation in Arabic run timelines

- **Retest (cp7): FIXED: 50+ employees? retains order in Arabic timeline and run dock at 1440 and 375; names use BDI with LTR direction and unicode-bidi:isolate. See [report](chrome-qa/retest/REPORT.md), bidi measurements and v03 screenshots.**

- **Severity:** P3.
- **Classification:** application visual RTL/bidirectional-text defect.
- **Tested:** 2026-09-29, headless real Google Chrome 153.0.8010.54 through Playwright `channel: "chrome"`; checkpoint `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc` (tree `435c3db7af882dce0f3ac24530c02d0ad6b889ec`), HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `9GR7x_ACnOcU1IqjUYMCL`.
- **Reproduction:**
  1. In English, create Lead Qualifier from the template and run the local flow.
  2. Switch to Arabic and open the expanded successful run in Run history.
  3. Inspect the condition step named `50+ employees?`; compare the English timeline and canvas label. Also inspect the phone builder's run dock or run history at 375px.
- **Expected / reference:** slides 9 and 14 plus the RTL requirement call for mirrored layout while preserving the reading order of embedded source text. The English user/source step name should retain `50+ employees?` and its punctuation within the Arabic timeline; translating user-authored text is not required.
- **Actual:** the condition card visually moves the question mark to the left and the number/plus segment to the right (`?employees +50` in left-to-right visual order). Browser observation confirms the original text is still `50+ employees?` in a span inheriting `direction: rtl`, with no independent direction isolation. It differs from the same source name's canvas/English presentation.
- **Evidence:** [Arabic desktop timeline](visual-review/screenshots/run-inspector-dark-ar-1440.png), [Arabic phone timeline](visual-review/screenshots/run-inspector-light-ar-375.png), [Arabic phone dock](visual-review/screenshots/builder-dark-ar-375.png), [English timeline](visual-review/screenshots/run-inspector-dark-en-1440.png), [DOM observation](visual-review/bidi-observation.json), [report](visual-review/REPORT.md).
- **Boundary:** local synthetic workflow; separate from Q01's untranslated generated messages and Q05's mobile focus/modal issue. This report concerns visual ordering, not the underlying execution condition.

## DV2-L01: new language/theme switchers had targets below the WCAG 2.5.8 minimum (application defect, P2, FIXED)

- **Retest (cp7): FIXED: landing switchers are at least 32.5 px below 1280 and 26 px at/above 1280; EN/AR sign-in switchers are at least 26 px at all seven checked widths. See [measurements](chrome-qa/retest/measurements.json).**

- **Found:** the first browser run of the DV2-Q03/Q04 header tests (`e2e/landing.spec.ts`), Chromium, on the cp5 build
  `l2g1VUjDTCpyqQDtxHSfx` and then the cp6 build `t6AveJvFD24BqQXdbuNS-`. Logs: `closeout/smoke-cp5.txt`,
  `closeout/smoke-cp6.txt`.
- **Cause:** Flowline's root font size is 13 px (`--text-base`, since Phase 4), so Tailwind rem sizes are 13/16 of
  nominal.
  - The compact buttons (`h-8`) measured **26 px** against the intended 32 px phone target.
  - The labelled/default buttons (`h-7`) measured **22.75 px**. That is below the WCAG 2.5.8 24 px minimum, with only a
    3 px gap between them. It affects the landing page from 1280 px up, and sign-in and onboarding at every width.
- **Fix:** compact `h-10`/`min-w-10` (32.5 px); labelled/default `h-8` (26 px), in `theme-switcher.tsx` and
  `language-switcher.tsx`. The unit test class expectations were updated to match. **The E2E pixel assertions are
  unchanged** (at least 32 px below xl, at least 24 px from xl).
- **Verified:** cp7 (`6587df1`, build `PSEDW6FZGKynViYaur0aY`), `closeout/smoke-cp7.txt`: landing, theme, arabic, journey,
  beta, prehydration and hydration, **39 / 39**.


## DV2-M01: Add node dialog loses return focus after Escape

- **Severity:** P2.
- **Classification:** application accessibility defect; separate component from the fixed AI-connection DV2-Q02.
- **Method:** 2026-09-30, headed installed Google Chrome 154.0.8037.92 via Playwright 1.63.0 fallback. Desktop computer use was unavailable.
- **Snapshot/build:** checkpoint `a4eeabd35da560fd34d679fe3d6e9e349c43806b`, tree `be6dc87eec7effac79471e41fea67628e1ee95d0`, working HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `0182teFiYHLhmljkCbuL5`.
- **Reproduction:** Open a flow at 1440px, activate **+ Add node**, then press Escape. Wait for the named Add node dialog to disappear and inspect keyboard focus; press Tab.
- **Expected:** Focus returns to the Add node launcher.
- **Actual:** Focus is BODY immediately and on a separate later observation. In the final reproduction, the next Tab moved to Zoom out, bypassing the launcher. Reproduced more than once. The catalog also permits Tab to leave it while open; it has no aria-modal, so this separate nonmodal behavior is recorded as context rather than proof of a modal defect.
- **Evidence:** [focus screenshot](chrome-qa/manual-cp8/screenshots/M01-catalog-focus-lost.png), [open catalog with focus outside](chrome-qa/manual-cp8/screenshots/M01-catalog-focus-escape.png), [measurements](chrome-qa/manual-cp8/measurements.json) (m01, catalog).
- **Boundary:** Synthetic local workspace; no live-provider verification. No product changes made.

- **Final cp12 verification:** FIXED; `chrome-qa/final-cp10/session-A-retest-checks.json` and `REPORT.md`. Dedicated `builder-keyboard.spec.ts`: 17/17 each on Chromium, Firefox Linux and WebKit Linux; the Chromium targeted run also passed 3/3 admin tests (under `gate/final-cp10/keyboard/cp12-*`).

## DV2-M02: builder dialogs ignore Escape and do not move focus inside on opening

- **Severity:** P2.
- **Classification:** application accessibility defect.
- **Method:** 2026-09-30, headed installed Google Chrome 154.0.8037.92 via Playwright 1.63.0 fallback. Desktop computer use was unavailable.
- **Snapshot/build:** checkpoint `a4eeabd35da560fd34d679fe3d6e9e349c43806b`, tree `be6dc87eec7effac79471e41fea67628e1ee95d0`, working HEAD `fb563e517263800062adf5d5a31af672ebcc4da3`, BUILD_ID `0182teFiYHLhmljkCbuL5`.
- **Reproduction:** (1) Open Copilot from the builder toolbar; press Tab, then Escape. Click inside its request field and press Escape again. (2) Open History; press Tab and Escape. Repeat Escape with its Close history button focused. (3) Open the Flow issues dialog on an invalid flow and press Escape.
- **Expected:** The named dialogs support keyboard dismissal and a predictable dialog focus lifecycle; opening Copilot/History should place focus inside and closing should return it to the launcher.
- **Actual:** Copilot remains visible after Escape, including from its textarea and after a seven-second wait. Opening it leaves focus on the toolbar: Tab first reaches Runs and Run before Close Copilot. History also remains open with Escape, even when Close history is focused; the first Tab after opening reaches the background Copilot button. Flow issues also remains visible after Escape. Pointer close controls work for Copilot/History. These are nonmodal panels in the current DOM; the confirmed failure is Escape/focus handling, not a claim that every side panel must become visually modal.
- **Evidence:** [Copilot](chrome-qa/manual-cp8/screenshots/M02-copilot-escape.png), [History](chrome-qa/manual-cp8/screenshots/M02-history-escape.png), [Flow issues](chrome-qa/manual-cp8/screenshots/M02-flow-issues-escape.png), [measurements](chrome-qa/manual-cp8/measurements.json) (m02, copilotKeyboard, issuesKeyboard).
- **Boundary:** Synthetic local workflow. No product code, tests, configuration or baseline changed.


- **Final cp12 verification:** FIXED; `chrome-qa/final-cp10/session-A-retest-checks.json` and `REPORT.md`. Dedicated `builder-keyboard.spec.ts`: 17/17 each on Chromium, Firefox Linux and WebKit Linux; the Chromium targeted run also passed 3/3 admin tests (under `gate/final-cp10/keyboard/cp12-*`).
- Copilot remains mounted while hidden: request, proposal, diff and confirm-removals state survive Escape/X with POST count unchanged. Nested controls consume Escape first; open-transition focus does not rerun on refetch; panels remain non-modal and return focus. These checks used real keyboard input.

## DV2-F01: self-revocation leaves an active-admin panel visible

- **Severity:** P2; **class:** application UI state defect (server authorization remains enforced).
- **Method:** Agent-driven Google Chrome exploratory QA via Playwright; headed Chrome 154.0.8037.92.
- **Snapshot:** cp11 `414bc233acf0199fe00970b063250d76e003716f`; BUILD_ID `NpdBngps_Zs54BKU3Ft34`.
- **Repro:** Complete a disposable admin grant and real TOTP flow, unlock changes, then revoke your own admin access and accept the confirmation.
- **Expected:** The privileged panel disappears immediately and the server's ordinary 404 is shown.
- **Actual:** `/api/platform/me` returns 404, but the cached panel still displays the account as active with Revoke admin available. Reload correctly returns 404.
- **Evidence:** `chrome-qa/final-cp10/screenshots/A-self-revoke-stale-ui.png`; session A checks 29-32 in the private interactive control record, sanitized checks in `session-A-checks.json`.
- **Fix:** A successful self-revocation performs a document navigation to `/admin`, dropping cached admin UI. Other-admin revocation still refetches the list. Added a browser regression assertion for the real 404 navigation and denied API access.
- **Retest:** FIXED on cp12 `596c470`, BUILD_ID `yAaFht8nBZMW5zrQ4OQjI`. A-retest checks verify 404 navigation, disappearance of the cached panel, and API denial. The synthetic credential was revoked and cleared; the disposable admin was revoked and signed out. See `chrome-qa/final-cp10/REPORT.md` and `screenshots/A-retest-self-revoke-now-404.png`. No production or live-provider action.

## Closeout evidence scope (cp12)

## Journey 9 findings (2026-09-30)

Found on local commit `776337cec8ed5ee823017f40020459e28cf0467a`, execution inputs equal cp12. Method: Agent-driven Google Chrome exploratory QA via Playwright, real headed installed Chrome and isolated temporary profiles. Session/build identity and individual checks: `chrome-qa/final-keyboard/session-a2/identity.json`, `checks.json`; admin: `session-b/identity.json`, `qa.checks.json`. Test doubles only.

- **DV2-K01 (P2, application accessibility):** at 375px, keyboard-activate Open menu. Initial focus remains behind the sheet, Tab reaches the page/body, and Escape does nothing. Expected a named modal navigation drawer with contained focus and return to Open menu. Fix: reuse the shared modal Drawer, retaining logical start placement.
- **DV2-K02 (P2, application accessibility):** keyboard-select a canvas node; focus stays on the node. Focus its name input and press Escape: focus becomes BODY and the drawer remains. Expected initial focus inside, non-modal traversal, Escape dismissal and return to the node. Fix: shared side-panel lifecycle, heading initial focus, node/Add-node fallback. Successful catalog insertion retains the existing M01 focus return to Add node.
- **DV2-K03 (P2, application accessibility):** open OAuth Remove/Switch or admin credential Revoke/Clear using Enter. Focus stays on the launcher; Escape from the confirmation does nothing. Expected non-modal inline confirmation with initial Cancel focus and Escape/return. Fix: shared InlineConfirmation using the existing side-panel lifecycle; pending secrets clear on OAuth cancel.
- **DV2-K04 (P2, application accessibility):** open Runs dock or desktop run detail. Dock leaves focus on its launcher; Escape in either panel fails to dismiss. Expected non-modal panel initial focus, dismissal and return. Fix: shared lifecycle for dock/desktop inspector; phone primary dock remains persistent, and the phone modal sheet retains its existing behavior.

Retested on cp16 `d4da9ca354b1d3da8234c7c339b65c389dcf5d94`: final headed Chrome sessions E/F record 207 passing checks and one invalid launcher attempt, corrected and passed. Initial observations are retained even when later identified as harness timing (nested tooltips, changing Publish label) rather than application defects. Individual results: `chrome-qa/final-keyboard/SURFACES.md`; scope/fixtures: `REPORT.md`; cumulative browser/non-browser gate: `gate/final-keyboard/GATE.md`.

**DV2-K05 (P2, application accessibility):** on cp14 `d2da538`, create a synthetic knowledge source or test API key and keyboard-activate Delete/Revoke. The focused launcher is replaced by a fragment/span; focus becomes BODY and Escape cannot cancel. Source inspection identified the same member-removal pattern. Evidence: `chrome-qa/final-keyboard/session-d/checks.json` (`knowledge:inline-delete`, `keys:inline-revoke`). The shared confirmation now keeps its launcher mounted, initially focuses Keep/Cancel, supports Escape, and returns focus. Successful deletion/revocation focuses a surviving page control; API-key reveal dismissal also returns to Create key. Integration removal gains the same explicit cancellation. Webhook rotation's armed state resets when its containing dialog closes.

Admin access revocation now uses the same named in-app confirmation with unchanged server MFA/CSRF enforcement and self-revocation navigation. This replaces browser-native `window.confirm`, whose keyboard channel blocked the cp14 Playwright controller. That historical native check was not a PASS: the isolated QA browser was stopped, the stack stopped, and the disposable admin was revoked through the authenticated cleanup API (session D). No native-keyboard success is claimed for cp14. The replacement passed on cp16: session F checks cancel/return and keyboard confirm, ordinary 404 navigation and API denial; the existing automated assertions are preserved. Successful credential and OAuth removals also move focus to surviving fields. Targeted Chromium: 25/25.

### Retained cp12 scope

**DV2-K07 (P2, cross-engine keyboard defect):** cp18 WebKit completed 47/50; successful connection removal did not focus the surviving Connect button. Chromium 114/114 and Firefox 50/50 do not override this failure. Evidence: `gate/final-keyboard/webkit-cp18-failed/results.txt`. Fix: connection removal focuses its surviving Connect button before query invalidation. The focused cp19 retest passed this case. The separate node-opening failure was localized by an added focus assertion: `focus()` ran while React Flow still hid the node pending measurement (`visibility: hasDimensions ? visible : hidden`), before Enter. The test now asserts visibility before focusing, then asserts focus before Enter; the attempted custom activation override was removed in cp20. No app node activation defect is claimed from that harness failure. A third WebKit failure was an agent source checkbox click not taking effect while asynchronously discovered model content could expand above it; the unchanged app form uses normal controlled checkboxes. The phase3 test adds an explicit discovered-model visibility assertion before checking the source; its selection and downstream agent/approval assertions remain intact. This readiness-race diagnosis is an inference, not a claimed independently reproduced product defect; the cp19 targeted checkbox case passed.

**DV2-K06 (P2, closeout regression):** the cp16 cumulative gate found that K02's initial focus also stole focus from mouse-selected canvas nodes, breaking the existing exact nudge regression. Escape from a drawer field also cleared selection, so subsequent arrow/duplicate shortcuts had no selected node. Evidence: `gate/final-keyboard/chromium/results.txt`, two `canvas.spec.ts` failures. Fix: keyboard node activation focuses the panel, pointer selection retains canvas focus; dismissing the drawer hides it while preserving selection and returns to the node. Existing canvas assertions are unchanged. The same gate's five provider-fixture failures came from the new removal test revoking shared `test-token`; the test now issues a dedicated fake token, preserving downstream test isolation. cp17 was superseded before browser tests after lint rejected reading a ref during render; cp18 uses state.

See `chrome-qa/final-cp10/REPORT.md`: nine journeys PASS; the exhaustive every-dialog sweep in journey 9 is NOT RUN, while targeted keyboard checks pass. This is a coverage limitation, not a new product finding. The original immediate reduced-motion sample is retained and resolved by a settled-media recheck; no product fix was needed.

Final automated gate on cp12: Chromium 109/109, Firefox Linux 45/45, WebKit Linux 45/45, unit 388/388, contract 465/465 and integration 460/460. Lint/typecheck/evidence scan pass. DV2-01 OAuth repair and L01 header sizing are included in the passing final Chromium run. No open P0/P1 finding is recorded.

## Current cp25 candidate review (supersedes historical R04 assumptions)

cp24 Firefox retained one failed connection-removal focus check. The ready-catalogue test now explicitly waits for its intended Connect target; a separate held-catalogue regression checks the stable search-field fallback and no focus stealing when the catalogue later arrives. Product restoration handles lost/body focus and scopes an existing confirmation to its own card. The catalogue timing diagnosis is inferred; passing latest-browser coverage is still required.

Astra read-only review found R04's historical multi-action agent-node reachability unproven and no authorization bypass: decisions bind the exact approval ID/action/arguments. A reachable display issue existed: reviewer-authored agent rejection notes could match generated-message translation regexes. Notes now retain their exact text, escaped by React; ambiguous approval-action lookup returns null instead of attributing a different action. EN/AR message regressions passed.

R01 pointer-cancel stale tooltip state and R02 keyboard-unreachable disabled-tab explanations are repaired in the candidate, with an inspector keyboard regression pending full browser gate. R03 generic disappearing-opener modal fallback remains an observation without a demonstrated current affected caller; specific destructive-action fallbacks remain covered. No security/core issue is silently waived.

New scenario review found and corrected duplicate attendee check-in/name conflation, negative/missing quote line acceptance and malformed registration dates. Planner strictly preserves due-date/priority order; its EN/AR description and test now state that all tasks after first overflow wait. Focused current unit slice145/145 PASS; full candidate gate still pending.

## DV2-G01 — unexplained WebKit navigation timeout (OPEN)

cp28 cumulative WebKit 58/59: canvas.spec.ts:7 timed out waiting for load before canvas assertions. No sensitive trace was captured. Focused unchanged-assertion diagnostic passed 1/1 (navigation 843ms), but cause remains unproven. Preserve both attempts; a passing rerun does not close reliability. Evidence: ../beta-execution/20260930-landing-executor/cp28-webkit/report.sanitized.json and cp28diag-webkit/report.sanitized.json. No product defect is inferred solely from this timeout.
