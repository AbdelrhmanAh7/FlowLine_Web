# Prep for #158: Safe part of #30: Owner actions PP-02..PP-09 for the paid pilot

> Offline floor prep (2026-10-10T20:42Z): capacity 0 — claude: claude daily budget spent (14% of 8% week-points) ; codex: Codex daily budget spent (10 of 7 week-points toda; opencode: held until 20:43Z (opencode rate-limited 7× in a r; agy: held until 10-14 14:35Z (3 d 18 h) ( error: Indivi. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Engineers may implement UI mockups, type definitions, API contract stubs, and test scaffolding that do not involve actual payments, pricing calculations, legal terms, or user contact.

1. Create a new AI‑ready sub‑issue titled “Prepare non‑sensitive scaffolding for Owner Actions”.
2. In that sub‑issue describe only UI mockups, TypeScript type definitions, API contract stubs, and unit/integration test placeholders that do NOT process real payments or handle legal/credential data.
3. Link the sub‑issue to the original and close the original as superseded.

Parent #30 is blocked by a hard rule (spending money); this sub-task excludes that part.

<!-- nql-cto-safe-part parent=30 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/pull_request_template.md`
- `.github/workflows/ai-implementers.yml`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `KIMI_BRIEF.md`
- `NEXT_ACTION.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: UI mockup for Owner Actions page  
  **Setup**: Render mock UI with buttons for PP-02 to PP-09  
  **Assertion**: UI elements are present and interactive  
  **File**: `src/components/owner-actions/OwnerActionsUI.tsx`  
  **Edge Case**: No real data binding or state management

- **Test Case 2**: TypeScript types for Owner Actions  
  **Setup**: Define types for action payloads and responses  
  **Assertion**: Types are correctly structured and exported  
  **File**: `src/types/owner-actions.types.ts`  
  **Edge Case**: No validation or external dependencies

- **Test Case 3**: API stub for Owner Actions endpoint  
  **Setup**: Mock `/api/owner-actions` endpoint with dummy data  
  **Assertion**: Endpoint returns expected mock response  
  **File**: `src/api/mocks/owner-actions.mock.ts`  
  **Edge Case**: No actual network calls or authentication

- **Test Case 4**: Unit test for Owner Actions UI rendering  
  **Setup**: Render OwnerActionsUI component in test environment  
  **Assertion**: Component renders without errors  
  **File**: `tests/unit/owner-actions-ui.test.ts`  
  **Edge Case**: No real data or external services

- **Test Case 5**: Integration test for Owner Actions flow  
  **Setup**: Simulate user interaction with Owner Actions UI  
  **Assertion**: UI state updates correctly on action selection  
  **File**: `tests/integration/owner-actions-flow.test.ts`  
  **Edge Case**: No real backend or payment processing

- **Test Case 6**: Test for environment variables in CI/CD  
  **Setup**: Check `.env.example` and CI config files for correct placeholders  
  **Assertion**: Environment variables are properly defined and used  
  **File**: `.github/ci/env.test.template`  
  **Edge Case**: No real secrets or sensitive data

- **Test Case 7**: Test for pre-commit hooks  
  **Setup**: Run husky pre-commit hooks in test environment  
  **Assertion**: Linting and formatting rules are enforced  
  **File**: `.husky/pre-commit`  
  **Edge Case**: No real code changes or commits

- **Test Case 8**: Test for pull request template  
  **Setup**: Validate pull request template includes required sections  
  **Assertion**: Template contains all necessary fields and instructions  
  **File**: `.github/pull_request_template.md`  
  **Edge Case**: No real PRs or user input

- **Test Case 9**: Test for AI implementation guidelines  
  **Setup**: Check `AGENTS.md` and `DESIGN_DECISIONS.md` for clarity  
  **Assertion**: Guidelines are well-documented and actionable  
  **File**: `AGENTS.md`, `DESIGN_DECISIONS.md`  
  **Edge Case**: No real AI models or implementation

- **Test Case 10**: Test for CI/CD workflow configuration  
  **Setup**: Validate GitHub workflows for AI and gate checks  
  **Assertion**: Workflows are correctly configured and functional  
  **File**: `.github/workflows/ai-implementers.yml`, `.github/workflows/gate.yml`  
  **Edge Case**: No real CI/CD pipelines or execution
