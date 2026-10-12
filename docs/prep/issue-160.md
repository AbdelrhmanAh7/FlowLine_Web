# Prep for #160: Enable GitHub security features (secret scanning, push protection, Dependabot, Copilot)

> Offline floor prep (2026-10-12T13:24Z): capacity 0 — claude: claude daily budget spent (15% of 4.4% week-points; codex: codex is in peak hours (16:00–00:00 Africa/Cairo):; opencode: held until 13:51Z (opencode rate-limited 12× in a ; agy: held until 10-14 14:36Z (2 d 1 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

This requires changing repository settings in GitHub:
- Enable secret scanning with push protection in Settings → Code security
- Enable Dependabot alerts
- Enable Copilot code review in Settings → Copilot

This requires owner access and cannot be done by engineers due to the secrets-settings hard rule.

Acceptance criteria:
- Secret scanning with push protection enabled
- Dependabot alerts enabled
- Copilot code review enabled as a second reviewer

Note: The repo is public, so these features are free.

Part 1/2 of #24 (split by the CTO: Split into settings and documentation work, with settings requiring founder action)

<!-- nql-cto-split parent=24 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`

## Test plan (skeleton (local model unavailable or RAM < 30 % free))

- [ ] happy path for the behaviour in the title
- [ ] invalid / empty input
- [ ] regression: the existing behaviour next to it is unchanged
