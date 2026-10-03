# WebKit approval transport: bounded read-only findings

Recorded 2026-10-03, Worker B. **Disposition: ROOT CAUSE UNPROVEN; original merge blocker remains unresolved.** No code, test, baseline, retry, CI, branch, PR, environment, browser or build changes were made. Only this findings directory was written. The later passing CI run is not a causal fix.

## Candidate and source identity

Failing full-tier run: [37081791704](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37081791704), checkout SHA `6a57f97b30ea95c536793199f107e58eb4fa4e68`, clean according to the retained summary. Node `v22.23.3`, pnpm `10.32.1`, three isolated browser stacks, poolMax 6, Next `16.3.6`, Playwright `1.63.0`. This is the GitHub synthetic merge candidate, with parents `9641ad1e684cad7b84bd2385751ea19b0a9d4060` and `7a315f7146784a4ac23b48e1ba06f46a762a21a7`, confirmed using a read-only GitHub commits API request. The merge object is not present in the primary local Git object store; it was not fetched or checked out.

Read-only GitHub contents queries at the failing SHA return these blob IDs, identical to the corresponding local `git show 9641ad1:<path>` blobs:

| Path | Exact candidate blob |
|---|---|
| `scripts/gate.mjs` | `1d266bb2bd9628b5504527e72f8f0bec2b3c86a9` |
| `scripts/gate-browser-native.mjs` | `e303957952027e5a4e48601a208b3916a35da1b8` |
| `scripts/dev-test.mjs` | `09ecf75675bcf81c851633b7196569d685f4c619` |
| `playwright.config.ts` | `c0b29b678f0ff42b388fb701a2c81ad0cddd8cfc` |
| `e2e/phase3.spec.ts` | `42c8279617e3456013e8860e977ff07ebdaff061` |
| `e2e/tools/browser-docker.sh` | `2982c4e7e3fb0a44e41ad56f10a99f3826a70b00` |
| `worker/index.ts` | `99c9188a5fd073995a11fd6b542bfa36bba05cd3` |
| `src/app/api/runs/[rid]/route.ts` | `b2905e388f9eb842231ea303cc68d88b6c76c312` |

The Playwright implementation inspection is of the installed local pinned package, not a retained copy of the failing runner's installation. Its digest and relevant lines are in [SOURCE_EVIDENCE.json](SOURCE_EVIDENCE.json). No dependency install or execution occurred.

## Proven observations

1. **The failing browser job used the native runner.** Original `webkit.log:1` contains `$ node scripts/gate-browser-native.mjs webkit`, followed by shard 3 failing and shards 1/2 passing. Therefore `e2e/tools/browser-docker.sh` and its host network, container forwarding and container image configuration were outside this execution path. Changing that script cannot be justified as the corrective fix for this incident.
2. **The reset was a Node APIContext GET, not a recorded approval POST failure.** `test-results/webkit-3-report.txt:16–34` identifies `apiRequestContext.get: read ECONNRESET` for `GET http://localhost:3120/api/runs/<failed-run-id>`, at `e2e/phase3.spec.ts:88`. This is the owner's `page.request` polling for `succeeded` after the promoted viewer clicks Approve. Earlier viewer 403, role promotion and the click have been reached; the failed request has no recorded HTTP response/status. The Safari user-agent string reflects context options and does not prove WebKit's browser networking stack issued this GET.
3. **The worker processed the same run twice, but final persisted success is not proved.** Internal comparison of the failed request's run ID with original `stack-3.log:26–29` finds claim/done at `00:27:17.119Z` / `00:27:17.255Z`, then claim/done at `00:27:29.303Z` / `00:27:29.529Z`. `worker/index.ts:85–92` emits `done` in `finally`; it means the processing promise settled, including when a run waits for approval or errors. These records support resumed processing but cannot replace the missing `succeeded` assertion or establish exactly one downstream effect.
4. **Normal gate teardown followed browser completion.** `progress.log` records WebKit start `00:25:12.125Z`, WebKit end `00:33:15.140Z`, STOP test stacks `00:33:15.161Z`; `stack-3.log:53` records worker stopped `00:33:15.239Z`. The native runner awaits all child close events; `gate.mjs:432,438` awaits browser completion before normal cleanup. No inspected log establishes a crash, OOM or earlier normal cleanup. This excludes that normal cleanup sequence as the reset cause, while not proving that no unrecorded transient server/process event occurred.
5. **The failure stayed visible.** Playwright config has test `retries: 0`; the poll's request sets no `maxRetries`. Installed Playwright `1.63.0` defaults API-request `maxRetries` to 0 and immediately throws the transport error in that case. Full job result: 77 passed, 1 failed; shard 3: 21 passed, 1 failed. The failure is not a status mismatch assertion or a proved 20-second poll timeout.

