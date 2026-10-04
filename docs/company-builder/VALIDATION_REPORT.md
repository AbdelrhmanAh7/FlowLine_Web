# Company Builder — validation sprint report (run `20261001-d224cfb`)

Scope: validate the existing **Customer Request Follow-up** slice (pack A). No new Company Builder capability was added.
Bounded fixes were made only for confirmed findings, and each is recorded as a new round. Packs B–D were not touched.

**Competitive verdict: INCONCLUSIVE / BLOCKED.** No competitor and no live integration could be exercised. This is
not a claim that Flowline lacks or has an edge.

Evidence: `artifacts/company-builder/validation/20261001-d224cfb/`. Findings: `artifacts/company-builder/BUGS.md`,
section "Validation sprint".

## 1. Tested-code equivalence (`1fe3d31` → `d224cfb`)

**Proven, and limited to that range.** The two commits after `1fe3d31` change only `*.md` files and `artifacts/**`:
`git diff --quiet 1fe3d31 d224cfb -- . ':!*.md' ':!artifacts/**'` exits 0. Git tree hashes are identical for:

- source and tests: `src/`, `tests/` (fixtures included), `e2e/`, `scripts/`, `worker/`;
- migrations: `drizzle/`;
- dependencies and configuration: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`,
  `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `drizzle.config.ts`.

The repo has no `public/` directory. The only gate that reads `artifacts/` is the evidence-secrets scan, which was run
on `d224cfb` with 0 hits. The `1fe3d31` gates therefore apply to `d224cfb`'s executable content.

**After `d224cfb`, runtime code changed again** (validation fixes), so `d224cfb` is no longer the candidate:

| Round | Candidate | Change | Gates |
|---|---|---|---|
| R1 | `ec35061` (= `d224cfb` code + frozen packet) | — | the `1fe3d31` gates, by proven equivalence |
| R2 | `dd9984f` | VF-01 (price of the requested service) | full gate re-run, §6 |
| R3 (superseded) | `20e4370` | VF-03, first part (active state only) | partial: lint/typecheck, unit 616, integration 520. Superseded before its browser gates; logs kept in `gates-20e4370/` (SUPERSEDED) |
| **Final** | **`29db174`** (frozen; `c8792d3` and later add evidence/docs only, with an identical execution tree) | VF-03 state contract completed | **one final sequential gate**, §6 |

Results from different rounds are reported separately and never combined.

## 2. Implemented path (traced, not inferred)

**Rules-only, sample track — the only track that exists in this build:**

| Stage | What runs | Where |
|---|---|---|
| Source | Manual trigger with a request JSON: the labelled pack sample, or client-supplied input forced `sample: true` | `trials.ts` `startTrial` |
| Extraction | `transform.json` (JSONata), local | `packs/customer-follow-up.ts` |
| Draft | `transform.json`: approved lines + fixed templates, local | same |
| Reviewer approval | Review item bound by hash to the trial, reviewer role and content; named reviewer only | `reviews.ts` |
| Action | **Insert into `cb_sample_outbox`** (mocked integration; nothing leaves Flowline) | `reviews.ts` `execute` (via `decideReview`) |
| Follow-up record | `data.store` → workspace `kv_entry`, keyed `<session>/<sample:>request id` | worker `data.store` handler |
| Activation | Publishes the manual-trigger draft. No schedule, no webhook, no account access | `reviews.ts` `activate` |

**State contract (VF-03, final candidate):**

- Every installed state of a task that needs an account says "Sample data only: Company Builder doesn't read or send
  email in this version, and connecting Gmail alone won't change that".
- The plan, the activation control and the test outbox say the same: "No email was sent".
- A connected Gmail marker and no connection behave identically: sample trial, follow-up record, local outbox, a
  manual workflow with no integration step. This is covered by unit, integration and E2E tests.

**Gap: live read/send is NOT wired into Company Builder.** Flowline has a general Gmail integration
(`src/integrations/providers/gmail.ts`: `gmail.search_messages`, `gmail.get_message`, `gmail.send`, used by other
workflow templates). Company Builder only records Gmail as a *needed / missing* connection on the plan. No pack step
reads or sends mail, and approval writes only to the local outbox. The adapter's existence is **not** evidence that
Company Builder uses it.

