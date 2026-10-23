# Prep for #377: fix: qa finding: src/app/w/[slug]/flows/dashboard.tsx:157: The e2e test for file uploa… (split from #368)

> Offline floor prep (2026-10-23T20:40Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-stuck-split pr=AbdelrhmanAh7/FlowLine_Web#368 item=finding:fb6fe8d1b259 -->
Split from PR #368 (https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/368), which reached the fix-round cap (6/6) without going green. Parent issue: #295.

### Scope (one item)
- qa finding: src/app/w/[slug]/flows/dashboard.tsx:157: The e2e test for file uploa…

src/app/w/[slug]/flows/dashboard.tsx:157: The e2e test for file upload (AC4) expects an 'Upload .json file' but the implementation uses t('flows.importN8nFile') which may not match the expected text in the test.

https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/368#issuecomment-6311697618

### Done when
- this check passes / this finding is resolved on a fresh branch off `ai/295`, with a test that covers it;
- the PR body says "Supersedes part of #368". Keep the change small; do not reuse the parent branch `ai/295-p2`.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `AI_QUESTIONS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `EVIDENCE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/template-actions.test.ts`

## Test plan (skeleton (local model unavailable or RAM < 30 % free))

- [ ] happy path for the behaviour in the title
- [ ] invalid / empty input
- [ ] regression: the existing behaviour next to it is unchanged
