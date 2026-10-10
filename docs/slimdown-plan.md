# FlowLine slim-down plan (2026-10-10)

The owner asked to make development, testing and code review faster across the projects. FlowLine is not built wrong,
so this is a careful trim: every pilot feature (16 Oct pilot plan, milestone "MVP — Ship plan", the hub's feature inventory) stays,
and nothing that guards real logic is removed. e2e-army (the hub's tester-army suite, `ops/verify/e2e-army/` in the hub)
is the main end-to-end gate; GitHub CI stays the fast correctness gate.

## How this was measured

- **Code size**: non-blank lines of tracked `ts/tsx/js/mjs/cjs/mts/cts/css/sql/sh/yml` files (`git ls-files`), per top-level module.
- **CI**: GitHub Actions REST data for 2026-09-26 → 2026-10-10 (all 308 `Gate` runs; job and step timings of the 35 most
  recent completed pull-request runs; one full chromium job log).
- **Dead code**: `knip` 5 (unused files, exports, dependencies), every flagged file grepped for references in code, docs and
  `package.json`; the hub's feature inventory (`ops/verify/features/FlowLine_Web.json`, 53 features) mapped onto all 448
  `src/` + `worker/` files.
- **Duplicates**: each candidate test was compared with the kept tests and the e2e-army feature it belongs to.

## Before (main @ e288244)

| Measure | Value |
| --- | --- |
| Tracked files / size | 3,879 files, 206 MB (pack 170 MB) |
| `artifacts/` | 2,946 files, 186 MB: 1,632 PNG, 433 JSON, 385 TXT, 178 logs, Playwright trace zips, 110 one-off `.mjs` drivers, 142 Markdown reports |
| Code lines (non-blank) | 107,462 total; `src` 48,246, `tests` 29,213, `e2e` 8,262, `scripts` 4,654, `worker` 1,572, `drizzle` 1,389, `artifacts` 6,935 |
| `src` by module | server 11,424 · app 10,824 · components 7,775 · ai 4,931 · company-builder 3,157 · engine 2,737 · integrations 1,871 · db 1,750 · billing 1,200 · i18n 967 · lib 774 · design 717 · theme 119 |
| Tests (Vitest counts, `it.each` rows included) | unit 100 files / 1,329 tests; contract 23 / 468; integration 60 / 515; live 3 files (manual, not in CI); Playwright 29 specs / ~164 tests (the PR fast tier runs 78 on Chromium) |
| Dependencies | 30 runtime + 18 dev (direct); 690 packages in `pnpm-lock.yaml` |
| PR CI (`Gate`) | wall clock median 3.8 min, p90 4.3 min, max 5.0 min; runner time median 9.6 min per run (6 jobs) |
| Slowest job | `chromium` median 3.5 min: setup 41 s (Postgres 14 s, Playwright deps 15 s), `next build` 36 s, 3 stacks 8 s, 78 specs 95 s |
| `checks` legs | static·unit·contract 1.3 min (gate step 55 s); integration shards 1.5–1.9 min (58–78 s of tests, 24 s setup each) |
| Other workflows (14 d) | `docs` 532 runs (median 10 s, but a full 186 MB checkout to run one Node script); `claude` 927 runs (98 % skipped by its `if:`); `ai-implementers` 149 runs, disabled manually since the hub moved to launchd |
| Failures (35 sampled runs) | 12 `checks` and 5 `chromium` failures: real PR failures plus one infrastructure failure (Docker exit 125 in setup on every leg of one run); no test failed intermittently on the same head |

The PR CI target (under 5 minutes) is already met; the main costs are the repository weight (every clone, checkout and
agent worktree moves 170 MB), CI noise, and a few tests that duplicate others or run slow suites on every PR.

## Keep

- **All of `src/` and `worker/`.** The feature map claims all 448 files except 11 shared infrastructure files (db, api client,
  format helpers, toast); knip found no unused source file and no unused dependency. Every route belongs to a pilot feature.
- **All runtime and dev dependencies.** Each is imported or used by a script (`concurrently`, `lint-staged`, `husky`).
- **Unit tests that guard logic**: engine/validation/expressions, crypto, egress and SSRF, auth/MFA/session fences, permissions,
  billing webhooks, run messages, i18n text, company-builder packs, focus and keyboard behaviour, the design-token guard.
- **Integration tests** (real Postgres): tenancy, roles, runs, approvals, OAuth, billing, platform admin.
- **CI scripts' own tests** for `changed-scope` (decides when tests are skipped) and `docs-check` (a required check).
- **Playwright fast tier on Chromium**: it is the only browser gate that runs inside GitHub on every PR (e2e-army runs on
  the Mac and waits for resources), costs 3.5 min and is already within the target. Firefox/WebKit stay full-tier only.
- `claude.yml` (owner request: Claude reviews on GitHub; skipped runs cost no runner time), `design-reference/`, the
  product UI deck, `docker/` and `deploy/` (code sandbox and beta runbooks).

## Remove

| Item | Evidence | PR |
| --- | --- | --- |
| Raw files under `artifacts/` (2,789 files, ~184 MB) | generated screenshots, traces, logs, JSON and one-off driver scripts from finished review rounds; no code reads them (only `RESEARCH_RECORD`, a Markdown report, which stays). Still in use and kept: the 4 focused-run helpers (`docs/DEVELOPER_GUIDE.md`, `focused-run-env.test.ts`) and the Company Builder field-validation harness and packet (`artifacts/company-builder/validation/*/flowline-field/`, `packet/`; issues #6, #141, #142, PR #50). `.gitignore` now admits only `artifacts/**/*.md` (tracked helpers are unaffected) | 1 |
| Raw Codex transcripts (`codex-stdout.md`, 4 files, 0.7 MB) | helper-CLI output, which the repo already refuses to commit (DV2-02) | 1 |
| `e2e/tools/cb-screens.mjs`, `scripts/audit-ui-copy.mts`, `scripts/db-peek.mjs`, `scripts/diag/copilot-real-model.mts`, `scripts/diag/db-path-probe.mjs`, `scripts/test/grep-canary.mjs` | knip: unused; zero references in code, docs or `package.json` (one-off diagnostics) | 1 |
| `tests/contract/oauth.test.ts` | mock-only: tests the fake provider's own OAuth; real paths stay in `sec-oauth` and `oauth-client` (from #92) | 2 |
| `tests/integration/codex-poc-agent-approval-republish.test.ts` | duplicate of the kept `p3-agents.test.ts` (from #92) | 2 |
| `tests/unit/provider-basic-auth.test.ts` | tautology: re-implements its parser inline (from #92) | 2 |
| `tests/unit/codex-poc-egress-redirect.test.ts` | duplicate: the POST/307 cross-origin case is one row of `egress-redirect-security.test.ts` | 2 |
| `.github/workflows/ai-implementers.yml` | disabled manually; the hub's launchd jobs replaced it (149 runs in 14 days before it was turned off) | 2 |

Older raw evidence stays reachable at the tag `archive/pre-slimdown-2026-10-10` (nothing is lost; 29 historical doc links
point at files there).

## Simplify

| Change | Evidence / effect | PR |
| --- | --- | --- |
| Nightly tier for 6 slow or infra-heavy suites (`p2-code-sandbox`, `company-builder-cli`, `sec-upgrade`, `sec-cxh06-rotation`, `sec-cxh01-backfill`, `drizzle-tooling-prune`) | ~31 s of integration time and the 4 s sandbox image pull off every PR (from #92); `nightly.yml` opens or updates one `nightly-red` issue when it fails, so a red nightly reaches the hub's engineers without an owner decision | 2 |
| `docs.yml` checks out only `scripts/ci` | it ran a full checkout of the repository 532 times in 14 days to run one script | 2 |
| Skip the duplicate TypeScript pass inside the CI test build | `tsc --noEmit` already runs in the static leg; `next build` repeated it on the chromium critical path (`FLOWLINE_SKIP_BUILD_TYPECHECK=1`, CI test build only; production builds still type-check) | 2 |
| Smaller checkouts everywhere | removing `artifacts/` raw files cuts each `actions/checkout` and every agent clone | 1 |

## Deferred (not removed now)

- Tests #92 listed as "next wave once e2e-army covers the feature": `local-scenarios` (integration), `p3-settings`,
  `dv2-visual-fixes`, `landing-header`, parts of `dialog-focus`, `builder-keyboard` and `design-system` (reduced motion).
  They stay until the matching e2e-army tests (`tests-dev/FlowLine_Web/ui-*.e2e.ts`) pass on the gate.
- Dropping Playwright Chromium from the PR tier: only after e2e-army posts a verdict on every FlowLine PR.
- Historical handover docs (`docs/CLAUDE_HANDOVER_20261002.md`, `KIMI_BRIEF.md`, `NEXT_ACTION.md`): docs, not code; left to the
  docs owner.

## After

Filled in by the last slim-down PR from its own CI runs.
