# Prep for #372: Follow-up from #371: non-blocking review findings

> Offline floor prep (2026-10-23T19:34Z): capacity 0 — agy: agy daily code budget (150) used; agy-med: agy daily code budget (150) used; agy-low: agy daily code budget (150) used; agy-pro: agy daily code budget (150) used. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=371 -->
Follow-up from #371 (fix: qa finding: (non-blocking) [minor] The Arabic translation for mizano.createcustom… (split from #325) (#365)).

P2/P3 findings from the reviewers. They do not block #371 and do not start a fix round; they are tracked here, one issue per PR.

- Localization Reviewer: [p2] src/i18n/messages/ar.json:1341: Added terminating period to 'mizano.list_overdue_invoices.description' to match English and other action descriptions
- Localization Reviewer: [p2] src/i18n/messages/ar.json:1345: Updated 'mizano.create_customer.description' to explicitly include customer name 'الاسم' alongside company, email, phone, and optional tax ID
- Localization Reviewer: [p3] e2e-army/147-mizano-create-customer-and-quote.e2e.ts:37: Added E2E test scenario to verify Mizano integration card, actions, and connection fields in both English and Arabic (RTL)
- Localization Reviewer: [p3] tests/unit/i18n-content-text.test.ts:148: Added unit test to verify Mizano provider description, actions, and connection fields are localized correctly in both languages
- Localization Reviewer: [p3] docs/integrations/SUPPORTED-ACTIONS.md:126: Updated documentation to reflect the Arabic localization changes for mizano.create_customer

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `AGENTS.md`
- `CLAUDE.md`
- `DESIGN_DECISIONS.md`
- `EVIDENCE.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/BRIEF.md`

## Existing tests nearby

- `tests/unit/demo-docs-commands.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (skeleton (local model unavailable or RAM < 30 % free))

- [ ] happy path for the behaviour in the title
- [ ] invalid / empty input
- [ ] regression: the existing behaviour next to it is unchanged
