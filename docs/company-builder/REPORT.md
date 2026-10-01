# Company Builder — implementation report (Milestones A, B, C)

Session: Claude Code cloud session, 2026-09-30. Brief: `docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md`.
Baseline: `main` @ 9324b1fed677f03e8c044eb1373b8577167abeb5. Branch: `claude/company-builder-milestones-abc-pmba6v`
(pushed to origin as a feature branch only — **not merged, no PR, not deployed**).

## Owner decisions 2026-10-01 — current status (candidate `1fe3d31` + docs)

The branch was pushed for preservation only (approved 2026-10-01; first push `8439f6f`, remote = local verified).
**No merge, deploy, production, invitations, live payments or force push.**

### Verdicts

| Verdict | Status | Basis |
|---|---|---|
| FIRST VERTICAL SLICE | **COMPLETE**, DETERMINISTIC_TEST with sample data | See the changes and gates below. |
| OVERALL COMPANY BUILDER | **NOT COMPLETE** | Packs B–D are unit-level only. Real Chrome QA, live Gmail, real CLI runs, human usability and the competitive test have not run. |
| BUSINESS RESULT QUALITY | Frozen fixtures **10/10**; follow-up pack tests **41/41**; benchmark v2 **12/12**; benchmark v1 **7/12** (direction change) | Deterministic generator only. The benchmarks were written by the implementer. Real customer requests: NOT TESTED. |
| AUTOMATED BROWSER GATE | **PASS**: Chromium **127/127** → Firefox **62/62** → WebKit **62/62** (sequential, one worker) | `artifacts/company-builder/gates-v3/e2e-*.txt` |
| REAL CHROME EXPLORATORY QA | **BLOCKED / NOT RUN** | `dl.google.com` was still refused by the proxy (403) after the owner's settings change, re-checked twice in this container. It probably applies to new containers only. The Chromium substitute evidence (`v2-first-slice/exploratory/`) is kept as **historical evidence and is not Chrome QA**. |
| LIVE GMAIL VERIFICATION | **NOT TESTED** | No connection or credentials; local sample outbox only. |
| COMPETITIVE HYPOTHESIS | **HYPOTHESIS READY TO TEST — COMPETITIVE EDGE NOT YET PROVEN** | Protocol ready; all 36 competitor rows NOT_TESTED. |

### Changes made for the owner decisions (`1fe3d31`)

1. **Refunds and cancellations always need a person.**
   - The draft quotes only the approved policy, adds a fixed no-promise note, and is flagged `refund_or_cancellation`.
   - The draft waits for the named reviewer; an editor gets 403.
   - Approving only puts the text in the local outbox. Billing is unchanged, and no money or account step exists.
   - Tests: unit REF-* (8) and integration REF.
2. **Digits 0–9 everywhere, Arabic UI included.** Formatters use `ar-EG-u-nu-latn`. Product-wide regression
   `latin-digits.test.ts`; the E2E Arabic page body is checked. Typed text is quoted as written.
3. **Phone numbers as written.**
   - Separators are joined only for "+" or leading-0 sequences of 9–13 digits; no country code is guessed.
   - The display form is kept as written.
   - Tests: unit PH-* (7) and integration PH through the real worker.
4. **Follow-up records per interview (beta blocker): FIXED and verified.** The key is
   `<session>/<sample:>request id`. The integration test covers two interviews, concurrent trials, retry, refresh and a
   new plan version: no overwrite and no duplicates.
5. **`pnpm stop:test`** now stops the stack in production mode too (ENV-04). It was verified to free :3100, :4010 and
   :4011.
6. **PRE-02** (phase-1 intermittent failure) did not reproduce in either full Chromium run (127/127 twice). It stays
   recorded and is **not claimed fixed**.

### Gates on `1fe3d31` (sequential)

| Gate | Result | Evidence |
|---|---|---|
| Lint | ✓ | — |
| Typecheck | ✓ | — |
| Evidence-secrets check | 0 hits | — |
| Unit | **612/612** | `gates-v3/unit.txt` |
| Contract | **467/467** | `gates-v3/contract.txt` |
| Integration | **520/520**, stack stopped | `gates-v3/integration.txt` |
| E2E | as above | — |

---

## Direction v2 — outcome first (2026-09-30 → 2026-10-01): **HYPOTHESIS READY TO TEST**

