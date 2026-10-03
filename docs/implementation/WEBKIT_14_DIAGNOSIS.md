# PR #14 WebKit diagnosis — 2026-10-03

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
