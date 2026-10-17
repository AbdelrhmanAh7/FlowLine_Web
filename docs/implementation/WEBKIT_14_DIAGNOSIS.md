# PR #14 WebKit diagnosis — 2026-10-03

> **Status update:** the "Follow-up (2026-10-03, CI history)" section at the end of this file supersedes the "keep OPEN" decision below. The original analysis is kept as written; the follow-up adds CI evidence gathered after head `ec672d7` passed the full gate. A later section, "Follow-up (issue #35): traces and JSON reports are uploaded", records that the evidence gap described below has been closed for runs after that change; statements below about what CI uploads describe run 37093517476 and earlier.

## Decision and limits

**No demonstrated causal connection to the Drizzle dependency removal. A pre-existing WebKit/test timing problem is the leading explanation, not a proven root cause. Keep the gate failure OPEN.** The evidence does not justify reverting the dependency change or changing the Output tab, assertions, retries, or timeouts. No product or test fix is made: the missing action timeline prevents distinguishing a stalled browser action from a nearly exhausted test budget. The next experiment below is required before claiming a fix or a confirmed flake.

This is an offline investigation of run **37093517476**, attempt 1. No network, browser, database, Docker, install, build, gate, commit, push, or GitHub action was performed. The local branch is `claude/pr14-webkit-diag`, HEAD `dd840db6bf6f9329f61007152b3bb500b4d66b75` (PR branch `codex/pilot-security-deps-round1`). Local `origin/main` and merge base are `9641ad1e684cad7b84bd2385751ea19b0a9d4060`.

The CI summary instead identifies **`f10278806a20a80b0bedd683ce446c46e7d0e416`**, clean, Node `v22.23.3`, pnpm `10.32.1`. That Git object is absent locally (`git cat-file -t` fails); a PR merge ref is plausible but its ancestry/tree is **unverified**. Local source inspection is therefore tied to `dd840db`, and CI observations to `f102788`. The failure's attached source agrees with the inspected journey around the failing action; this is not proof of complete tree equality.

## Symptom and retained evidence

All paths below are repository-relative. Download root `D` means `artifacts/gates/webkit-37093517476/`; `G` means `D/artifacts/gates/ci-37093517476-1-webkit/`. SHA-256 inventory and selected numbered excerpts are preserved in [artifacts/phase-4/webkit-pr14](../../artifacts/phase-4/webkit-pr14/). The downloaded bundle has 18 files, no trace ZIP and no Playwright JSON report.

| Source | Exact excerpt | What it establishes |
| --- | --- | --- |
| `D/failed.log:18,20,28` | `✓ build rc=0 73.5s`; `✓ stack 3 healthy 20.6s`; `77 passed, 1 failed` | The production build and all test stacks started successfully; WebKit failed. |
| `D/failed.log:62-64` | `R_CHROMIUM: success`; `R_FIREFOX: success`; `R_WEBKIT: failure` | Other browser jobs passed according to the final job's inputs; their detailed reports are not in this bundle. |
| `D/test-results/webkit-2-report.txt:20-27` | `Test timeout of 60000ms exceeded.`; `locator resolved to <button role="tab"`; `data-tab-id="output" aria-selected="false"`; `waiting for element to be visible, enabled and stable` | The locator found Output. The **whole test** deadline expired during click actionability, before a recorded click dispatch. This is not a missing-tab error or proof that the click itself waited 60 seconds. |
| `D/test-results/webkit-2-report.txt:30-37` | `await expect(panel.locator("pre").first()).toContainText('\"employees\": 120');`; `at .../e2e/journey.spec.ts:138:52` | Input selection and its payload assertion completed; Output selection was the next action. |
| `D/test-results/webkit-2/journey-new-user-builds-sa-cd6c7-ns-runs-and-inspects-a-flow-webkit/error-context.md:144-154` | `tab "input" [active] [selected]`; `tab "output"`; `tab "error" [disabled]` | Output exists alongside the selected Input tab; the disabled tab is Error. |
| Same error-context, lines 167-168 | `Run output`; `"{ \"qualified\": { \"name\": \"Ada Lovelace\", \"size\": 120 } }"` | Expected run output is rendered. This does not substitute for the later backend assertions, which were never reached. |
| `G/stack-2.log:25-26` | `2026-10-03T03:41:45.958Z [worker] run ... claimed`; `2026-10-03T03:41:46.112Z [worker] run ... done` | A run completed on shard 2; without request/trace correlation, its identity as the journey run is only an inference. |
| `D/test-results/webkit-2-report.txt:45-46` | `attachment #3: trace (application/zip)`; `.../trace.zip` | Playwright reported a trace, but it was not retained in the downloaded artifact. |

