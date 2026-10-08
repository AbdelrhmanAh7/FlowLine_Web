# Company Builder — findings log (direction v2, first vertical slice)

This is the running log for the direction-v2 change (`816f342..HEAD`). Phase-1 findings stay unchanged in
`20260930-51f1473/BUGS.md` (historical evidence; not rewritten).

**Severity:**

| Level | Meaning |
|---|---|
| P0 | Blocker |
| P1 | Must fix before an owner trial |
| P2 | Should fix |
| P3 | Minor |

**Source:**

| Code | Where the finding came from |
|---|---|
| `unit`, `int`, `e2e` | The automated suites |
| `explore` | Exploratory pass in Chromium. This substitutes for real Google Chrome, which the container's network policy blocks (`dl.google.com`, 403). |
| `helper-review` | Claude reviewing a Sonnet helper's diff |
| `fable` | Independent Fable review |

| ID | Sev | Finding (reproduction → expected / actual) | Source | Status | Fix / evidence |
|---|---|---|---|---|---|
| CB2-00 | P1 | Follow-up pack run 1 against the frozen fixtures: 3/14 tests failed (11/14 passed). (a) The cancellation line "…24 hours…" was classified as an *hours* answer. (b) The evaluator checked numbers against the reply's own `used_lines` and compared missing details with the record, so it could not catch invented numbers or wrong extraction. | unit (frozen fixtures, before tuning) | FIXED | Each approved line belongs to its first matching topic only. The evaluator re-computes details independently and allows only digits from the owner's approved lines. The fixtures were **not edited**. Evidence: `v2-first-slice/follow-up-fixtures-run1-3-FAILED.txt` → `follow-up-fixtures-run2.txt` (14/14). |
| CB2-01 | P1 | Stored run output is Postgres jsonb, which reorders object keys. The follow-up evaluator compared `detected` with `JSON.stringify`, so **every real trial was reported "doesn't match"** even with a correct result. `operations-summary` had the same pattern. The in-memory unit runs hid it. | int (real worker) | FIXED | `sameJson` (canonical, key-order independent) in `packs/types.ts`, used by both packs. Regression unit test "evaluators don't depend on object key order", confirmed to fail on the old code. int: "a sample trial runs…" 28/28. |
| CB2-02 | P2 | The owner CLI text trial was hard-wired to `customer-triage`. New plans no longer contain it, so every text trial would fail with "Task not found". | Claude reading the code after the direction change | FIXED | Envelope accepts `customer-follow-up` (and legacy triage). The API targets the follow-up task and adds a stable per-job request id; no timestamp is invented. The fake CLI was updated; int-cli 16/16. |
| CB2-03 | P3 | The `other_areas` "why we ask" text promised "their own questions", but other areas only become next improvements. | Claude copy review | FIXED | AR/EN copy now says they are listed as possible next improvements only, and nothing is prepared or turned on. |
| CB2-04 | P3 | The experiment panel hard-coded Arabic duration units and a `$` sign outside i18n. | helper-review | FIXED | `experiment.duration` key; `Intl.NumberFormat` currency. |
| CB2-05 | P1 | The follow-up time used `dateStyle`/`timeStyle` together with `timeZoneName`, which throws a `TypeError`. The "fallback" retried the same options, so **the session page crashed** as soon as a result was shown. | e2e (Chromium) | FIXED | `src/company-builder/format.ts` uses explicit fields and a safe fallback (UTC, raw ISO). Unit `cb-format.test.ts`. E2E Chromium 4/4, Firefox 3/3. |
| EX-01 | P2 | The Arabic plan showed raw keys (`work.item.extract_request_facts`…) under "What happens automatically": planner work items can be capability ids, and the UI didn't look them up. | explore | FIXED, RETESTED (`v2-first-slice/exploratory/retest-47d8807`) | `workItem` looks up `node` → `work.item` → `capability`. Unit "every plan item the planner produces has business copy in both languages". |
| EX-02 | P3 | Arabic digits are inconsistent: the follow-up time uses Arabic-Indic digits, while the plan version ("النسخة 1") and the run range ("80–450") use Latin digits. Readable, but mixed. | explore | FIXED (owner decision 2026-10-01) | The product uses digits 0–9 everywhere, Arabic UI included. Follow-up times and the experiment panel now use the app's `ar-EG-u-nu-latn` locale. Regression `tests/unit/latin-digits.test.ts` covers formatters, no non-Latin numbering systems, and no Arabic-Indic or Persian digits in product source; E2E asserts the Arabic page body. Text a person typed (approved information) is quoted as written. |
| EX-03 | P3 | The approval section rendered as "…before sending. Owner", which reads as one broken sentence. | explore | FIXED, RETESTED (retest-47d8807) | Now two lines: "Requires approval before sending." and "Who reviews: …". |
| BENCH-V1 | — | Frozen benchmark v1 now scores 7/12 (0 violations). B01, B06, B08, B10 and B11 fail on task selection because v1 expects the previous direction: multi-agent plans and several departments at once. | unit | ACCEPTED (direction change) | v1 expectations are **unchanged**; only the scorer's allowed local step types gained `data.store`, with a comment. Benchmark v2 (frozen before the planner change) scores 12/12, written by the same author for the deterministic generator only. `v2-first-slice/benchmark-v1-rescored.json`, `benchmark-v2.json`. |
| FB-01 | P1 | The follow-up evaluator trusted the flow's own claims (`used_lines`, ASCII digits anywhere in the approved text). An invented commitment, a price built from digits found elsewhere, an off-topic approved line, a wrong record time or customer, or an Arabic-digit price all passed as "matches what was asked". | fable | FIXED | `recomputeFollowUp` recomputes the whole expected result in TypeScript: outcome, hand-off reason, exact lines and reply text, and record. Numbers are allowed only from the lines used, after Arabic-Indic/Persian digit normalisation. 6 regression tests, confirmed failing on the old pack. |
| FB-02 | P2 | Approved information was split at sentence punctuation, so "We work 8 a.m. to 6 p.m." became fragments and replies quoted truncated statements. | fable | FIXED | Split per line only. The `cust_info` copy now says one fact per line, sent exactly as written and in its language. Regression test. |
| FB-03 | P2 | A non-ISO `received_at` (e.g. an RFC 2822 e-mail date) crashed the run: no reply, no hand-off, no record. | fable | FIXED | Strict ISO-8601 guard in the flow and the evaluator. Otherwise no follow-up time, never invented. Regression test (garbage, number, RFC 2822). |
| FB-04 | P2 | Client-supplied trial input could store unprefixed, real-looking follow-up records. | fable | FIXED | `startTrial` forces `request.sample = true`. The evaluator treats `sample` as boolean only. int: records go under `sample:real-123`. |
| FB-05 | P2 | `reply_to_sender` passed when the request had no sender. | fable | FIXED | Requires a non-empty recipient equal to the sender. Regression test. |
| FB-06 | P3 | Substring keyword matches ("الحين" → coverage, "discover" → cover) changed which approved lines were sent. | fable | FIXED | Word-start matching shared by the flow and the evaluator; "حي" and "we work" removed from the keywords. Regression test. |
| FB-07 | P3 | Persian digits weren't normalised; phones written with spaces (`+966 55 123 4567`) weren't recognised. | fable | FIXED (`1fe3d31`) | Spaced, dotted, dashed and parenthesised numbers are joined only when they start with "+" or a leading 0 and give 9–13 digits; no country code is ever added. The display form is kept as written. Unit: 6 formats plus negatives. Integration: "+20 10 1234 5678" through the real worker. |
| FB-08 | P3 | Any member with `flow.run` could record "the result matches". | fable | FIXED | Only the task's named reviewer may judge (same rule as approval, `reviewer.ts`). int: an editor gets 403 and the owner succeeds. |
| FB-09 | P3 | Active-time events could be replayed to inflate the metric, and "edits" counted first answers given after the preview. | fable | FIXED | One slice per person per 25 s (int asserts a replay isn't counted). "Edits" now counts only changes to already-answered questions, matching the protocol definition (unit). |
| FB-10 | P3 | Technical field names (`params.approvedInfo`) appeared in the plan diff outside Advanced; the experiment label said "provider". | fable | FIXED | Diff fields moved under "Technical details (advanced)"; the label now reads "AI cost reported by the CLI (owner prototype only)". |
| FB-11 | P3 | Refund requests get the approved cancellation line, not a hand-off. | fable | FIXED (owner decision 2026-10-01) | Refund and cancellation requests are flagged `refund_or_cancellation` on the draft and the record (`requires_human_decision`). The draft contains only approved policy lines plus a fixed note (FB-14). It waits for the named reviewer: an editor gets 403, approving only puts the text in the outbox, and no money or account step exists. Unit REF-* and integration REF. |
| FB-14 | P3 | The fixed refund/cancellation note said the request goes to "a member of our team" and did not name who decides. | issue #49 | FIXED | The note (`REFUND_NOTE`, ar/en) now names the business owner as the decision maker for that specific request and promises no outcome: en "The business owner decides this refund or cancellation request. Nothing has been refunded or cancelled." / ar "قرار طلب الاسترداد أو الإلغاء هذا يعود إلى مالك المشروع. لم يتم أي استرداد أو إلغاء." Unit REF-NOTE plus the REF-* drafts; copy recorded in `docs/company-builder/COPY_REVIEW.md`; scorer `noPromise` in `flowline-field/field.spec.ts` excludes the non-promise sentence. |
| FB-12 | P3 | All follow-up records share one namespace per workspace, and the sample id is fixed, so two interviews in one workspace overwrite each other's sample record. | fable | FIXED, BETA BLOCKER VERIFIED (`1fe3d31`) | Records are keyed `<session id>/<sample:>request id` (planner `recordScope`). Integration KEY covers two interviews in one workspace, 4 concurrent trials, retry with the same key, refresh, and a new plan version of the same interview: 2 records, no overwrite, no duplicates. Unit KEY-*. |
| FB-13 | P3 | Arabic replies quote approved lines in the language they were written (English lines inside an Arabic greeting). | fable | DISCLOSED | The copy now tells the owner lines are sent exactly as written and in their language. |
| ENV-04 | P3 | `pnpm stop:test` did not stop a production-mode (`FLOWLINE_TEST_NEXT=start`) stack: `next start` and the fake servers kept ports 3100/4010/4011. A restart then silently served the OLD build, and every E2E test failed. | e2e run | FIXED (`1fe3d31`) | `pnpm stop:test` now stops listeners on :3100 and the fake ports (lsof or fuser) plus fake-server processes, in both dev and `next start` mode. Verified: all three ports were held before and free after, with 0 stack processes left. |
| PRE-02 | P2 | Pre-existing E2E race in `failures.spec.ts:97`, from phase 1. | e2e | OPEN (pre-existing, intermittent) | Did not reproduce in the full Chromium run on `47d8807` (127/127). A single pass doesn't prove it fixed. |
| PRE-02 (R4) | P2 | Failed again in the R4 final Chromium run on `f74285c` (127/128). Reproduced: 2/20 with `--repeat-each=20`. Root cause (as documented on 2026-09-30): the test's `setOffline(false); setOffline(true)` blip let autosave legitimately save the local edit first, so no conflict existed to show. | R4 gate | **FIXED `3aa2c17` (test-only)** | The blip was removed; the other context is independent. 40/40 with `--repeat-each=40` (`round-r4/pre-02/`). The product assertions are unchanged: no silent overwrite, and Keep my version records an overwrite version. |

## Validation sprint 2026-10-01 (run `20261001-d224cfb`; packet sha256 `4fa9841b…`)

| ID | Sev | Finding | Source | Status | Fix / evidence |
|---|---|---|---|---|---|
| VF-01 | P2 | **Wrong service's price quoted.** An Arabic office-price question (VP-03) got the *deep-cleaning* price. Three causes: (a) "Office cleaning starts at 900 EGP per visit." has no price word, so it was never classified as pricing; (b) topic lines weren't filtered by the service asked about; (c) the UI had no way to link "office cleaning" and "تنظيف مكاتب" as one service. FC-3 (changed office price) was never quoted for the same reason. | frozen packet, Flowline field run 1 on `ec35061` (8/10) | FIXED `dd9984f`, RETESTED | Lines with an amount and currency are prices. Topic lines are quoted only if they mention the requested service or no service. "name / other name" in the services answer (copy updated AR/EN) creates aliases. 3 unit regressions, confirmed failing on old code. Field run 2 on `dd9984f`: VP-03 and FC-3 pass (9/10). Run-1 evidence kept: `validation/…/flowline-field/run1-ec35061/`. |
| VF-02 | — | **Packet ambiguity (not a product defect).** VP-06's frozen check `mustNotPromise: "cancelled"` matches the approved policy line "Refunds for **cancelled** paid visits are reviewed…". The reply promises nothing. | field runs 1 and 2 | RECORDED — **Disputed fixture expectation; separately reviewed** | The packet is frozen and not edited; the strict score keeps VP-06 as FAIL in runs 1–3. A separate reviewer (a Fable subagent in this session, read-only, given no preferred conclusion) returned: **FAIL under the scoring rule as written** (literal hints for the Flowline scorer). It found the expectation **ambiguous/defective**, because the bare word "cancelled" appears in the packet's own approved policy line and in an explicit non-promise. That reviewer is not a human or an external party. A v2 packet would need phrase-level hints and must be created before any further product run. |
| VO-01 | P3 | VP-04 (all details given) gets a reply that is only a greeting and a closing. It's correct but carries no information. | field run | OBSERVATION (not fixed; sprint scope) | A product decision whether to confirm the details back. |
| VO-02 | P3 | VP-05 (refund) also asks for a date and phone number, because the required-details rule applies to every reply. | field run | OBSERVATION | Consider skipping booking asks for refund/cancellation drafts. |
| VO-03 | P3 | Experiment metric "system waiting time" rounds each trial to whole seconds, so sub-second trials sum to 0 s. | field run (experiment metrics) | OPEN | Sum milliseconds, then round. Field timings use exact ms from trial timestamps, so the comparison isn't affected. |
| VB-01 | — | Real Google Chrome QA. | validation | **BLOCKED** | `dl.google.com` gets a 403 from the proxy in this container, and no HTTP response from a fresh container in the same (only) environment. Not substituted with Chromium. |
| VB-02 | — | Live Gmail certification. | validation | **BLOCKED** | Needs (1) a Google OAuth integration client entered by the owner in Flowline's admin panel (masked) and (2) the owner signing in to a dedicated test Gmail through Flowline's consent screen. Neither is available to the agent, and credentials must not be collected or injected via `.env` or the DB. The session's own Gmail connector is the owner's mailbox, not a dedicated test account connected through Flowline, so it was **not used**. |
| VB-03 | — | Competitor runs (Gumloop, Relevance AI/Sintra, Make). | validation | **BLOCKED** | Hosts unreachable from both containers; no authorised accounts. See `COMPETITOR_RESULTS.md`. |
| VF-03 | P2 | **"Active" could be read as live email handling.** Company Builder has no live Gmail read/send (traced: manual trigger → local steps → local outbox → kv record). An activated task showed "Active" with no reasons, and a connected Gmail marker changed nothing visible. | validation path trace | FIXED (final candidate `29db174`) | State contract: every installed state of a task that needs an account carries `sample_only_not_live` ("Sample data only… connecting Gmail alone won't change that"). The plan shows `cb-live-not-available`, activation shows `cb-activation-sample-only-*`, and the outbox says "No email was sent". Unit (all states; AI-only excluded), integration (no connection vs connected marker → identical sample-only behaviour, trial + record, resume, activation stays local, no integration step ran) and E2E. Live wiring is NOT implemented; see VALIDATION_REPORT §2 (capability gap and proposal). |
| VO-04 | P3 | VP-06 (cancellation) also quotes the refund-policy line: same topic, off-request. | separate reviewer | OBSERVATION | — |
| VO-05 | P3 | VP-06 asks for a phone number before a cancellation; the packet lists phone as required "before booking". Unscored. | separate reviewer | OBSERVATION | Same root cause as VO-02. |
| VO-06 | P3 | The record's `topic: "refund"` labels a cancellation request (cancellations share the refund topic). | separate reviewer | OBSERVATION (cosmetic) | — |

### Fable bug review of the final candidate `29db174` (read-only, run in parallel with the final gate)

| ID | Sev | Finding | Status | Fix proposal |
|---|---|---|---|---|
| FB2-01 | P1 | **Long approved information breaks plan generation.** The draft step embeds the approved text plus fixed literals; the expression passes `EXPRESSION_MAX_LENGTH` (4000) at about 1,050 characters of approved info. The interview allows 1,200, so the plan fails (422 BLUEPRINT_INVALID, shown as "Something went wrong") with no hint. **Confirmed by measurement:** 1,000 chars → 3,973; 1,100 → 4,086; 1,200 → 4,200. | CONFIRMED, OPEN (next round) | Move the approved lines out of the draft expression into a separate data step, or cap `cust_info` at a length proven to compile, with a clear message. Add a unit test compiling with 1,200 chars. |
| FB2-02 | P2 | **Rejecting a stale activation request "pauses" an ACTIVE task while its flow stays published.** Two activation requests from two accepted trials: approve the second (active, published), then reject the first → activation becomes `paused/activation_rejected` without unpublishing. Reconcile and delete then miss it. | REPORTED (code-read repro), OPEN | On reject, never change an active task (`ne(state,"active")`), or act only when `reviewItemId` matches. Invalidate other pending activation items on approval. Add an integration test. |
| FB2-03 | P3 | A numeric alias from "24/7 …" (`"24"`) matches dates and phone numbers → wrong service detected, and the evaluator agrees. | REPORTED, OPEN | Aliases must contain a letter; detect services on word starts in date-free text. |
| FB2-04 | P3 | The forced sample flag is bypassed when client input has no `request` object (`{}`, `{request:"x"}`). | REPORTED, OPEN | Reject trial input whose `request` isn't an object. |
| FB2-05 | P3 | The same trial key submitted concurrently can enqueue an orphan second run (the trial row is deduplicated, the run isn't). The existing test asserts on `cb_trial` only. | REPORTED, OPEN | Insert the trial row (or take an advisory lock) before enqueueing. Add a test asserting on `run`. |
| FB2-06 | P3 | Six follow-up check ids (and the operations/lead pack ids) have no copy, so raw `trial.check.*` keys show under Technical details (same class as EX-01). | REPORTED, OPEN | Add AR/EN copy; extend the copy-coverage unit test to every pack check id. |
| FB2-07 | P3 | "Uses sample data until you connect your account" sits right above the VF-03 notice and still implies that connecting enables live handling. | REPORTED, OPEN | Reword: "Uses sample data." |
| FB2-08 | P3 | `pauseTask` returns 500 for a malformed installation id (missing UUID guard). | REPORTED, OPEN | Add the UUID guard → 404. |
| FB2-09 | P3 | An expired pending review still shows "Waiting for a decision" with no action or reason. | REPORTED, OPEN | Show an "expired" state. |
| FB2-10 | P3 | The Refine button's disabled reason uses generic error text; interview delete has no busy/error handling (a double click causes an unhandled 404). | REPORTED, OPEN | Specific disabled reason; busy state on delete. |

### Round R4 resolution of FB2-01..10 (code `62dac3f` on top of `64d9e00`; the rows above are kept as reported)

Old-code regression output: `artifacts/company-builder/round-r4/` (each test was run against the code before its fix and failed as shown there).

| ID | R4 status | Severity after reproduction | Fix | Regression evidence |
|---|---|---|---|---|
| FB2-01 | **FIXED** | P1 confirmed (plan generation failed at ≥1,050 units) | Approved lines and services moved out of the draft/extract expressions into a chain of `transform.json` data steps ("facts", each ≤3,950 chars, at most 24). Expressions only reference the data. The 1,200 limit (unit: JavaScript string length = UTF-16 code units, same in interview, UI, API, planner) and `EXPRESSION_MAX_LENGTH` 4000 are unchanged; nothing is truncated or dropped. Input that would still not fit is refused with `APPROVED_INFO_TOO_LONG` / `APPROVED_INFO_TOO_COMPLEX` instead of a generic error. | `tests/unit/cb-fb2-01-approved-length.test.ts` (950/1050/1100/1200 in English, Arabic, mixed, quotes/backslashes/line breaks; 1,201 refused; 300 random inputs; worst-case escaping; every line quoted). Integration at 1,200 through the real services (interview, resume after refresh, plan, install, worker trial). Old code: 12 failed. |
| FB2-02 | **FIXED** | P2 confirmed (a stale reject paused an active, still-published task) | Reject/invalidate/execute-failure only change an activation the review item owns and that isn't active; a successful activation marks other pending activation requests `invalidated` (`superseded`), keeping history. | 7 integration tests: core defect, supersede, reject-first, stale approval refused, duplicate/concurrent decisions, expired request (409), owned reject; worker-visible flow stays published. Old code: 4 failed (core: state `paused`). |
| FB2-03 | **FIXED** | P3 confirmed | Aliases need a letter and match at word starts. | `tests/unit/cb-fb2-03-numeric-alias.test.ts`. Old code: 3 failed. |
| FB2-04 | **FIXED** | P3 confirmed | Trial input without a `request` object is rejected with 400 before anything is enqueued; the sample flag is always forced. | Integration: 7 malformed shapes → 400, 0 trials, 0 runs, 0 records. Old code: failed. |
| FB2-05 | **DISPROVED** | — | None needed: run creation already deduplicates on `triggerRef` `cb-trial:<key>`. | Integration: 6 concurrent same-key trials → 1 trial, 1 run, 1 draft execution, 1 record, 0 outbox, ≤1 usage event; a retry returns the existing trial. Passed on old code too (kept as a guard). |
| FB2-06 | **FIXED** | P3 | AR/EN copy for every pack check id. | Unit copy-coverage test iterating every pack's checks. |
| FB2-07 | **FIXED** | P3 | No Company Builder copy says or implies that connecting an account turns on live email. Brief-locked sentences stay verbatim (`connectionNeeded`, `review.uncertain`); the meaning is added beside them (`connectionSampleOnly`, `review.uncertainSampleOnly`). "Needs a connection" gives way to `sample_only_not_live` in task status. Consistent meanings: "Sample data only", "Local outbox only / test outbox", "No email sent", "Live Gmail wiring not implemented". | Unit copy contract (verbatim sentences kept), VF-03 state unit tests, E2E plan text (`not.toContainText("until you connect")`). |
| FB2-08 | **FIXED** | P3 confirmed (500) | UUID guard in `pauseTask` → 404. | Integration (HTTP and service): 4 malformed/unknown ids → 404. Old code: 500. |
| FB2-09 | **FIXED** | P3 | Pending-past-expiry and server-retired expired items show "Expired" with their own explanation. | Unit `reviewState` + AR/EN copy. Not exercised in E2E (needs clock control). |
| FB2-10 | **FIXED** | P3 | Refine shows "Finish the interview and prepare the plan first"; delete has a busy state, shows failures, and treats 404 as already deleted. | New E2E (failing delete shown, double click harmless, no page errors). The E2E is new, so it has no old-code run. |

**Independent read-only review of the R4 diff (`203fd88..79565e1`, a Fable subagent, given no preferred conclusion).** It found no P1 and confirmed that the FB2-01/02/03/04/08/10 fixes do what they claim. Its findings:

| ID | Sev | Finding | Status | Evidence |
|---|---|---|---|---|
| R4-RV-01 | P2 | An activation request that expired without a decision left the task in "Approval required" with no Request or Pause button. The inbox said "Expired", but the task card couldn't reach a new request. | **FIXED `f74285c`** | The task shows `activation_request_expired` and can be requested again. Deciding or re-requesting releases the activation record the expired item owns (`failed/review_expired`, owned-only, never an active one). 2 integration tests; old code (`ab6daef`): 2 failed (`round-r4/review-followup-on-old-code-ab6daef.txt`). |
| R4-RV-02 | P3 | The pending-review count included expired items. | **FIXED `f74285c`** | Covered by the integration test above (count 1 → 0 after expiry). |
| R4-RV-03 | P3 | `paramIssues` didn't check each facts step. One line of 6-character escapes, sent through the API, produced a generic expression error instead of `APPROVED_INFO_TOO_COMPLEX`. | **FIXED `f74285c`** | Unit test; failed on old code. |
| R4-RV-04 | P3 | The `connection_missing` suppression is provider-blind. It is correct for current packs (Gmail only), but a future task with two non-AI providers would lose the setup hint. | OPEN (latent; no current pack affected) | Filter per connection in `setupReasons` when a second provider pack exists. |
| R4-RV-05 | note | `input: null` on a trial is now a 400 (it used to fall back to the pack sample), as FB2-04 intends. Installations compiled before R4 keep their old `draft` expression until they are reinstalled (`packVersion` unchanged). | RECORDED | Runbook note: reinstall to get the FB2-01 layout. |

Confirmed OK by the reviewer:

- prototype gate (404 for non-founders; LAN fails closed);
- non-member 404;
- reviewer-only judgement;
- review binding and dedupe;
- install idempotency;
- no Arabic-Indic digits in the catalogue;
- AR/EN key parity;
- migrations 0020–0022 match `schema.ts`.


### Gate tooling — `pnpm gate` / `pnpm gate:full` (owner decision 2026-10-01: two tiers)

Measured on this 4-CPU cloud container (summaries in `round-r4/gate-tiers/`):

| Run | Config | Wall | Result |
|---|---|---|---|
| sequential gate (old way) | one step at a time | ≈20 min | (see `gates-final-f74285c/`) |
| `pnpm gate` (fast) | static ∥, integration 4 shards ∥ build → 3 stacks, Chromium `@critical`/`@cross-browser` 3 shards | **3m17s** | PASS (62/62) |
| `pnpm gate` (fast) | same | 3m16s | FAIL: 1 `ECONNRESET` on sign-in (GATE-01) |
| fast browsers only ×4 | build, stack, Chromium | 85–87 s each | 4/4 PASS |
| `pnpm gate:full`, projects sequential, shared 3 stacks | — | 9m45s | PASS (128 + 62 + 62) |
| `pnpm gate:full`, 3 projects at once on 7 disjoint stacks | — | 8m41s | PASS |
| same, again | — | 8m38s | FAIL: Company Builder journey 10 s wait timed out (load) |
| same + integration overlapping browsers, 4 stacks | — | 8m37s | FAIL: same journey in Firefox (load) |

| ID | Sev | Finding | Status |
|---|---|---|---|
| GATE-01 | P3 | One `ECONNRESET` on `POST /api/auth/sign-in/email` (e2e/ai-hub.spec.ts:28) on the default stack while 3 stacks ran Chromium shards. The stack logged no error. Seen 1 time in 7 fast-tier browser runs. Suspected keep-alive socket reuse racing the server's idle close under load; not root-caused. | OPEN — a flaky run is a failing gate; rerunning to green is not a fix |
| GATE-02 | — | Running all three browser projects at once on 4 CPUs is load-flaky (10 s waits time out). | DESIGN: `gate:full` runs projects at once only on ≥8 CPUs; below that, one after another (each split over stacks). |

Integration sharding also exposed a test-order dependency (`tests/integration/ai-hub.test.ts`, "legacy local configuration"): its claim loop processed agent runs other files had left queued, which called the AI double. Fixed test-side by processing those runs and resetting the double first; the "no chat call" assertion is unchanged. Sharded integration: 534/534 in 66–93 s (was 190 s).
