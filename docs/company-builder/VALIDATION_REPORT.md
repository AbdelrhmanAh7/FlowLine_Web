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
| R3 | see §6 | VF-03 (honest "active" state) | affected gates re-run, §6 |

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
| **B. Live integration (Gmail)** | **BLOCKED** | (1) Company Builder has no live read/send wiring (§2). (2) No dedicated test Gmail account or operator OAuth client is available to the agent; credentials must not be collected or injected. **Owner action:** decide on the §2 proposal; enter the integration OAuth client in Flowline's admin panel; give one consolidated approval naming the dedicated sender, the allowlisted recipients, the test marker label, the max outbound count, the read scope (marker-labelled messages only) and the cleanup actions. |
| **C. AI / owner CLI** | **NOT EXERCISED** (real CLI BLOCKED as before) | No real CLI or model run was authorised or available. |
| **Real Google Chrome QA** | **BLOCKED** | No Google Chrome binary in this container or in the Playwright image (only Chromium/Firefox/WebKit builds). `dl.google.com` is refused (403) here, and a fresh container in the same and only environment got no response. Not retried further and not substituted. **Owner action:** allow `dl.google.com` for the environment and confirm a fresh container reaches it, or run the QA on a laptop with Chrome. The Chromium screenshots under `v2-first-slice/exploratory/` and `flowline-field/` are automated evidence, **not Chrome QA**. |
| **Competitors** | **BLOCKED / NOT TESTED** | See `COMPETITOR_RESULTS.md`: hosts unreachable from two containers; no authorised accounts. |
| **Human usability** | **NOT RUN** | — |

## 6. Gates per round

GATES_PLACEHOLDER

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