The failure screenshot in the same journey directory was inspected directly: the desktop inspector is open, Shape lead is selected, Input's JSON is displayed, and Output is visibly unobscured. A still image cannot establish stability across frames or whether the browser was servicing animation callbacks. The report contains no `element is not stable`, disabled/hidden-element retry, interception, or detachment diagnosis.

Shard results are 30 passed / 25 passed + 1 failed / 22 passed. `G/webkit.log` identifies shard 2 as the only nonzero exit. `browsersMode: sequential` means browser projects are sequential **within this gate invocation**, not serial execution of its three shards: `scripts/gate-browser-native.mjs` starts them with `Promise.all`, one Playwright worker each. Separate CI browser jobs use separate runners.

`G/stack-2.log:17,21,27` also contains `Error: The destination stream closed early.` Similar messages occur on both passing shards. They have no request identity or timestamp, so attributing them to this click, or treating them as the cause, is unsupported.

## Code path and dependency causality

1. `e2e/journey.spec.ts:121-139` runs through the keyboard shortcut, waits for SUCCESS and the output node duration, opens the inspector, selects Shape lead, checks Input, then clicks Output. `playwright.config.ts` sets a 60,000 ms **test** timeout, 10,000 ms assertion timeout and zero retries. It sets no separate click timeout, so the click consumes the remaining test budget.
2. `src/app/w/[slug]/runs/inspector.tsx` mounts `StepPanel` when run and step data exist. `selectStep` updates local state and defaults a successful step to Output. `Tabs` receives all four tabs unconditionally; **only Error** gets a disabled reason when the step did not fail. Switching Input/Output is local React state, with no new server request or loader invocation. Completed run detail/list polling stops; the 10-second relative-time update still renders, but is not evidence of a remount or layout loop.
3. `src/components/ui/tabs.tsx` renders enabled tabs with `RadixTabs.Trigger`. Its trigger transition changes color, and its panel entry animation is disabled by `src/app/globals.css` under the test's `reducedMotion: "reduce"`. `useSidePanel` initializes focus on opening, not every data render. No concrete focus, mounting, or animation race was found in these paths.
4. The locally installed Playwright 1.63.0 implementation (`node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/coreBundle.js`, `checkElementStates` / `_checkElementIsStable`, and lines 20234-20241) awaits stable geometry through `requestAnimationFrame` **before** checking visible/enabled state. The last log line alone therefore cannot distinguish delayed frame callbacks, pending browser evaluation, or arrival at the test deadline. WebKit's stability count is 1 on Linux and 5 on Windows (same file, lines 47578-47579); this was a Linux CI failure, so the Windows-specific count does not explain it.
5. `git diff origin/main...HEAD` changes only `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tests/unit/drizzle-tooling-prune.test.ts` and two Drizzle evidence files. The override removes `drizzle-kit@0.31.11>@esbuild-kit/esm-loader`, its `core-utils`, esbuild 0.18.20/platform packages and now-unreachable source-map helpers. It retains Kit 0.31.11, esbuild 0.25.12/0.28.2 and tsx 4.23.15. No app, worker, Next config, package script, Playwright config, browser dependency, or journey changes appear in the diff.
6. Search of `src/`, `worker/`, `scripts/`, `.github/`, `next.config.ts`, `package.json`, `drizzle.config.ts` and `Dockerfile` finds no removed-loader import. Kit is used by `db:generate` and `drizzle.config.ts`; application persistence/migrations use **drizzle-orm**. Worker launch is `tsx worker/index.ts`; `next.config.ts` imports only the `NextConfig` type and has no custom loader. All seven installed Kit JS/CJS/MJS files were inspected: no loader/core-utils references. CI's successful build, migrations, worker startup and rendered completed run support the absence of a loader-resolution failure on the exercised path.

