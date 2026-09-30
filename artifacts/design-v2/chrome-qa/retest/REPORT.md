# Independent Chrome retest — checkpoint 7

**Result: PARTIAL — 8 of the 9 requested findings FIXED; DV2-Q05 PARTIAL.** No new defect was reproduced, so no DV2-Q06+ entry was created. Q05's remaining modal semantics are part of the original finding, not a new duplicate.

This is independent, agent-driven exploratory QA in **headed real Google Chrome**, not human UAT or the automated suite. All provider checks used **TEST DOUBLES ONLY**, with no live-provider verification or paid calls.

## Environment and identity

| Item | Before | After |
|---|---|---|
| Checkpoint ref | refs/checkpoints/design-v2-closeout-7 | unchanged |
| Checkpoint SHA | 6587df1f55aca068cfc7524a61076f8efc9e7d16 | unchanged |
| Checkpoint tree | a5810de2963a45245f8e1522e42447d0cb243940 | unchanged |
| git rev-parse HEAD | fb563e517263800062adf5d5a31af672ebcc4da3 | unchanged |
| .next-test/BUILD_ID | PSEDW6FZGKynViYaur0aY | unchanged |
| Health /api/health?require=worker | revision dev; schema 20; DB ok; worker ok | same healthy state |

- Session: 2026-09-29T20:40:12.696Z through 2026-09-29T20:48:02.999Z (UTC), 2026-09-29 / Africa-Cairo UTC+3.
- Target: http://localhost:3100, existing production build of the test installation.
- Browser: Google Chrome **153.0.8010.54**, confirmed through CDP Browser.getVersion and executable ProductVersion.
- Launch: Playwright channel **chrome**, explicit executable **C:/Program Files/Google/Chrome/Application/chrome.exe**, **headless:false**; one fresh persistent session only.
- Profile: **.profile/cp7-1790714412347/** in this retest directory. Chrome closed; deletion blocked (see cleanup).
- Viewports: height 950; widths 360, 375, 768, 1024, 1279, 1280 and 1440. Touch enabled; no physical phone.
- Tools: persistent Node REPL with installed Playwright, real clicks/typing/dragging/keyboard, DOM and Chrome accessibility measurements, screenshots, read-only git/file inspection. API calls limited to health/outbox and the prescribed fake fault controls.
- The tracked product/config content matched cp7. Thirteen files shown by Git as absent from the index but present in the worktree were compared by blob hash and all matched cp7. The reviewer changed no product code, tests, configuration, references or baselines, did not commit, and did not start/stop any server or container.
- Fresh synthetic reviewer account was created through sign-up, verified through the local test outbox, then signed in through the UI. Password, verification token, fake key and cookies were not printed or written to evidence. No .env files were opened, loaded or scanned.

## Finding verdicts

| Finding | Verdict | Observed evidence |
|---|---|---|
| DV2-Q01 | **FIXED** (requested cases) | Recreated Append row with valid string cells and human approval. Run #2 Arabic row says “بانتظار الموافقة لتشغيل إضافة صف”. Run #3 after one fake 401 displays Arabic rejection/action wording, OpenAI, 401 and AI_AUTH_FAILED. Refresh retained the translation. Additional CONNECTION_AUTH case in run #5 has Arabic wrapper and suggested fix, preserving Google Sheets and its raw English provider detail. [Approval](screenshots/q01-ar-approval.png), [401](screenshots/q01-ar-ai401.png), [revoked](screenshots/q01-ar-revoked.png). |
| DV2-Q02 | **FIXED** | Focused OpenAI Add connection and pressed Enter, Tab, Escape: exact trigger regained focus. Pointer-open followed by Cancel or Close did the same. Google Sheets Connect also restored focus after Escape and Cancel. [Escape return](screenshots/q02-ai-escape-return.png); measurements.focus records element identity checks. |
| DV2-Q03 | **FIXED** | Anonymous EN/AR landing, light/dark, refreshed at 768/1024/1279/1280/1440: all 20 combinations fit. Document scrollWidth was viewport minus the 10 px scrollbar; all Start free rectangles remained inside the viewport. At EN 768 its right edge is 731.6, not the old 832.2. [EN 768](screenshots/landing-en-light-768.png), [AR 768](screenshots/landing-ar-dark-768.png); all combinations saved as landing screenshots. |
| DV2-Q04 | **FIXED** | 375 and 360: language and light/dark switch through touch and keyboard activation, with settled locale/theme checked. System follows OS appearance (light background rgb(244,244,245), dark rgb(9,9,11)). Tab reaches all five preferences. Targets are at least 32.5 px. [375](screenshots/mobile-ar-light-settled-375.png), [360](screenshots/mobile-en-dark-settled-360.png). |
| DV2-Q05 | **PARTIAL** | Named dialog; focus enters Close after reload; 18 Arabic-success and 16 English-pending Tab presses stay inside and wrap; Escape closes and returns to the relevant run row. **Remaining failure:** no aria-modal attribute; Chrome Accessibility.getFullAXTree reports modal=false for “CP7 Approval · run #2”. [Pending sheet](screenshots/q05-en-pending-modal.png), [Arabic focus](screenshots/q05-ar-phone-modal-focus.png), [closed](screenshots/q05-ar-phone-closed.png); measurements.modal.pending.ax. |
| DV2-V01 | **FIXED** | Created Lead Qualifier in English and ran it. Hot lead and skipped Nurture have zero outer wrapper border and no wrapper box shadow, unselected and selected/skipped, in EN/AR × light/dark. Inner rounded cards and skipped treatment remain. [Selected Arabic dark](screenshots/nodes-ar-dark-selected.png), [English light](screenshots/nodes-en-light-unselected.png); measurements.nodes covers all eight samples. |
| DV2-V02 | **FIXED** | Arabic sign-up illustration shows مُشغِّل · يدوي, تحويل · JSONATA and مُخرَج · النتيجة in dark and light. [Light](screenshots/signup-ar-light-1440.png), [dark](screenshots/signup-ar-dark-1440.png). |
| DV2-V03 | **FIXED** | Original English template name “50+ employees?” retains its number, plus and question-mark order in Arabic timelines and run docks on desktop and 375. BDI elements measure direction:ltr and unicode-bidi:isolate. [Desktop timeline](screenshots/v03-timeline-ar-desktop.png), [phone timeline](screenshots/v03-timeline-ar-phone.png), [desktop dock](screenshots/v03-dock-ar-desktop.png), [phone dock](screenshots/v03-dock-ar-phone.png). |
| DV2-L01 | **FIXED** | Landing preference controls: minimum dimension 32.5 px below 1280, 26 px from 1280; sign-in EN/AR minimum 26 px at all seven widths. This meets the brief's 32/24 px thresholds. [Sign-in](screenshots/signin-en-1440.png); measurements.landing, mobileSettled and signinTargets. |

## Remaining observations and scope of verdicts

- **Q05 reproduction of remaining failure:** open a selected run at 375 × 950, refresh, inspect the named role=dialog. It has no aria-modal=true; Chrome exposes modal=false. Expected a named **modal** dialog, actual named non-modal accessibility semantics despite keyboard containment/background hiding. No screen-reader impact claim beyond that measured semantic mismatch. Keep the original P2 finding open until this is resolved.
- **Q01a remains open/partial coverage:** raw Google Sheets provider text and AI metadata keys remain English. The requested generated wrapper and 401 code are fixed; this is not certification of every engine/provider payload or rare AI code.
- **Q04a remains observed:** below 1024, preference controls are on the lower header row, but keyboard order traverses them before Sign in / Start free on the upper row. This was already in BUGS.md and is not a new defect.
- DV2-01 (automated OAuth test synchronization) and DV2-02 (secret containment/rotation) were outside the retest brief. Their added verdict lines explicitly say BLOCKED/outside scope; neither is counted among the nine requested retests.
- No newly reproduced application defect; **DV2-Q06+ not allocated**. No claim that untested areas are defect-free.

## Regression glance and diagnostics

Sign-up, verification, sign-in and sign-out worked. The dashboard, builder run, AI Providers settings and Arabic RTL shell were visually inspected. Local template run #1 succeeded with the untaken Nurture branch skipped. Approval run #2 completed after approval. Screenshots include [dashboard](screenshots/dashboard-ar-empty.png), [builder](screenshots/builder-en-light-run.png), [AI settings](screenshots/ai-settings-test-double.png) and [Arabic shell](screenshots/v03-timeline-ar-desktop.png).

[Console/network inventory](browser-inventory.json): **0 page errors, 0 warnings, 0 observed browser response statuses >=400**, but **one console-only resource 404**, with no captured URL/associated response. Attribution remains unresolved; the original cp4 report also recorded an unattributed 404. Therefore the literal “no new console errors” criterion is not proven, and this is not reported as an entirely clean console. No hydration error was captured. Injected server-side provider failures were observed in the run UI and do not appear as browser 401 responses.

Reviewer tooling notes: an ESM import of @playwright/test failed before launch; loading the installed package through createRequire worked. Some early locators looked for a different label or sampled before asynchronous navigation settled; the subsequent state was re-observed. System deliberately retains data-theme=system, so OS preference was verified through rendered colors and color-scheme. No product fix was made to accommodate these tool expectations.

## Fake controls and test data

- AI fake: **127.0.0.1:4011**. Injected 401/times:1, yielding run #3 failure. Injected 429/times:1, which recovered within the provider call and run #4 succeeded; no terminal 429 error translation is claimed. [Recovered run](screenshots/ai429-single-fault-recovered.png).
- SaaS/OAuth fake: **127.0.0.1:4010**. Revoked account a once for the alternative CONNECTION_AUTH spot-check. Reconnected through the local fake OAuth UI; [reconnected state](screenshots/fake-sheets-reconnected.png). No pending approval or deliberately unconsumed fault was left.
- One fresh synthetic @flowline-qa.test account, workspace cp7, three flows and five runs remain as test data. The AI connection uses a generated fake key, default fake-gpt-mini and unknown-price allowance in this synthetic workspace only. No paid-test button was used.

## Not covered

No live SaaS/OAuth/AI, paid inference, billing, deployment, automated suite, Firefox/WebKit, physical phone, screen reader, full prior exploratory suite, admin/security/key-rotation audit, or exhaustive cross-product beyond the combinations listed. Reduced motion was used for repeatable public-page checks and evidence; a new full motion audit was not performed. No terminal 429 rendering test, all rare error codes, or all dialog variants. Screenshot evidence contains viewport content, not native Chrome window chrome; browser identity and headed mode are independently recorded.

## Cleanup — BLOCKED

The sole reviewer Chrome session is closed. Automatic approval review rejected deletion of the reviewer profile with **“blocked by policy”**. No alternate deletion tool or bypass was attempted.

**Lead cleanup required:** remove only **artifacts/design-v2/chrome-qa/retest/.profile/cp7-1790714412347/**. It may contain session data and is **not sanitized evidence: do not commit, archive or share it**. The brief's profile deletion requirement remains unfulfilled.

Evidence: [measurements.json](measurements.json), [browser-inventory.json](browser-inventory.json), 57 screenshots in [screenshots/](screenshots/). No raw credentials, cookies, outbox links, trace or HAR were written to these report artifacts.
