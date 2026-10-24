# Prep for #393: Follow-up from #389: non-blocking review findings

> Offline floor prep (2026-10-24T06:02Z): capacity 0 — agy: agy has no live canary pass in the last 3 h (agyNo; agy-med: agy-med has no live canary pass in the last 3 h (a; agy-low: agy-low has no live canary pass in the last 3 h (a; agy-pro: agy-pro has no live canary pass in the last 3 h (a. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

<!-- nql-review-loop followup pr=389 -->
Follow-up from #389 (Fresh restart of #198: Account security page (3/4): QR code for the authenticator app (replaces #278) (#294)).

P2/P3 findings from the reviewers. They do not block #389 and do not start a fix round; they are tracked here, one issue per PR.

- QA Engineer: [p2] e2e-army/197-enable-two-factor.e2e.ts:76: Missing newline at end of file - minor formatting issue.
- QA Second Opinion: [p2] docs/implementation/BETA_USER_GUIDE.md:76: This removes the statement that turning off two-step verification is coming in a later part, but the PR adds no disable-2FA functionality. The guide now omits a real limitation and is out of scope for the QR-code issue.
- QA Second Opinion: [p3] e2e-army/197-enable-two-factor.e2e.ts:76: The new file has no trailing newline ("\ No newline at end of file"), which will fail typical formatting or lint checks.

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
