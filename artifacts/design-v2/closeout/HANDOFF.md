> Historical cp12 local closeout, preserved. Current cp28 source/gates, DV2-02 other-environment remediation and owner-authorised main consolidation are recorded in docs/implementation/MAIN_CONSOLIDATION.md and BETA_EXECUTION_STATUS.md. This historical record is not current runtime or release acceptance.

# design-v2 local handoff

Local commit: **`776337cec8ed5ee823017f40020459e28cf0467a`** on `design-v2` (parent `fb563e517263800062adf5d5a31af672ebcc4da3`). One authorized local commit was created. No product code changed during the resumed closeout; every execution-input object below equals the gated checkpoint.

Tested checkpoint: `596c47066c07c2ce88df4b0eea928280de5a8063`, tree `8b5e51ac2df2a26a101b11db261b6c5b5abca819`. The evidence directory retains the historical name `final-cp10`; its final gate explicitly identifies cp12.

This file is intentionally written **after** the single local commit, per Step 8, and remains an uncommitted handoff record. It is not a second commit or an amendment.

## Gates

| Browser | Final result | Keyboard cases included | Tested BUILD_ID |
|---|---|---|---|
| Chromium Windows | 109/109 | 17/17 | `ECragj5lgsZXUvKlFTdjd` |
| Firefox Linux Docker | 45/45 | 17/17 | `Q_hQ8OJzHXu9LXAHraaQn` |
| Webkit Linux Docker | 45/45 | 17/17 | `9wh8O7Hg4FXxpojrPWgOF` |

Browser runners were strictly sequential, one worker each. No failed, skipped or flaky cases. Firefox uses the documented native-Windows-launch workaround; WebKit uses the existing official Linux Playwright wrapper. These are Linux engine results, not Safari or Windows Firefox results.

With the test stack stopped: lint PASS, typecheck PASS, unit **388/388**, contract **465/465**, integration **460/460**. Final staged evidence scan: **five local secret values, 1,011 text files, zero hits**; added-diff key-pattern scan: zero hits. Excluded paths and compressed traces were not staged. Text scanning does not inspect pixels or compressed content.

The initial Chromium command rejected an unsupported CLI flag before tests began; its launch record is retained. The corrected complete test run passed on the unchanged candidate. Every supervised browser stack stopped with ports 3100/4010/4011 free, and the memory sampler was stopped.

## Focus, admin and exploratory QA

Method: **Agent-driven Google Chrome exploratory QA via Playwright**, headed installed Chrome **154.0.8037.92**, isolated ignored temporary profile. Not desktop computer use and not human UAT. All integrations in this closeout are **test doubles only**, not production/live verification.

- M01: Add node Escape returns focus to its launcher.
- M02: request/proposal/diff/removal-confirmation survive Escape and X without a second POST; nested Escape is consumed first; refetch does not steal focus; panels remain non-modal, with focus return. All 17 keyboard cases passed in each final browser project.
- Q05: named modal phone sheet, focus loop, Escape and return to the run row passed in A-retest; phone focus/dismissal rechecked in B-resume.
- Admin: real disposable setup/TOTP/sign-in/step-up path; invalid/reused codes rejected; no privileged write before MFA/elevation; write-only credential saved and cleared; ordinary Owner and unauthenticated access denied; logout/deep links denied. F01 self-revocation now removes the cached panel and shows the ordinary 404; API denial corroborates it. Disposable admin revoked and signed out.
- A-retest (admin **plus** keyboard/phone checks): **36/36**, BUILD_ID `yAaFht8nBZMW5zrQ4OQjI`. Earlier targeted Chromium total 20/20 comprises 3 admin + 17 keyboard cases.
- B: BUILD_ID `1GurTLLKP3Usf2wTONYPC`, 37 passing checks plus the preserved immediate reduced-motion sampling failure. B-resume: **26/26**, BUILD_ID `Xf-tbSQn87aEzookH9ce9`; waiting for the media-query update gives zero running animations. The original observation is retained, not erased.
- Resume attempts preserved a shell-quoting launch error and a stale isolated-profile process. Only the test-owned Chrome/driver was stopped before the successful supervised session. Final synthetic users were signed out and the resumed AI connection disconnected.

## Ten-journey reconciliation

| # | Journey | Result | Current-candidate evidence and limits |
|---|---|---|---|
| 1 | Landing | PASS | B: EN/AR, light/dark, 1440/375, no horizontal overflow and scroll; B-resume reduced-motion check. |
| 2 | Accounts | PASS | A-retest/B English signup, verification, sign-in and onboarding; B-resume Arabic real verification endpoint, template onboarding/dashboard, sign-in/out in both languages. Outbox links stayed private. |
| 3 | Hand-built workflow | PASS | B: three dragged nodes, connected handles, JSONata saved/reloaded, worker output, inspector tabs and disabled successful-step Error reason. B-resume exercises failed-step Error content. |
| 4 | Failure paths | PASS | B invalid flow; B-resume AI 401 and Arabic repair guidance, approval pauses then posts exactly once, revoked Sheets connection repaired through OAuth without starting another run. |
| 5 | Team | PASS | B: Editor/Viewer invitations accepted through UI, editing boundary, Arabic Viewer Run reason, removal and subsequent route/API 404. |
| 6 | AI Providers | PASS | B invalid key/connect/discovery/default; B-resume UI step model selection and worker run, key replacement, test connection, second-workspace isolation and disconnect. |
| 7 | Copilot | PASS | B proposal/diff, invalid proposal refused, reject, approve as unpublished draft, no automatic run; unknown-cost cap refused the request until explicit test-double opt-in. |
| 8 | Settings and admin | PASS | B all nine settings sections visited (read-only except Members/AI); A-retest real setup/MFA/replay rejection, step-up, write-only credential, logout/deep links, Owner denial, self-revocation fix. |
| 9 | Keyboard accessibility | NOT RUN (exhaustive scope) | Targeted checks PASS: A-retest M01/M02/Q05; B-resume Tab through five main screens, AI modal focus loop/Escape/return, phone modal loop/Escape and reduced motion. The brief's literal **every dialog** sweep was not exhaustively performed; these targeted checks are not an all-dialog accessibility audit. |
| 10 | Phone width | PASS | B-resume 375px monitor-only builder with explanation and no Add node; modal run sheet focus loop and Escape. Q05 focus-return evidence also in A-retest. |