This direction follows the owner's product-direction amendment and its review correction. Commits are **local only**
(`816f342..HEAD`: `6afd2e4`, `0551271`, `18201ec`, `cb23ac4`, `2f03e2a`, `47d8807`, plus this docs commit). The
amendment authorises **no push, merge, deployment, live payment, invitation or destructive data operation**. The
competitive edge is **NOT YET PROVEN**.

### Separate verdicts

| Verdict | Status | Basis |
|---|---|---|
| FIRST VERTICAL SLICE (Customer Request Follow-up) | **COMPLETE** in DETERMINISTIC_TEST mode with sample data | See the evidence list below this table. |
| OVERALL COMPANY BUILDER SCOPE | **NOT COMPLETE** | Packs B–D are tested at unit level only (no browser journey). Open items: EX-02 digit style, FB-07 spaced phone numbers, FB-12 shared record namespace. Not yet run: real CLI runs, real Chrome QA, human usability, the competitive test, live Gmail. |
| OWNER CLI PROTOTYPE | **BLOCKED** (real CLIs), unchanged | Gate, adapter, controller and import are unchanged except that the text trial now targets the follow-up task (CB2-02). Tested with fake CLIs (int-cli 16/16). The CLI identity is never exposed; payment or ownership never grants it. |
| BUSINESS-RESULT QUALITY | **Frozen fixtures 10/10 (pack tests 25/25)**; benchmark v2 **12/12**; benchmark v1 **7/12** (direction change; v1 expectations unchanged) | Deterministic generator only. v2 was written by the implementer before the planner change: not independent. Real customer requests: **NOT TESTED**. |
| RESULT VERIFICATION | **Four separate signals** | (1) Structure is valid. (2) Ran without errors. (3) Objective checks: an independent full re-computation (FB-01). (4) The person's acceptance. Activation requires (3) **and** (4), at request and at execution. |
| AUTOMATED BROWSER GATE | **PASS** on `47d8807`: Chromium **127/127**, Firefox **62/62**, WebKit **62/62** (one worker each, one browser at a time) | `artifacts/company-builder/gates-v2/e2e-*.txt`. PRE-02 did not reproduce but stays OPEN (intermittent). |
| CHROME EXPLORATORY QA | **BLOCKED** (real Google Chrome); **substitute run** in Playwright Chromium (Arabic, Riyadh time zone, mixed input, desktop + 375 px) | `artifacts/company-builder/v2-first-slice/exploratory/` (+ `retest-47d8807/`). Found EX-01..03. Download of Google Chrome refused by the network policy (`dl.google.com`, 403). |
| LIVE EXTERNAL VERIFICATION | **NOT TESTED** | No Gmail connection was made. The test action writes to the local sample outbox. Simulated results are labelled "Local test outbox (nothing is sent externally)". |
| COMPETITIVE HYPOTHESIS | **NOT YET PROVEN** | `COMPETITIVE_TEST_PROTOCOL.md`; `competitive-dataset.json` has 36 rows, all NOT_TESTED. |
| INDEPENDENT REVIEW | **Fable review done**, plus a Sonnet helper diff reviewed by Claude; **Codex: NOT RUN** (not installed in the container) | 13 Fable findings (FB-01..13): 1 P1 and 4 P2, all fixed with regression tests; P3s fixed, disclosed or left open (BUGS.md). |

**Evidence for the first slice:**

- **Pack:** `customer-follow-up` v1 (behaviour revised before any release).
- **Frozen fixtures:** committed before the pack (`6afd2e4`). Run 1 scored 11/14 tests and is kept as evidence; the
  fixtures pass 10/10, and the full pack test file now passes 25/25, including the review regressions.
- **Integration:** 28 Company Builder tests, plus 2 new ones for acceptance and reviewer rules.
- **E2E journey** in Chromium, Firefox and WebKit: outcome-first interview → plan → draft → sample trial →
  human-readable result → rejection with a reason → acceptance → refresh → test action → activation → history.
- **Arabic / RTL:** E2E plus the exploratory pass.

### Gates on `47d8807` (sequential)

| Gate | Result | Evidence |
|---|---|---|
| Lint | ✓ | — |
| Typecheck | ✓ | — |
| Evidence-secrets check | ✓ (0 hits) | — |
| Unit | **593/593** | `artifacts/company-builder/gates-v2/unit.txt` |
| Contract | **467/467** | `gates-v2/contract.txt` |
| Integration | **517/517**, stack stopped | `gates-v2/integration.txt` |
| E2E | as above | — |

### What changed (summary)

- **Interview (question bank v2):**
  - starts from "What is the first result you want to improve?";
  - every question declares what its answer changes (unit-tested);
  - only the primary outcome's questions are asked; other areas become next improvements;
  - "I don't know yet", Back, Edit and Save are kept; no fake progress total.