## Hypotheses and evidence gaps

**Stale keep-alive reuse is plausible, not established.** Installed Playwright's APIContext creates an HTTP agent with `keepAlive: true` and issues Node HTTP requests; it has a `request.reusedSocket` branch. The owner's APIContext remains alive while the separate viewer context navigates and approves. Next is launched with `next start` and no explicit keep-alive option in `dev-test.mjs`. An idle socket being reused around a server close is one possible explanation. However, the report contains no failed-request timestamp, reuse flag, socket identifier, last-use time, peer-close event, server request arrival or response lifecycle. There is no measured idle interval or correlation with a keep-alive deadline. Do not claim the server default timeout, increase it, or change connection headers on this evidence alone.

Other server/socket interruption or resource events remain possible. Continued worker activity is evidence against a whole-stack termination, but the worker is a separate process and its log cannot certify uninterrupted Next HTTP service. The GET route returns JSON through the shared wrapper; no source defect was found that explicitly resets this request, and lack of a logged route error does not prove the request reached the handler. Native browser shard concurrency was three processes with one Playwright worker each; there is no retained CPU/memory/OOM/request trace that establishes resource pressure as the cause.

The retained artifact contains screenshots and error context, but no trace zip or request JSON report. Config requests retain-on-failure tracing; the missing retained trace is an evidence availability gap, not proof that tracing never ran. Raw retained report/error context contain disposable authentication material and were inspected with bounded filtering; only sanitized excerpts and source digests are copied here.

## Minimal recommendation for the lead / Fable

Prepare a separate **instrumentation-only transport diagnostic PR** for an isolated test-stack path, with no changed assertions, baselines, retries, coverage, timeout or production runtime policy. Do not dispatch or run it in this lane. Record the original incident as unresolved until a reviewed causal correction and meaningful validation exist.

Required diagnostic data, correlated by an opaque request ID and monotonic timestamps:

- Client APIContext: method and redacted route shape; socket ID, reusedSocket flag, local/remote address family and ports, previous-use/idle duration, request sent/finish/error/close times, errno; no cookie, credential, email, request body or customer identifiers.
- Next HTTP server: connection accepted, request arrival, handler start/end, response status/finish/close, socket end/close/error and active requests; effective keep-alive/request/header timeouts and process PID/start/exit/signal.
- Gate supervisor: child PID/exit/signal and cleanup timing; browser shard/stack coordinates; contemporaneous CPU/memory and kernel OOM evidence; failed poll timing and last successful response.
- Approval/run observation: decision request completion and persisted approval/run state plus downstream fake-provider invocation count. Preserve the existing viewer denial, promotion, final success, removal and audit assertions. Worker `done` is insufficient evidence.

The diagnosis must distinguish reuse of a stale socket from a server crash, a mid-response close or an earlier teardown. A controlled low-cost transport reproduction can then demonstrate the responsible lifecycle with unchanged zero-retry failure semantics; only afterward choose the narrow correction and a regression that fails for that cause. Any diagnostic execution is outside this read-only report's authorization.

Broad test retries, `maxRetries`, catching ECONNRESET inside `expect.poll`, forcing a fresh context or `Connection: close`, increased timeouts, skipping the scenario or declaring the later pass sufficient would weaken the evidence: the request loss could disappear while server reliability, actual approval completion and exactly-one effect remain unproved. A Docker networking patch would target a path the failed CI job did not use.

## Evidence links and limits

- [Sanitized source and retained-log digests](SOURCE_EVIDENCE.json).
- [Original forensic audit](../../takeover-20261003/WEBKIT_FORENSIC_AUDIT_0134.json).
- [Retained CI summary](../../takeover-20261003/FINAL_EVIDENCE/G4/CI_WEBKIT_37081791704.json).
- [Preserved G4 result](../../takeover-20261003/FINAL_EVIDENCE/G4/CURRENT_RESULT.md).
- [Independent documentation-head review](../../takeover-20261003/INDEPENDENT_REVIEW_G4_EVIDENCE.md) explicitly preserves the unresolved blocker.
- [Later recorded CI result](../../takeover-20261003/G4_FINAL_CI.json): head `85d805d96ee2c1b207017345b4f08dbd1e43b127`, passing run [37083233953](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37083233953). Local Git comparison from `7a315f7` to that head shows documentation/evidence additions only, not a transport fix.

The original raw artifact remains in OS TEMP `flowline-takeover-webkit-37081791704`; it was not recopied wholesale. No new browser results, production/integration acceptance, deployment or independent root-cause validation are claimed. This lane stops at findings; architecture approval and any follow-up execution belong to the lead.
