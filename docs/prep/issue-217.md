# Prep for #217: Type-check e2e-army/ now that e2e and @e2e-dev/web are devDependencies (part of #85)

> Offline floor prep (2026-10-13T10:56Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex pacing: not enough room for a coding run (~1; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 4 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Part of #85

Delegated by the tech lead (Claude opus) of #85 to the team (Codex / free / local engineers).

**Files:** `tsconfig.json`, `docs/DEVELOPER_GUIDE.md`, `e2e-army/lib.ts`

**Acceptance:** tsconfig.json no longer lists "e2e-army" in exclude. `pnpm typecheck` passes with e2e-army/**/*.ts included. If it fails, fix only type errors in e2e-army/lib.ts or e2e-army/features/_helpers.ts (no runtime changes). Replace the docs/DEVELOPER_GUIDE.md line 61 sentence saying the packages 'are not dependencies here yet … tsconfig.json excludes e2e-army/' with one saying e2e (0.18.0) and @e2e-dev/w

**Test command:** `pnpm typecheck && pnpm lint e2e-army tsconfig.json`

Keep the change <= 100 lines; do not touch the parent's core logic.

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.env.example`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `AGENTS.md`
- `EVIDENCE.md`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`
- `artifacts/ai-hub/chrome-qa-756d69c/retest-c2fd494/RETEST.md`
- `artifacts/ai-hub/merged-faec2a3-20260929-0459/ENVIRONMENT.md`
- `artifacts/ai-hub/research/providers-2026-09-29.md`
- `artifacts/ai-hub/wavec-84f2cc1/BUGS.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST-cceeb5d.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST2-f74a5a1.md`
- `artifacts/ai-hub/wavec-84f2cc1/CODEX-RETEST3-a0b92df.md`

## Existing tests nearby

- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`

## Test plan (ollama:gemma3:4b)

**Test Plan: Issue #217 - Type-Check e2e-army**

1. **Test Case: Basic Type Check Success**
   * Setup: `pnpm typecheck`
   * Assertion: `pnpm typecheck` passes without errors.
   * File: `e2e-army/lib.ts`
   * Edge Case: Ensure no runtime changes are introduced.

2. **Test Case: Include e2e-army in Type Check**
   * Setup: Modify `tsconfig.json` to include `e2e-army/**/*.ts`.
   * Assertion: `pnpm typecheck` passes.
   * File: `tsconfig.json`

3. **Test Case: Validate Docs Update**
   * Setup: Update `docs/DEVELOPER_GUIDE.md` line 61.
   * Assertion: Sentence accurately reflects the dependency status.
   * File: `docs/DEVELOPER_GUIDE.md`

4. **Test Case: Feature Helper Type Check**
   * Setup: `pnpm typecheck` with `e2e-army/**/*.ts` included.
   * Assertion: No type errors in `e2e-army/features/_helpers.ts`.
   * File: `e2e-army/features/_helpers.ts`

5. **Test Case:  Empty e2e-army Files**
    * Setup: Ensure `e2e-army/lib.ts` and `e2e-army/features/_helpers.ts` are empty.
    * Assertion: `pnpm typecheck` passes.
    * File: `e2e-army/lib.ts`, `e2e-army/features/_helpers.ts`

6. **Test Case:  Large File - Check for Errors**
   * Setup: Create a large `.ts` file in `e2e-army/lib.ts` with intentionally incorrect syntax.
   * Assertion: `pnpm typecheck` fails with a specific error.
   * File: `e2e-army/lib.ts`

7. **Test Case:  No Changes - Verify Stability**
   * Setup: Run `pnpm typecheck` after all changes.
   * Assertion:  The same result as the initial run.
   * File: All files.

8. **Test Case: Linting - Verify Rules**
    * Setup: `pnpm lint e2e-army tsconfig.json`
    * Assertion: Linting passes without errors.
    * File: `e2e-army/lib.ts`, `e2e-army/features/_helpers.ts`