- **Planner:**
  - one primary outcome, one role with what it doesn't do, zero agents by default;
  - automated / assisted / human split;
  - cost disclosure with explicit unknowns;
  - workspace time zone;
  - next improvements never installed (planner, install, CLI proposal and UI all checked).
- **Packs:** Customer Request Follow-up (A, first slice); operations summary (C) and lead qualification (D), built by
  Sonnet helpers and reviewed by Claude; invoice organisation (B) kept. `customer-triage` is kept for older blueprints.
- **Lifecycle:** objective checks and the person's acceptance are kept apart; the reviewer-only verdict uses migration
  `0022`.
- **Experiment mode (`FLOWLINE_CB_EXPERIMENT=on`):** metrics are computed on read; events hold only bounded numbers
  and enum ids. Definitions are in `COMPETITIVE_TEST_PROTOCOL.md`.
- **UI:** a plan section for each required item, with the required copy sentences; a human-readable result with an
  explicit time zone; technical details under Advanced; "Your company is running" never appears (E2E).
- **Docs:** `PRODUCT_DIRECTION.md`, `QUESTION_MODEL.md`, `TASK_PACKS.md`, `COMPETITIVE_TEST_PROTOCOL.md`,
  `competitive-dataset.json`; `COPY_REVIEW.md` v2 section; findings in `artifacts/company-builder/BUGS.md`.

### Defects found by this work (all in BUGS.md)

| ID | What went wrong | How it was found | Status |
|---|---|---|---|
| CB2-01 | jsonb key order made every real trial fail | integration | Fixed |
| CB2-05 | The date format crashed the page | E2E | Fixed |
| FB-01 | The evaluator trusted flow claims | Fable | Fixed |
| FB-02..05 | Various | Fable | Fixed |
| EX-01 | Raw ids shown on screen | exploratory | Fixed, retested |

**Open:**

- EX-02: mixed digit styles.
- FB-07: spaced phone numbers.
- FB-11: refund routing (owner decision).
- FB-12: shared record namespace.
- ENV-04: `stop:test` misses a production-mode stack.
- PRE-02: pre-existing.

### Budget

No billable execution: no paid APIs, no real CLI jobs, no credits, no billing activation. The session's dollar
consumption is not exposed to it (as in phase 1). Helper agents ran inside this Claude session: Sonnet for UI and
packs, Fable for review.

---

# Phase 1 report (Milestones A, B, C) — historical, unchanged

## Verdicts

