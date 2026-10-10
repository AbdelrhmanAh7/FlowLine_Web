# Prep for #85: Adopt tester-army/e2e in-repo as the E2E gate

> Offline floor prep (2026-10-10T12:35Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (4 d 2 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-plan -->
## Goal
Make tester-army/e2e (npm package `e2e`, Apache-2.0, Playwright-based, natural-language steps) a first-class part of this repo, so every PR carries its own E2E tests and CI runs them.

## Steps
1. Add `e2e` as a devDependency; add `e2e.config.ts` (base URL from env, headless, replay cache on, telemetry off, model via the hub's free Gemini adapter — see `ops/verify/e2e-army/cli-model.ts` and `e2e.config.ts` in the hub for the working setup).
2. Create `e2e-army/` with a suite covering the MVP user flows: login and the core flow. Start by porting the hub's suite in `ops/verify/e2e-army/FlowLine_Web.json`.
3. Add `npm run e2e:army` (or pnpm) that starts the app against the test DB and runs the suite in ≤ 5 min.
4. CI: run it as its own job (≤ 5 min, `timeout-minutes: 5`) posting the check `e2e-army`; shard if longer.
5. Document in CONTRIBUTING/README: every PR that touches a user flow adds or updates an `e2e-army/<issue>-<flow>.e2e.ts` in its first commit.

## Acceptance
- `e2e-army` check green on this PR and on the default branch.
- Suite runtime ≤ 5 min; no secrets committed (model config reads env/Keychain only).
- The hub's verify job picks up the in-repo suite (it copies `e2e-army/*.e2e.ts` into its runner).

Task size: medium

## Feature map requirement (owner 2026-10-08, added)
The in-repo suite must cover **every feature** of this project, not only the MVP flows above:
- The hub keeps the **feature map** in `ops/verify/features/FlowLine_Web.json` (repo AbdelrhmanAh7/nql-agents): feature id, EN+AR name, kind (`ui` | `api` | `job`), entry, the implementing `paths` globs, MVP flag and the test ids. Port the hub's feature tests (`ops/verify/e2e-army/tests/FlowLine_Web/`) into `e2e-army/` and **keep their tags**: `test("[<feature>.<n>] …", { tags: ["feat:<feature>", "shard:<shard>", "lvl:ui|api|job"] }, …)`.
- **Shard by feature group** (shard ids: `ops/verify/e2e-army/FlowLine_Web.json` → `shards[]`); every CI job/shard ≤ 5 min.
- Every feature has ≥ 1 test: `ui` → natural-language browser test, `api` → request-level test (no model), `job` → trigger + assert. Deterministic (seeded data, no sleeps).
- From now on **every PR adds or updates an `e2e-army/*.e2e.ts` test tagged `feat:<id>` for each feature it touches** (changed files are mapped to features by the `paths` globs; first commit preferred, waiver `E2E: not needed — <reason>`). The gate is never "n/a" for a backend-only change any more: it runs the feature's api-level shard. Files no feature claims run the smoke shard and show up as **"feature map gap"** in the verify report — add the feature/path to the feature map.
- A feature that fails on the default branch gets one issue `[e2e] <feature> failing on <branch>` (ai-ready, p0), closed automatically when it is green again.
See `skills/e2e-first.md`.


## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ai-implementers.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`

## Test plan (ollama:qwen3:8b)

## Test Plan

| Test Case | Setup | Assertion | File |
|----------|-------|-----------|------|
| E2E setup completes | Add `e2e` as devDep, create `e2e.config.ts` | `e2e.config.ts` exists, config matches spec | `e2e.config.ts` |
| E2E suite runs | Run `npm run e2e:army` | Suite completes in ≤5min, no errors | `e2e-army/` |
| CI job runs | Configure GitHub Action for `e2e-army` | Job runs, check is green | `.github/workflows/gate.yml` |
| Feature map integration | Port hub's feature tests | Tests in `e2e-army/` match feature map | `e2e-army/` |
| Shard by feature group | Split tests by shard | Each shard runs in ≤5min | `e2e-army/` |
| PR adds e2e test | PR touches user flow | New `e2e-army/*.e2e.ts` added | `e.g. e2e-army/login.e2e.ts` |
| Smoke shard runs | No feature claims file | Smoke shard runs, shows as gap | `e2e-army/` |
| Feature failure alerts | Feature fails on default | Issue created, auto-closed when green | `e2e-army/` |
| No secrets in config | Check config for secrets | No secrets in `e2e.config.ts` | `e2e.config.ts` |
| Test tags preserved | Port tests from hub | Tags match original | `e2e-army/` |