**Bounded implementation proposal** (NOT implemented; needs an owner decision, plus the operator OAuth client in the
admin panel):

1. **Live source.** An `integration.action` step `gmail.search_messages` with a fixed label (e.g. `flowline-test`)
   and `newer_than`, then `gmail.get_message`, mapped to the existing request contract (`id`, `from`, `subject`,
   `body`, `received_at` from `internalDate`). Used only when the connection is active; sample trials keep refusing
   non-local steps.
2. **Live action.** When a `send_sample`-type review item is approved for a *live* task, call `gmail.send` through the
   existing integration runner, with the binding re-checked and the review-item id as the idempotency key. Store the
   provider message id. "Uncertain" outcomes are verified via the Sent folder before any retry.
3. **Connection lifecycle.** Revoked or expired Gmail → the task becomes paused or degraded with
   `connection_missing`, and activation is refused while it's missing. Reconnecting never auto-sends pending items;
   they need re-approval.
4. **Tests.** Contract tests against the Gmail fake (`e2e/fakes/provider-server.ts`), integration tests for idempotent
   send and revocation, then the live certification checklist below with a dedicated test account.

Rough size: 1 pack step + 1 action executor + lifecycle rule + tests. It's a new capability and needs its own approval.

## 3. Track A — sample / rules-only (the only track exercised)

Frozen packet: `packet/packet.json`, sha256 `4fa9841b…`, committed in `ec35061` before any product ran. It is split,
by derivation only, into:

- `participant-input.json`: business facts, approved policies and requests;
- `evaluator-ground-truth.json`: expectations, invariants, prohibited outcomes and scoring rule.

Flowline was set up only from participant fields. The expectations are read only by the scorer
(`flowline-field/field.spec.ts`).

**Operator and assistance:**

- The operator was an AI agent (the implementer, with maximal familiarity), driving the real HTTP API of the
  production-build test stack.
- It answered **only the questions the product asked**, from participant data, until the product stopped asking.
- This is **expert-assisted, not novice self-service**. Times are machine times, **not** human setup time.

**Scoring:**

- Strict, against the evaluator file only. Flowline's own evaluator verdict is recorded separately and never counted.
- Deterministic fields (recipient, service, date, phone, missing details, follow-up instant, outcome type, human
  decision flag) are matched exactly.
- Wording is checked via the packet's evaluator hints, applied literally for this automated scorer.

| Round | Candidate | Strict score | Failures | Flowline's own verdict disagreed? |
|---|---|---|---|---|
| R1 | `ec35061` | **8/10** | VP-03: quoted the *deep-cleaning* price for an Arabic office-price question (**VF-01**, real defect). VP-06: literal hint "cancelled" matches the approved policy line (**VF-02**, packet ambiguity). | Yes — Flowline's own checks passed all 10, including the wrong VP-03 |
| R2 | `dd9984f` | **9/10** | VP-06 (VF-02, kept as FAIL) | No |
| Final | `29db174` | **9/10** | VP-06 (VF-02, disputed fixture, kept as FAIL) | No |

**Honesty notes on the field result:**

- Runs 2 and Final **reused the same frozen packet** after a defect found by that packet was fixed. They are **not** a
  fresh held-out evaluation, and not customer validation.
- **VP-06 is a disputed fixture expectation.** A separate reviewer (a Fable subagent in this session, read-only, given
  no preferred conclusion) judged it **FAIL under the scoring rule as written** and the expectation itself
  **ambiguous/defective**. That reviewer is not a human or an external party. The strict score keeps it as FAIL.
- Participant input and evaluator-only answers are kept in separate files. No product was given the evaluator file.

Other observations:

- **Review boundary (R1, R2):**
  - Nothing reached the outbox without approval: 0 before, 0 after requesting review.
  - The refund item was pending and labelled `refund_or_cancellation`.
