# Company Builder — implementation report (Milestones A, B, C)

Session: Claude Code cloud session, 2026-09-30. Brief: `docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md`.
Baseline: `main` @ 9324b1fed677f03e8c044eb1373b8577167abeb5. Branch: `claude/company-builder-milestones-abc-pmba6v`
(pushed to origin as a feature branch only — **not merged, no PR, not deployed**).

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