These observations make a direct dependency regression unlikely. They do **not** exclude every install/layout/timing effect, prove the CI merge tree equals this branch, or prove this exact failure occurs on main. There is no controlled base-versus-head reproduction here.

## Ranked hypotheses and falsifiable next observations

| Rank | Hypothesis (suspected, not proven) | Supporting/limiting evidence | What would confirm or reject it |
| --- | --- | --- | --- |
| 1 | WebKit frame/evaluation scheduling stalled during click actionability, possibly under three-shard runner load. | One unresolved stability check; no logged unstable-element retry; visible tab and completed input interaction. Frame timing is absent. | Trace shows substantial time remaining when Output click began, then a long stability wait; a diagnostic run records long rAF gaps despite unchanged tab bounds. Prompt rAF/evaluation completion rejects this explanation. |
| 2 | Earlier journey actions consumed almost all 60 seconds; Output was merely the action in progress at expiry. | The exception explicitly names the test timeout; signup, drag/drop, autosave, reload and navigation share one deadline. No step durations were uploaded. | Compare test start with Output click start in trace/JSON. A click starting near the deadline, with delay attributable to earlier actions, confirms this; a click starting early rejects it. |
| 3 | A transient inspector layout/remount or navigation/stream issue blocked actionability. | Stream errors exist, but also on passing shards; screenshot and source show a normal inspector. | Trace must show correlated geometry changes, detachment, navigation or page errors during the click. Stable DOM/geometry with delayed frames points instead to rank 1. |
| 4 | Pruning the loader caused a build/runtime difference that appears only in WebKit. | No import path or relevant source/version change found; build/stacks and other browser jobs passed. | Controlled frozen-install A/B must reproduce a head-only failure and reveal an affected import/build/request path. A corresponding base failure disproves head-only causality; a single passing run does not prove absence. |

Prior evidence establishes a history of WebKit timing failures, **not this failure's cause**: [MAIN_CONSOLIDATION.md](MAIN_CONSOLIDATION.md) records an unexplained earlier canvas timeout, explicitly left open despite a passing repeat. Historical journey runs in `artifacts/company-builder/gates-6bade3d/webkit-results.json:1579-1585` and `artifacts/company-builder/validation/20261001-d224cfb/gates-final-29db174/e2e-webkit-results.json` passed in 10,217 ms and 11,099 ms respectively. Different builds/environments make these context only; they do not establish the failing run's remaining budget or a typical CI duration.

## Exact next experiment (orchestrator; not executed here)

The evidence gap is concrete: `.github/actions/gate-report/action.yml:54-58` uploads gate logs, text reports, error context and failure PNGs, **not** trace ZIPs or native-runner JSON. `scripts/gate-browser-native.mjs` writes `test-results/webkit-<k>-results.json`; `playwright.config.ts` retains a trace on failure. Preserve those outputs privately before runner teardown, extract sanitized timing/DOM facts for review, and do not commit raw trace payloads or credentials. The existing artifact policy is unchanged by this diagnosis.