- **Changed answer (FC-3):** the office price changed from 900 to 950.
  - Both rounds created a new plan version needing review, with a field-level diff (`params.approvedInfo`).
  - R1: the reply never quoted 950 (VF-01).
  - R2: it quoted 950 and never 900.
- **Missing credential (FC-1):** the plan shows "Needs Gmail connection" and "Uses sample data until you connect your
  account". The trial ran on labelled sample data.
- **Failed external action (FC-4):** **not testable**; no live action exists (§2).
- **Behaviour notes:** VO-01 (a confirmation-only reply when nothing is missing) and VO-02 (refund drafts still ask for
  date/phone) are correct but weak. VO-03: the experiment metric rounds waiting time per trial.

## 4. Flowline metrics (R2 `dd9984f`, agent-driven)

| Metric | Value | Note |
|---|---|---|
| Active user setup time | **NOT MEASURED** (no human) | Machine time for interview + plan: 1.1 s |
| System waiting time | ≈0.34 s per sample trial (10 trials) | From trial timestamps; the experiment metric shows 0 s (VO-03) |
| Questions asked by the product | 13 until it stopped | A complete plan is possible after the 6 essentials (outcome, situation, channel, reviewer, details; the first free-text answer) |
| User corrections | 1 (FC-3, deliberate) | — |
| Time to first objectively correct result | 2.4 s machine time from start | Not a human measure |
| Support interventions | 0 | — |
| Execution / API cost | AI: none (rules only, 0 reported). External: none (sample). Platform charge: not measured in sandbox | — |
| Accepted / rejected | 0 / 0 judged | The person's acceptance is a human judgement; the agent did not fake it |
| Errors / retries | 0 run errors; 1 deliberate duplicate run (same record updated, no duplicate) | — |

## 5. Other tracks

