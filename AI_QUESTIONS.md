# AI_QUESTIONS.md (blocking #228)

## Blocker: missing component test harness

Issue #228 asks to add `tests/component/copy-editor-publish-errors.test.tsx` following an existing component test pattern (mock `useQuery`/`useT`, use global `api` mock from `tests/component/setup.ts`, render with `renderWithProviders`) and to run:
```
nice -n 10 pnpm exec vitest run --project component tests/component/copy-editor-publish-errors.test.tsx --maxWorkers=2 && pnpm type-check && pnpm exec eslint ...
```

But `main` (and this branch) currently lack the required pieces:

1. **No `tests/component/` directory** — so there is no `setup.ts`, no existing `copy-editor.test.tsx` to copy the mocking pattern from, and no `renderWithProviders` utility referenced.
2. **No `component` Vitest project** — `vitest.config.mts` defines only unit/contract/live/integration/nightly projects; no `component` project config.
3. **Missing React Testing Library + DOM environment deps** — `package.json` has no `@testing-library/*`, no `jsdom`/`happy-dom` (typical for component tests).
4. **No `type-check` script** — the test command includes `pnpm type-check` but `package.json` doesn't define it.

## Questions
- Which sub-issue of #181 provides the component Vitest harness (tests/component, renderWithProviders, setup.ts, vitest component project, and deps)? 
- Should I wait for that harness to land (merge/FF into this branch) or open a separate "add component vitest harness" issue to unblock #228?
- If the harness is meant to be added here, the task scope expands beyond "new file only (<=100 lines)" and will touch config/deps — is that acceptable?

## Proposal
Do not add the test or touch src/config/deps. Commit this AI_QUESTIONS.md with message `docs(#228): blocked: component test harness missing`, stop. No e2e-army test (this is test harness setup context, not a user-facing flow change).