**Coverage limit:** nine journeys PASS; the literal exhaustive every-dialog sweep is NOT RUN. Targeted M01/M02/Q05, representative modal focus, main-screen keyboard traversal and reduced motion pass. No cp8 result is counted as cp12. Fixture API setup and corroborating API assertions are identified separately in the Chrome report; browser console/network capture was not retroactively reconstructed.

## Open items and owner decisions

| Severity | Item | Status |
|---|---|---|
| P0/P1 | Recorded application findings | None open |
| P2 | DV2-02 other test environments | OPEN for owner: `FlowLine/.env.test` and `FL-wt-aihub/.env.test` still share the previously exposed test key according to the retained remediation record. They were not read or rotated here. |
| P3 | Q01a | Some provider/engine payloads and rare AI error codes remain raw text. |
| P3 | Q04a | Landing preferences/account focus order differs from visual order below 1024px. |
| P3 | R01 | Tooltip tap-toggle can retain a stale pressed state after dragging off. |
| P3 | R02 | Disabled-tab reason is not reachable by arrow-key focus. |
| P3 | R03 | Focus fallback is body when a dialog opener is removed; no current caller identified. |
| P3 | R04 | Display association when one agent node has several pending approvals; reviewer text passes through display translation regexes. |
| P3 observations | Theme | Amber/orange similarity in light theme; System light canvas dots until hydration. |
| Coverage | Keyboard journey 9 | Exhaustive every-dialog sweep NOT RUN; targeted checks PASS. |
| Owner decisions | U1/U2/U3 | Landing composition; template/integration density; settings structure. |

DV2-02 **design-worktree remediation is verified, not closed by redaction alone**: replacement workspace/platform test keys and isolated DB, retained `crypto-verify.txt` **10/10**, `db-envelope-scan.txt` **zero envelopes under old key IDs**, prior clean history-scan record in BUGS.md, current evidence scans clean, ignored raw helper logs and evidence-scanner recurrence controls. Historical crypto/DB/history results are retained evidence, not falsely described as freshly rerun in this resume. The old test DB remains untouched. Other-env follow-up remains OPEN.

## Execution-input mapping: local commit equals gated checkpoint

| Input | Object hash in both local commit and cp12 | Result |
|---|---|---|
| `src` | `f00b9da7c4910db21b8f5b7db7f4c87582a2e058` | MATCH |
| `e2e` | `7fead113debd1d6291912b0d01794a7a4245fb54` | MATCH |
| `tests` | `2bef14b138e56d84208371ba3fd3c2e029e165a7` | MATCH |
| `scripts` | `2decff1e9a9fbd5c08fd498609316406beef295f` | MATCH |
| `worker` | `fb714bff64286626764b438d81a17383f2c84c20` | MATCH |
| `drizzle` | `8d3601b853a3cc4e9a2a17e8c82728d7934fffb2` | MATCH |
| `package.json` | `805755d8f760fcc06eda6e5094840b42bb7af7db` | MATCH |
| `pnpm-lock.yaml` | `896d82a11f49c15c9333be7432c84603e132a798` | MATCH |
| `playwright.config.ts` | `971cb58d4b5ce8856295e8826126380c584eec09` | MATCH |
| `next.config.ts` | `035378d9718204d37b1c9784c875da20c6b444ae` | MATCH |

All ten hashes were compared after the commit. The full commit tree differs from cp12 because it includes finalized records and excludes the explicitly prohibited transient files; this does not alter the tested execution inputs.

## Evidence and proposed owner actions

- Final automated gate: `../gate/final-cp10/GATE.md`, browser `final-*/results.txt` and `stack-session.txt`, `non-browser/`, `resume-identity.json`, `checkpoint-12.json`, staged scans and memory samples.
- Exploratory reconciliation: `../chrome-qa/final-cp10/REPORT.md`, sanitized `session-*-checks.json`, identity/end records and screenshots.
- Findings/design notes: `../BUGS.md`, `../NOTES.md`; key remediation: `../dv2-02/`.
- Review/staging: `PRECOMMIT-REVIEW.md`, `FINAL-REVIEW.md`; raw helper/control/auth files remain ignored and excluded.
- Proposed push, **owner decision only**: `design-v2 → origin/design-v2`.
- Cleanup candidates, **owner decision only**: `FL-wt-aihub` (pushed and clean in the supplied inventory; this resume rechecked its clean working tree and HEAD equality with the cached `origin/ai-hub` ref, without a network refresh); `FL-wt-aib` (unregistered, 163 MB per supplied inventory). Neither was removed.
- Expected uncommitted files after the one local commit: this HANDOFF.md and the deliberately excluded transient notes/scratch/landing images/current-run/STOP markers. This is not a clean-worktree claim.

PUSHED: NO

MERGED: NO

WORKTREES REMOVED: NO

PRODUCTION APPROVED: NO