| Verdict | Status | Basis |
|---|---|---|
| IMPLEMENTATION | **PASS** (Milestones A, B, C in DETERMINISTIC_TEST mode) | code + unit/contract/integration/E2E below |
| OWNER CLI PROTOTYPE — Claude CLI | **BLOCKED** | adapter, gate, controller, export/import built and tested with deterministic fake CLIs; no real Claude CLI job was run (the only login in the container belongs to this cloud session, not the founder's laptop) |
| OWNER CLI PROTOTYPE — Codex CLI | **BLOCKED** | Codex not installed in the container; official docs blocked by network policy; Codex flags unverified (preflight enforces them) and Codex is fail-closed until the operator verifies isolation |
| BUSINESS-RESULT QUALITY | **12/12 — PASS for the deterministic generator only**; CLI generators **BLOCKED** | frozen benchmark `tests/fixtures/company-builder/benchmark.ts`; report `artifacts/company-builder/gates-b2a3cf8/benchmark.json`. Expectations were written by the implementer (not independent) and frozen before the first scoring run; one planner rule (plans use confirmed departments only) was changed while writing case B09, before scoring. Small set — not proof of broad reliability |
| AUTOMATED BROWSER GATE | **FAIL** (Chromium 126/127: one pre-existing test race, PRE-02; Firefox 62/62; WebKit 62/62; Company Builder specs pass in all three) | see "Browser results" |
| CHROME EXPLORATORY QA | **BLOCKED** | no real Google Chrome / Codex computer-use in this container; cloud Chromium runs are automated E2E, not exploratory QA |
| PI VERIFIED | **NOT TESTED** | no Pi access |
| HUMAN USABILITY | **NOT RUN** | protocol ready in `OWNER_TEST_GUIDE.md` |
| CUSTOMER / PRODUCTION RELEASE | **NOT AUTHORISED** by this task | feature flag off by default |

## Budget ($250 grant)

- What could be verified: this session reports (via `get_session`) `rate_limit_info: { rateLimitType: "seven_day",
  status: "allowed_warning", isUsingOverage: false }`. The session runs under the account's plan rate limits, and
  **overage (metered credit) was not in use**. No dollar consumption figure is exposed to the session, so actual
  consumption of the $250 grant — or whether the grant applies to this session at all — **could not be measured**.
- No billable external execution was started: no paid API, no real CLI jobs, no credit purchase, no billing
  activation, no subscription change, no paid fallback. Docker images and npm packages were pulled from public
  registries (no charge).
- The session was near its seven-day rate-limit warning from the start. Work was checkpointed in frequent commits.

## React 19

Verified, not migrated: a single resolved `react@19.3.0` and `react-dom@19.3.0` across the tree (`pnpm ls -r`); Next
16.3.6 peer range `react ^18.2.0 || ^19.0.0`; no removed or deprecated APIs in `src` (`ReactDOM.render`,
`findDOMNode`, `useFormState`, string refs, `defaultProps`/`propTypes` on function components: none). SSR/hydration
exercised by the existing `hydration.spec.ts`/`prehydration.spec.ts` in the browser runs below. No version change.

## What was built

See `ARCHITECTURE.md`. In short:
- **A:** reviewed question bank (20 questions, 5 stages, conditions, reasons, sensitivity, don't-know), deterministic
  interview with inference-as-suggestion, contradictions, back/correction/resume, stop rule, honest partial plans.
- **B:** versioned blueprint model; 3 packs (customer triage, invoice organiser, content brief) compiled to registered
  local nodes with frozen business fixtures; recruitment planned only; idempotent, resumable installation creating
  real flows, a knowledge source and a bounded agent; sample trials through the real engine with three separate verdicts
  and provenance; plan versions with field-level diffs; manual edits preserved.
- **C:** task states; review inbox with binding hash recomputed at decision; local sample outbox as the authorised test
  action; uncertain-outcome verify-before-retry; development-trial entitlement separate from billing; activation =
  manual-trigger publication after its own review; worker reconciliation; owner-only CLI prototype (gate, envelope,
  adapter, controller, laptop export/import).
- UI: `/w/<slug>/company` (Arabic default, English), nav entry "فريقك الرقمي / Digital team".

## Tests and gates

Final revision `6bade3d` (`artifacts/company-builder/gates-6bade3d/non-browser-gates.txt`), run sequentially with
the test stack stopped:

| Gate | Result |
|---|---|
| lint | PASS |
| typecheck | PASS |
| check:evidence (secret scan) | PASS — 0 hits |
| unit | **535/535** (baseline 498 + 37 Company Builder incl. the 12-case benchmark) |
| contract | **467/467** |
| integration (real PostgreSQL, real worker code) | **513/513** (baseline 472 + 41 Company Builder: 25 core, 16 CLI boundary) |
| benchmark | **12/12**, 0 unauthorised actions / routing violations (deterministic generator) |

Earlier failing runs are kept, not replaced:
- Contract on `b2a3cf8` was 466/467. The failure is a pre-existing 1-in-256 flake in the webhook tamper tests
  (PRE-01), root-caused and fixed in `f84e44b`; log in `gates-b2a3cf8/contract-first-run-1-FAILED.log`.
- One Company Builder integration test failed from a test-scoping defect (a fixed `triggerRef` in a persistent DB),
  fixed before commit.
- The first Company Builder E2E attempt failed on a real UI remount race (CB-E2E-01), which is now fixed.

## Browser results

Final: revision `6bade3d`, production build `VXk5iDiRG64XnbiO2PBcX` (`next build` + `next start`, test stack,
`FLOWLINE_ENV=test`). Browsers from the official Playwright 1.63.0 Linux image, with host networking and **one worker,
run sequentially** (`e2e/tools/browser-docker.sh`). Retries 0. Reports: `gates-6bade3d/{chromium,firefox,webkit}-report.txt`
and `-results.json`.

| Browser | Result | Notes |
|---|---|---|
| Chromium (all specs) | **126/127** | 1 failure, `failures.spec.ts:97` (offline conflict). It is a pre-existing test race (PRE-02), root-caused with a DB check: no silent overwrite happened. It passed in the previous full run on the same SHA. |
| Firefox (@critical + @cross-browser) | **62/62** | baseline 59, plus 3 Company Builder tests |
| WebKit (@critical + @cross-browser) | **62/62** | baseline 59, plus 3 Company Builder tests |

**AUTOMATED BROWSER GATE: FAIL** (strict: 1 failure in Chromium, pre-existing and unrelated to Company Builder;
not re-run into a pass). Company Builder's own specs passed in all three browsers:
- Chromium 4/4: journey, isolation/CLI denial, Arabic RTL, keyboard + 375 px.
- Firefox and WebKit 3/3: the tagged tests.

Earlier invalid or failed browser runs are preserved in `gates-b2a3cf8/` and `gates-6bade3d/`:
- ENV-01: the TCP forwarder made clients non-loopback.
- ENV-02: the reconstructed `.env.test` lacked the egress allowlist.
- ENV-03: it also lacked the fake webhook URLs.
- One run was 126/127 on the billing spec for that reason.

These were cloud-environment problems, fixed in the runner/env, not in the product. Evidence screenshots, synthetic
data only (Arabic/English × 1440/375): `gates-6bade3d/screens/`.

The previously documented DV2-G01 (original cp28 WebKit timeout) remains OPEN. This WebKit pass does not explain it.

## Independent review

A separate Claude reviewer agent performed a read-only adversarial review of the diff at `51f1473`. It found no P0s,
6 P1s, 11 P2s and several P3s. All are listed in `artifacts/company-builder/20260930-51f1473/BUGS.md`: 6/6 P1 fixed,
P2s fixed except one found not reproducible (proven by a test), P3s fixed/partial/accepted as listed. The retest was
done by the implementer's automated tests, **not** by an independent re-tester. This is a same-model-family review, not
Codex and not a human, so a Codex re-test is still required.

## Environment notes (cloud container)

- PostgreSQL 16.14 (local cluster on :5433) instead of the compose image 17.6; Docker daemon started in the container
  for the code-sandbox tests and the Playwright image. `.env.test` is not in the repository, so it was reconstructed
  with fake values (git-ignored). It needed: the billing plans/secret matching the provider doubles,
  `FLOWLINE_EGRESS_ALLOWLIST=127.0.0.1:4010,127.0.0.1:4011`,
  `FAKE_STRIPE_WEBHOOK_URL`/`FAKE_PADDLE_WEBHOOK_URL=http://127.0.0.1:3100/api/billing/webhook`, and
  `FLOWLINE_COMPANY_BUILDER=on`. Add the last line to the owner's own `.env.test` to run the new specs.
- Baseline before any change: lint, typecheck and unit 498/498 passed; contract 467/467 passed. Integration was
  472/472 once the environment was fixed (the 17 billing failures came from my reconstructed `.env.test` and the 7
  sandbox failures from Docker not running).

## Preserved blockers (unchanged by this work)

DV2-G01 original WebKit timeout (cp28) stays OPEN; R03 disappearing-opener observation; external integrations
(R-01…R-11) not live-verified; owner MFA enrolment; Pi; release acceptance. Company Builder does not clear any of them.

## Open defects / limits

- CBR-02: the host gate relies on the private-bind start script; a hand-set marker defeats it (operator discipline).
- CB-BUG-23 self-approval for non-owner reviewer roles (prototype acceptable, open for commercial path).
- CB-BUG-25 substring flag detection in preflight; CB-BUG-29 LAN-mode relay IP trust; CB-BUG-30 secret-pattern coverage.
- UX-01 optional questions stay above the plan on mobile (P3).
- PRE-02 pre-existing E2E race in `failures.spec.ts:97` (proposed test fix not applied here).
- Real Gmail/Sheets bindings for the packs are not wired (trials use the local test outbox only).
- Questions before a full plan: 5–7 typical; up to 9–12 when optional details and a second department are answered.
  The preview is available as soon as the essentials are confirmed.
- Real CLI, Chrome exploratory, Pi, human usability: see verdicts.

## Owner: start command, first journey, smallest next action

```bash
git fetch origin claude/company-builder-milestones-abc-pmba6v && git checkout claude/company-builder-milestones-abc-pmba6v
pnpm install && echo "FLOWLINE_COMPANY_BUILDER=on" >> .env && pnpm db:migrate && pnpm dev
# open http://localhost:3000 → sign in → sidebar "فريقك الرقمي"
```
First journey: `OWNER_TEST_GUIDE.md` §"First complete journey" (≈10 min, no API key, no payment).
Smallest remaining owner action: run that journey once on the laptop, then run the Claude CLI refine job with the
controller (`CLI_PROTOTYPE.md` → Founder runbook, steps 1–6) and hand the branch to Codex for the independent re-test and
real Chrome QA.