1. If the original trace/JSON still exists outside the downloaded bundle, inspect it first without rerunning. Record test start, Output click start/end, preceding action durations, last DOM snapshot, navigations, console/page errors and relevant failed requests. Do not infer click duration from the 60-second exception.
2. Otherwise use a dedicated Linux runner with the failed run's Node/pnpm/Playwright versions, isolated test databases and **separate frozen dependency installs**. Recover and verify `f102788` and its parents before claiming exact CI reproduction. For a bounded dependency comparison, the locally known base is `9641ad1` and PR head is `dd840db`; label this comparison separately if the CI merge tree differs. Do not reuse this worktree's shared installation.
3. On each candidate, run one full WebKit attempt under the original three-stack conditions; collect both failing and passing timelines. Existing gate invocation (Bash, dedicated runner only):

   ```bash
   FLOWLINE_GATE_NATIVE_BROWSERS=1 pnpm gate --tier=full --only=webkit --stacks=3 --out=artifacts/gates/webkit-pr14-head
   ```

   Use `--out=artifacts/gates/webkit-pr14-base` on the base checkout. No retries, timeout changes, force clicks or assertion changes. Retain `summary.json`, every `webkit-*-results.json`, shard reports and any trace locally even on failure. A green repeat alone does not close the investigation.
4. If timelines show an actionability stall, a follow-up isolated journey on an **already running dedicated test stack** separates suite-load dependence from the interaction itself. This is a diagnostic experiment, not a substitute gate:

   ```bash
   PLAYWRIGHT_JSON_OUTPUT_NAME=artifacts/gates/webkit-pr14-journey.json pnpm exec playwright test e2e/journey.spec.ts --project=webkit --workers=1 --trace=on --reporter=line,json --output=test-results/webkit-pr14-journey
   ```

   If a long stable-check wait remains, add bounded diagnostic sampling before the inspector interaction: rAF timestamps plus Output's connected state/bounds and document visibility, paired with a timer heartbeat. Record elapsed times only and preserve all test assertions. A continuing timer with missing rAF versus both stopping distinguishes frame scheduling from broader page execution starvation; moving bounds indicate layout instability. This instrumentation is a follow-up experiment, not an implemented fix.

If rank 2 wins, fix the measured redundant wait or synchronization issue earlier in the journey; do not simply extend/split the deadline. If rank 3 reveals a real state race, fix that transition with a deterministic unit regression where possible, then rerun the unchanged acceptance journey. A browser scheduling issue cannot be certified by a Node-only unit test.

## Local verification and handoff

- `git status --short`: clean at entry. `git diff origin/main...HEAD` and the narrower diff over app/worker/E2E/config/scripts were inspected; the latter is empty. Read-only searches, local JSON parsing, package resolution and screenshot inspection underpin the findings above.
- `pnpm.cmd exec vitest run --project unit --configLoader runner tests/unit/drizzle-tooling-prune.test.ts tests/unit/dv2-r01-r02-tooltip-tabs.test.ts`: **exit 1, 11 passed / 1 failed (12)**. All 10 tab/tooltip logic tests and the lockfile test pass. The Kit test fails at line 17 because `kitRequire.resolve("@esbuild-kit/esm-loader")` still succeeds.
- This is a local installation mismatch: `node_modules` is a junction to `C:\Users\Abdelrahman\Desktop\Personal_Project\FlowLine\node_modules`, where both removed packages remain resolvable. No install or shared-module edit was attempted. It is **not** evidence that the pruned CI install failed; it prevents local certification of the pruning. The shipped Kit source inspection still applies to installed version 0.31.11.
- No TypeScript/application code changed, so typecheck/lint and additional tests were not run. No unit regression was invented for an unproven race. Browser reproduction, root-cause confirmation, exact CI tree comparison, and a passing final gate remain unverified.
- `git diff --check`: passed. Read-only documentation/evidence verification: 12 local Markdown links resolve, all 18 downloaded-file hashes match the preserved inventory, and the retained excerpts contain no credential values. This verifies the handoff files, not application behavior.
- Changed material is diagnosis/evidence and documentation only. The orchestrator should keep #14's failed gate visible, preserve the dependency change pending controlled evidence, and capture action timing before choosing a fix. This report supplies a bounded next experiment, not merge readiness.

## Follow-up (2026-10-03, CI history)

**Conclusion.** The #14 dependency change did not cause the WebKit failure in run 37093517476. A tree with identical runtime content passed all 78 WebKit tests (plus Chromium and Firefox) in run 37132314447. The failure is best explained as an intermittent, timing-sensitive WebKit/journey problem, but that is still **not proven**: it happened once, no trace was kept, it has not been reproduced, and `main` has no WebKit baseline. **Recommendation:** stop treating #25 as a blocker for #14, close it as "not attributable to #14", and track the journey flake in its own issue (see "Recommendation" below). Confidence is stated per claim further down.

