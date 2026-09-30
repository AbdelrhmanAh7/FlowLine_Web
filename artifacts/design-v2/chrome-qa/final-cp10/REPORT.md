# Final candidate Chrome exploratory reconciliation

Agent-driven Google Chrome exploratory QA via Playwright. Headed Google Chrome 154.0.8037.92, Playwright 1.63.0 interactive commands, isolated gitignored `.profile`; not computer use or human UAT. Only local synthetic records and test doubles; no live-provider verification.

Candidate: `596c47066c07c2ce88df4b0eea928280de5a8063` (checkpoint 12), tree `8b5e51ac2df2a26a101b11db261b6c5b5abca819`. Execution-input equality was rehashed with a temporary index: `../../gate/final-cp10/resume-identity.json`. No product changes during this resumed exploration.

## Sessions and identity

- A-retest: `session-A-retest-identity.json`, 36/36 checks including the admin journey, M01/M02 and Q05. See its stack session for BUILD_ID.
- B: `session-B-identity.json`, BUILD_ID `1GurTLLKP3Usf2wTONYPC`, 37 PASS plus one premature reduced-motion observation marked FAIL, preserved unchanged.
- B-resume: BUILD_ID `Xf-tbSQn87aEzookH9ce9`, 26/26 checks, 2026-09-30 09:18:12–09:27:02 UTC. `session-B-resume/attempt3/stack-session.txt` proves readiness, exit 0 and all three test ports freed.
- The first resume attempt exited before opening the browser due to shell argument quoting. The second found the previous run's isolated Chrome profile still in use. Its test-only Chrome tree and stale driver were stopped; the owner's browser was not used. Both attempts remain recorded. The successful session stayed below 25 minutes.

## Ten journeys on checkpoint 12

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

No cp8 result is counted as cp12 evidence. The reconciliation is 9 journey PASS, 1 NOT RUN for exhaustive coverage; targeted keyboard acceptance checks passed.

## Findings and interpretation

- DV2-F01: cp11 cached admin panel after self-revocation fixed on cp12; A-retest verifies ordinary 404, removed cached panel and API denial. Disposable admin revoked/signed out and credential cleared.
- M01/M02 and Q05: all targeted acceptance points passed in A-retest; the separately recorded cp12 keyboard spec passed 17/17 each on Chromium, Firefox Linux and WebKit Linux (plus 3/3 admin tests in the Chromium targeted run).
- The saved B reduced-motion FAIL sampled immediately after `emulateMedia`. B-resume polls the unchanged criterion until Chrome applies the media-query update: zero running animations. No assertion or baseline was removed, and the original observation is retained. This is a sampling-timing observation, not an established application defect.
- Resumed interactive commands encountered locator/expectation errors (Unicode through the shell, rendered uppercase versus textContent, and disconnect removing a card instead of retaining it). Safe current UI observations resolved them; no product/test changes were made to conceal them.
- Browser console/network capture was not enabled retrospectively. Expected 401/404/validation errors were exercised; this report makes no blanket console-clean claim.

## Boundaries and cleanup

Real UI interactions were used for the reported actions. AI/approval/reconnect graph setup and second workspace creation used fixture API calls, identified in `session-B-resume-checks.json`; delivery counts, absence of automatic runs and access denials are separately labelled API corroboration. These are not live-provider tests.

Chrome emulated reduced motion; Windows animation settings were not changed. Desktop computer use was unavailable in the prior pass, and this closeout follows the owner's explicit Playwright re-scope. Remaining P3 findings and other-environment DV2-02 follow-up remain in BUGS.md.

The resumed AI connection was disconnected, both active synthetic accounts signed out, Chrome closed explicitly, and the supervised stack stopped. Auth/control state remains gitignored and is not staged. No push, merge, deployment or worktree removal occurred.