| Track | Status | Exact reason / owner action |
|---|---|---|
| **B. Live integration (Gmail)** | **BLOCKED** — three separate conditions: **(a) capability:** Company Builder has no live read/send wiring (§2); **(b) prerequisites:** no dedicated test Gmail account and no operator OAuth client available to the agent (credentials must not be collected or injected; the owner's personal Gmail connector was not used); **(c) verification:** therefore not run |  **Owner action:** decide on the §2 proposal; enter the integration OAuth client in Flowline's admin panel; give one consolidated approval naming the dedicated sender, the allowlisted recipients, the test marker label, the max outbound count, the read scope (marker-labelled messages only) and the cleanup actions. |
| **C. AI / owner CLI** | **NOT EXERCISED** (real CLI BLOCKED as before) | No real CLI or model run was authorised or available. |
| **Real Google Chrome QA** | **BLOCKED** | No Google Chrome binary in this container or in the Playwright image (only Chromium/Firefox/WebKit builds). `dl.google.com` is refused (403) here, and a fresh container in the same and only environment got no response. Not retried further and not substituted. **Owner action:** allow `dl.google.com` for the environment and confirm a fresh container reaches it, or run the QA on a laptop with Chrome. The Chromium screenshots under `v2-first-slice/exploratory/` and `flowline-field/` are automated evidence, **not Chrome QA**. |
| **Competitors** | **BLOCKED / NOT TESTED** | See `COMPETITOR_RESULTS.md`: hosts unreachable from two containers; no authorised accounts. |
| **Human usability** | **NOT RUN** | — |

## 6. Gates per round

| Gate | R2 `dd9984f` (historical) | **Final `29db174`** |
|---|---|---|
| Lint + typecheck | ✓ | ✓ |
| Secrets scan | 0 hits | 0 hits |
| Unit | 615/615 | **617/617** |
| Contract | 467/467 | **467/467** |
| Integration | 520/520 | **521/521** |
| Field run (frozen packet, strict) | 9/10 | **9/10** |
| E2E Chromium (1 worker) | 127/127 | **127/127** |
| E2E Firefox (1 worker) | 62/62 | **62/62** |
| E2E WebKit (1 worker) | 62/62 | **62/62** |

**Final gate identity** (`gates-final-29db174/identity.txt`, `progress.log`):

- Candidate: `29db174e4fce2671a35d75b73c59033174e64340`.
- The working-tree HEAD when the gate started was `c8792d3`, and the server was built at `42ae9b8`. Both are
  evidence/docs commits on top of the candidate, and the execution tree was verified equal to the candidate
  (`git diff` excluding `*.md` and `artifacts/**` is empty; dirty count 0).
- Next build id `4HU5MH2v16814gYjQaHTQ`.
- The suites ran strictly one after another, 08:44 → 09:04 UTC on 2026-10-01; logs and output directories are kept.

**R2 isolation:** the `dd9984f` browser runs completed with exit 0.

- `lifecycle.ts` and the i18n copy were edited at 08:23, during the Chromium run.
- The server was a prebuilt bundle, and `lifecycle.ts` is imported only by `overview.ts` (in that bundle).
- The worker's dynamic imports don't reach the changed files, and the specs import nothing from `src`.
- The spec edit came after WebKit ended (08:35).

R2 therefore stays valid as **R2 evidence for `dd9984f` only**.

**Fable bug review of the final candidate** (read-only, in parallel with the gate): FB2-01 (P1, confirmed: approved
information over ~1,050 characters breaks plan generation), FB2-02 (P2), and FB2-03..10 (P3). All are **OPEN** for
the next round; see BUGS.md.

## 7. Old benchmark (v1, frozen) — classification of the five failures

The v1 expectations and results are preserved unchanged (`v2-first-slice/benchmark-v1-rescored.json`, 7/12, 0
violations). Benchmark v2 (frozen before the planner change) is separately versioned, with its rationale in
`benchmark-v2.ts`. All five v1 failures were rechecked on the current planner:

| Case | Failed dimension | Actual now | Classification |
|---|---|---|---|
| B01 solo founder (AR) | task selection: expected `customer-triage` + `customer-answers` agent | `customer-follow-up` workflow, 0 agents; answers agent listed as a next improvement; complete ✓, questions 9 ✓ | **Superseded** by the owner-approved direction (2026-09-30): one primary workflow, zero agents by default |
| B06 unsupported tools (AR) | task selection (same) | follow-up; `channel_not_supported` ✓ and `tool_not_supported` (Shopify, WhatsApp) ✓; complete ✓ | **Superseded** (same change); disclosure preserved |
| B08 contradiction (AR) | task selection (`customer-triage` id) | follow-up; `fact_contradictory` ✓; incomplete ✓ | **Superseded** (pack replaced); behaviour preserved |
| B10 multi-department (AR) | task selection + questions (finance/content asked and installed) | follow-up only; finance/content listed as next improvements; their questions are no longer asked; `approved_info_missing` ✓; `paper_needs_digital_copy` not shown because finance isn't planned | **Superseded** by "one primary outcome; other areas are next improvements without questions". The paper-invoice disclosure applies when finance becomes the primary outcome. |
| B11 injection (EN) | task selection (same as B01) | follow-up; valid plan; 0 agents; injection text stays data | **Superseded**; safety preserved |

**Genuine regressions: 0. Unresolved: 0.**

## 8. Observed differences under the tested conditions

| Measure | Result |
|---|---|
| Setup-time difference | **NOT MEASURABLE**: no competitor run, no human Flowline run |
| Cost difference | **NOT MEASURABLE**: no competitor run. Flowline's sample track used no AI and no external service; platform charge not measured |
| Result-quality difference | **NOT MEASURABLE**: no competitor output. Flowline alone: 9/10 strict on R2 (8/10 on R1), with the remaining failure a packet ambiguity |
| Competitive verdict | **INCONCLUSIVE / BLOCKED** |

## 9. What would make the next round decisive

1. Real Chrome and the competitor hosts must be reachable, and you set up the accounts (free tiers; no card or
   auto-renew without approval).
2. One human participant per product, novice self-service, with the same participant packet and the moderator only
   timing. Then a second, expert-assisted round, recorded separately.
3. Compare like with like: Flowline's track A against competitors run on the same synthetic requests, without live
   sending. Live email delivery is compared only after §2 is approved and built, in track B, on both sides.
4. Repeat each matched comparison at least twice and keep every attempt.

## 10. Round R4 — correctness repair (2026-10-01)

**Scope.** Fix the Fable review findings on `29db174` (FB2-01..10) and the findings of an independent review of that
fix. Base reference `203fd88`. No new capability, no live wiring; packs B–D untouched; the frozen packet and the
evaluator ground truth were not edited. Sections 1–9 above are kept as they were and still describe their own rounds.

| Commit | Content |
|---|---|
| `64d9e00` | FB2-01..05 (code) |
| `62dac3f` | FB2-06..10 and the sample-only copy contract |
| `f74285c` | Review follow-up: an expired activation request no longer strands a task; the pending count ignores expired items; per-step limit in `paramIssues` |
| `3aa2c17` | Test-only: PRE-02 e2e race (removed the online blip in `e2e/failures.spec.ts:97`) |

Per-finding facts: `artifacts/company-builder/BUGS.md`, sections "Round R4 resolution of FB2-01..10" and
"Independent read-only review of the R4 diff". Old-code regression output: `artifacts/company-builder/round-r4/*.txt`.

### 10.1 Findings

| ID | Severity | R4 status | Evidence |
|---|---|---|---|
| FB2-01 | P1 | **FIXED** | `tests/unit/cb-fb2-01-approved-length.test.ts` + integration at 1,200; `round-r4/fb2-01-regression-on-old-code-203fd88.txt` (old code: 12 failed) |
| FB2-02 | P2 | **FIXED** | 7 integration tests; `round-r4/fb2-02-regression-on-old-code-203fd88.txt` (old code: 4 failed) |
| FB2-03 | P3 | **FIXED** | `tests/unit/cb-fb2-03-numeric-alias.test.ts`; `round-r4/fb2-03-regression-on-old-code-203fd88.txt` |
| FB2-04 | P3 | **FIXED** | integration (7 malformed shapes → 400, nothing enqueued); `round-r4/fb2-04-05-on-old-code-203fd88.txt` |
| FB2-05 | P3 (reported) | **DISPROVED** | run creation already deduplicates on `triggerRef`; 6 concurrent same-key trials → 1 trial, 1 run, 1 record, 0 outbox; passes on old code too (`round-r4/fb2-04-05-on-old-code-203fd88.txt`), kept as a guard |
| FB2-06 | P3 | **FIXED** | unit copy coverage over every pack check id |
| FB2-07 | P3 | **FIXED** | unit copy contract, VF-03 state tests, E2E plan text |
| FB2-08 | P3 | **FIXED** | integration (4 malformed/unknown ids → 404); `round-r4/fb2-08-on-old-code.txt` (old code: 500) |
| FB2-09 | P3 | **FIXED** | unit `reviewState` + AR/EN copy (not in E2E; needs clock control) |
| FB2-10 | P3 | **FIXED** | new E2E (failing delete shown, double click harmless); new test, no old-code run |

**FB2-01 details.** Approved information moved out of the draft/extract expressions into chained `transform.json`
data steps (each ≤3,950 chars, at most 24). The 1,200 input limit and `EXPRESSION_MAX_LENGTH` 4000 are unchanged.
Nothing is truncated or dropped. Input that still would not fit is refused with `APPROVED_INFO_TOO_LONG` or
`APPROVED_INFO_TOO_COMPLEX` instead of a generic error.

**Length unit.** The 1,200 limit is measured as JavaScript string length (UTF-16 code units), the same in the
interview, UI, API and planner. It is not a count of visible characters; an emoji or other astral character counts
as 2.

**FB2-07 copy contract.** Sentences locked by the brief are kept verbatim. The sample-only meaning is added beside
them: "Sample data only", "Local outbox only / test outbox", "No email sent", "Live Gmail wiring not implemented".

### 10.2 Independent read-only review of the R4 diff

A Fable subagent reviewed `203fd88..79565e1`, read-only and given no preferred conclusion. It is not a human or an
external party. It found no P1.

| ID | Severity | Status |
|---|---|---|
| R4-RV-01 | P2 | **FIXED `f74285c`** (expired activation request stranded the task; 2 integration tests, old code `ab6daef`: 2 failed, `round-r4/review-followup-on-old-code-ab6daef.txt`) |
| R4-RV-02 | P3 | **FIXED `f74285c`** (pending count included expired items) |
| R4-RV-03 | P3 | **FIXED `f74285c`** (per-step limit in `paramIssues`) |
| R4-RV-04 | P3 | **OPEN (latent)**: `connection_missing` suppression is provider-blind; no current pack is affected |
| R4-RV-05 | note | RECORDED: `input: null` is now a 400; installations compiled before R4 keep the old `draft` expression until reinstalled |

### 10.3 Gates

Final gate on `f74285c`, sequential, one worker, 09:59 → 10:19 UTC (`artifacts/company-builder/round-r4/gates-final-f74285c/`;
`identity.txt` records head at start `375589b`, an empty exec-tree diff against the candidate, and a dirty count of 1).
The Chromium row for `3aa2c17` is a separate run and is not combined with the `f74285c` row.

| Gate | R4 final `f74285c` | Candidate `3aa2c17` (exec tree = `f74285c` + `e2e/failures.spec.ts` only) |
|---|---|---|
| Lint + typecheck | ✓ | not re-run (no source change) |
| Secrets scan | 0 hits | — |
| Unit | **646/646** | — |
| Contract | **467/467** | — |
| Integration | **534/534** | — |
| E2E Chromium (1 worker) | **127/128 — FAIL** (`failures.spec.ts:97`, PRE-02) | 128/128 (rc 0; `round-r4/gates-chromium-3aa2c17/`) (`round-r4/gates-chromium-3aa2c17/`) |
| E2E Firefox (1 worker) | **62/62** | — |
| E2E WebKit (1 worker) | **62/62** | — |
| Field run (frozen packet, strict) | **9/10** (run 4) | — |

The `f74285c` Chromium failure is recorded as a failure. It was not re-run into a pass on that SHA.

**PRE-02.** The intermittent `failures.spec.ts:97` failure (offline conflict) dates from phase 1. Cause: the test
briefly put the page back online while the other context saved. The fix (`3aa2c17`) keeps the page offline; it is
test-only. Evidence `artifacts/company-builder/round-r4/pre-02/`: before the fix, `--repeat-each=20` gave 2 failed,
18 passed; after the fix, 40/40 passed. The `3aa2c17` stack was built from `f74285c` source; the spec change is not
part of the build.

### 10.4 Field run 4

| Round | Candidate | Strict score | Failures | Evidence |
|---|---|---|---|---|
| R4 (run 4) | `f74285c` | **9/10** (same as run 3) | VP-06 (VF-02, disputed fixture expectation, kept as FAIL) | `validation/20261001-d224cfb/flowline-field/run4-r4-f74285c/` |

Same frozen packet as runs 1–3, so this is a regression check, not a held-out or customer evaluation.

**Follow-up (issue #6, 2026-10-04).** The six scoring and coverage gaps CodeRabbit found in this harness (policy text scored as a
cancellation promise, the approval side of the review gate, persisted records after the duplicate trial, the packet digest, a Friday
confirmation, and the owner-decision qualification in VP-05/VP-06) are fixed in a NEW harness and packet, version `20261003-v2`, under
`scripts/field-validation/v2/` ([README](../../scripts/field-validation/v2/README.md)). The runs above, the frozen packet and `VF-02` are not
rescored or edited. The v2 harness is covered by deterministic unit tests only; **no v2 run is recorded by that change**, so no v2 score exists yet.

### 10.5 Status and remaining blockers

**OVERALL COMPANY BUILDER: INCOMPLETE. LIVE GMAIL: NOT IMPLEMENTED / NOT VERIFIED. REAL CLI: UNVERIFIED.
COMPETITIVE EDGE: NOT YET PROVEN. DEPLOYMENT: NO.**

MERGE TO MAIN: requested by the owner 2026-10-01 — see final report.

Still blocked (unchanged from §5): real Google Chrome QA, live Gmail certification, real owner CLI, competitor runs,
human usability. Still open: R4-RV-04 (latent) and VO-01..06 (observations; VO-03 metric rounding is OPEN), see BUGS.md.