Method: read-only `gh` (run list, run view, job logs, artifact download) on `AbdelrhmanAh7/FlowLine_Web`. Nothing was re-run, posted, or changed in tests, timeouts, retries, or workflows. All 27 data rows are preserved in [followup-webkit-runs-20261003.json](../../artifacts/phase-4/webkit-pr14/followup-webkit-runs-20261003.json) because the CI artifacts expire after 14 days (`.github/actions/gate-report/action.yml:60`).

### Scope of the search

There are 114 Gate runs on record (2026-10-02 16:10Z to 2026-10-03 15:26Z). **27 executed WebKit tests** (full tier). Not counted: 2 cancelled runs; 5 `pr/cb-1-core` runs that exited after about a minute on `browser group manifest is inconsistent`; fast-tier runs where the webkit job is skipped; and the earliest single-job runs (the ones inspected were fast tier or failed during setup).

**`main` has no WebKit result.** Its two Gate runs (37081206220 at `9641ad1`, 37078652764 at `9fdcb7d`) are push events on the fast tier with the webkit job skipped. The "unchanged main" comparison asked for in #25 therefore cannot be made from history.

### Evidence table: the two runs that contain the #14 change

| Run | Branch | PR head | CI merge SHA | WebKit result | webkit step | Failing spec |
| --- | --- | --- | --- | --- | --- | --- |
| 37093517476 | `codex/pilot-security-deps-round1` | `dd840db` | `f102788` | 77 passed, 1 failed | 557 s (shards 9.1 / 9.2 / 6.9 min) | `e2e/journey.spec.ts:9`, click at line 138 on the step-panel Output tab, 60 s test timeout |
| 37132314447 | `codex/pilot-security-deps-round1` | `ec672d7` | `6b8083d` | 78 passed | 219 s (shards 3.4 / 3.6 / 2.9 min) | none |

### Evidence table: every other WebKit failure (trees without the #14 change)

| Run | Branch | PR head | WebKit result | Failing spec | Other jobs in the same run |
| --- | --- | --- | --- | --- | --- |
| 37132472664 | `codex/paid-pilot-federated-mfa-20261003` | `f06acea` | 77 passed, 1 failed | `zitadel-platform.spec.ts:24` (callback URL never reached) | chromium, firefox, integration also failed |
| 37095815314 | `codex/pilot-security-redact-round1` | `151a6b1` | 75 passed, 3 failed | `hydration.spec.ts:61` x3 (`no verify email`) | chromium, firefox also failed |
| 37094988325 | `codex/pilot-security-redact-round1` | `5f07d88` | 77 passed, 1 failed | `company-builder.spec.ts:31` (`cb-grant-trial` stayed `aria-disabled`, 180 s timeout) | chromium, firefox, integration also failed |
| 37094196797 | `codex/pilot-security-redact-round1` | `09be0b3` | 22 passed, 56 failed | mass `no verify email` sign-up failures (includes `journey.spec.ts:27`, at sign-up, not the Output tab) | chromium, firefox, integration also failed |
| 37081791704 | `codex/takeover-beta-20261003` | `7a315f7` | 77 passed, 1 failed | `phase3.spec.ts:43`, `apiRequestContext.get: read ECONNRESET` at line 88 | static, chromium, firefox, integration passed; the next commit `85d805d` passed WebKit |

### Evidence table: passing WebKit runs

21 runs passed 78/78: the #14 rerun `37132314447` above plus 20 runs on trees without the #14 change (`37132842360`, `37132313745`, `37100289007`, `37099595026`, `37098951245`, `37098120270`, `37097538824`, `37096736397`, `37090636510`, `37090561314`, `37083979064`, `37083233953`, `37081948593`, `37081798792`, `37079833196`, `37077650513`, `37070526747`, `37069577000`, `37068326693`, `37066206918`). The webkit step took 219 to 532 s (median 484 s) across passing runs.

### Findings

1. **The CI tree for the failed run is now verified.** The GitHub commits API shows `f102788` is a merge of `dd840db` into `9641ad1`, touching exactly the five #14 files (`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tests/unit/drizzle-tooling-prune.test.ts` and two Drizzle evidence files). This closes the "unverified CI tree" gap listed under "Decision and limits".
2. **The failed and passing #14 runs have the same runtime content.** The compare API between `f102788` and `6b8083d` lists 8 files, all documentation or evidence (`WEBKIT_14_DIAGNOSIS.md`, `DEVELOPER_GUIDE.md`, `PHASE4_BETA_REPORT.md`, `TEST_PLAN.md`, three `artifacts/phase-4/webkit-pr14/` files, and the dependency-prune note under `artifacts/phase-4/paid-pilot-round1/`). `ec672d7` differs from `dd840db` only in those files (`git diff --stat dd840db ec672d7`). `main` was still `9641ad1` when checked.
3. **The #14 diff cannot reach anything WebKit loads.** `git diff origin/main...HEAD` shows the lockfile gains 3 lines (the override and a blank) and loses 266. The removals are `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild@0.18.20` with its 22 platform packages, `source-map-support`, `source-map@0.6.1` and `buffer-from`. No retained package changes version. `package.json`, Next, React, Playwright, tsx 4.23.15 and esbuild 0.25.12 / 0.28.2 are untouched. The removed packages are Drizzle Kit tooling (`db:generate`), not imported by `src/`, `worker/`, or the Next build (see "Code path and dependency causality", item 6). The build, all three stacks, Chromium and Firefox passed on the failed run.
4. **The exact failure is rare in this history.** The journey Output-tab click timeout occurred in 1 of 27 WebKit executions: 1 of 2 with the #14 change, 0 of 25 without. The only other journey failure (37094196797) happened at sign-up inside a 56-failure outage, which is a different problem.
5. **WebKit-only failures on other branches have different causes.** Of the other five failed executions, four coincide with Chromium/Firefox/integration failures in the same run (branch-specific breakage, not WebKit timing). One is WebKit-only (`phase3.spec.ts`, ECONNRESET). Across the whole history there are 2 WebKit-only single-spec failures in 27 executions (about 7%), in two different specs.
6. **Timing is a weak signal.** The failed run's webkit step (557 s) was the longest of the 27, but only about 5% above the slowest passing run (532 s), and the passing #14 rerun was 2.5x faster (219 s). Runner speed varied about 2.5x across the day. This is consistent with a load-sensitive failure but does not show one.
7. **The diagnostic evidence gap remains.** `.github/actions/gate-report/action.yml:54-58` uploads `artifacts/gates/**`, text reports, `error-context.md` and failure PNGs only. None of the 27 WebKit artifacts downloaded here contains a `trace.zip` or a Playwright JSON report, and the reports carry no per-test durations. The remaining budget at the moment the Output click started (hypotheses rank 1 versus rank 2 above) is still unmeasured. *(Closed for later runs by the issue #35 follow-up below; the runs measured here stay unmeasured.)*

### Confidence

| Claim | Confidence | Basis |
| --- | --- | --- |
| #14 is not a deterministic regression for WebKit | High | Identical runtime tree passed (WebKit 78/78, Chromium and Firefox green); removal-only lockfile diff; removed packages are not loaded at runtime or build |
| #14 had no smaller, probabilistic effect | Moderate-high, by mechanism only | The counts cannot show this. With one failure among 27 executions, the chance that it lands on one of the two #14 executions by luck is 2/27 (about 7%), which is not significant but not negligible either |
| The failure is an intermittent WebKit/journey timing issue | Moderate | Best fit to the paired result and the rarity; not reproduced, no trace, single occurrence |
| It is a "pre-existing flake on main" | **Not established** | `main` has no WebKit baseline and 0 of 25 other trees showed this exact failure. Say "not attributable to #14", not "confirmed pre-existing" |
| Root cause (frame scheduling, spent budget, layout race) | **Unknown** | Hypotheses 1 to 4 above are all still open |

### Recommendation

1. **Close #25 as "not attributable to #14; intermittent, root cause unproven"**, using the comment drafted by the orchestrator. Do not label it a confirmed pre-existing flake. #14's `gate` check is green at `ec672d7` on all browsers. The merge state was `BLOCKED` when checked, with a pending CodeRabbit status (the confirmation work is tracked in #28, unrelated to WebKit).
2. **Open a separate test-reliability tracking issue** for the intermittent `journey.spec.ts` Output-tab click timeout (1 of 27 full-tier WebKit runs). `AGENTS.md` treats flaky tests as failures, so it must stay visible. Acceptance: on the next occurrence, capture the trace and per-step timings (this needs a follow-up change to upload `trace.zip` from the gate-report action), decide between hypotheses 1 and 2, then fix the synchronisation or the redundant wait. Do not raise the timeout, add retries, or force the click. *(Issue #35 tracks it; the upload change is done, see the issue #35 follow-up below.)*
3. **Optional, cheap, no code change:** dispatch the Gate workflow at the full tier on `main` two or three times to create the missing baseline. A journey failure on `main` proves the flake pre-exists; no failure keeps it "about 1 in 27, unproven". This is not needed to merge #14.
4. **Preserve evidence before 2026-10-17** (14-day artifact retention). The JSON file above keeps the table; copy any raw report you need under `artifacts/phase-4/` and never commit trace payloads that may hold credentials.

## Follow-up (issue #35): traces and JSON reports are uploaded

[Issue #35](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/35) tracks the intermittent journey Output-tab click timeout (1 of 27 full-tier WebKit runs). Its first acceptance item, the missing evidence, is addressed by a CI-only change. No test, assertion, timeout, retry or product code changed, and the flake itself is **not** diagnosed or fixed.

**What changed.**
- `.github/actions/gate-report/action.yml` now uploads `test-results/*-results.json` (the Playwright JSON report of each shard) with the existing `flowline-gate-<job>-<run id>-<attempt>` artifact (14 days), and a separate `...-traces` artifact holding `test-results/**/trace.zip` (7 days; created only when a test failed). The failed-job step summary names the failed tests and both artifacts.
- Recording needed no change: `playwright.config.ts` already had `use.trace: "retain-on-failure"` and `retries: 0`, and the gate runs already wrote the JSON report; this diagnosis's own evidence shows the trace existing on the runner (`artifacts/phase-4/webkit-pr14/source-excerpts.txt:64`, `test-results/webkit-2/<test folder>/trace.zip`) but never uploaded.
- `tests/unit/ci-workflows.test.ts` pins the upload globs, the retention values, the shared upload-artifact SHA pin, the runner output names the globs rely on, and the secret-hygiene facts below.
- Where to find and how to read the files, and why a trace cannot leak a secret: [Playwright traces in CI](../DEVELOPER_GUIDE.md#playwright-traces-in-ci).

**What the next occurrence gives.** The trace for the failing journey (every action, `expect` and `test.step` with start time and duration, DOM snapshots, network log, console) and the shard's JSON report (test start time and duration). That is the measurement the ranked hypotheses above wait for. Hypothesis 1 (a stalled stability wait) is supported if the Output click started with most of the 60 s unspent, and hypothesis 2 (budget used earlier) if it started near the deadline. Hypothesis 3 needs correlated geometry changes, detachment, navigation or page errors in the click window. Then fix the real synchronisation gap or the redundant wait; do not raise the timeout, add retries or force the click.

**Not verified.** The workflow change was checked by unit text guards, YAML parsing and a local run of the summary step with fake files. It has not uploaded a real trace on GitHub; the first failing browser test after it merges will be the first. Runs before the change have no traces, and the artifacts of run 37093517476 expire around 2026-10-17. Acceptance item 3 (full-tier WebKit runs on `main` for a baseline) is not done here; the JSON reports now uploaded on every run also provide per-test durations for it.
