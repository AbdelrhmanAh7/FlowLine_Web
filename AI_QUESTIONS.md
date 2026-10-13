# #228 — still blocked (2026-10-13)

The CTO answer on this issue says to wait for the component-test harness (#181.3) and not to touch config or dependencies. It is still not on this branch or on `main`:

- `tests/component/` (`setup.ts`, `renderWithProviders`) does not exist here; it lives only on `ai/181`.
- `vitest.config.mts` has no `component` project, and `node_modules` has no `@testing-library/*` or `jsdom`.
- So `tests/component/copy-editor-publish-errors.test.tsx` cannot be written against the real mocking pattern, and its test command cannot run.

`ai/181` already has `tests/component/copy-editor.test.tsx` with a 5xx `ApiError(500, "INTERNAL", ...)` case and a `STEP_UP_REQUIRED` case. Before this issue is picked up again, check whether those already meet the acceptance criteria, as a "Part of #181" brief may be satisfied by its parent.

Next step: after #181 merges to `main`, merge `origin/main` into `ai/228` and add the new test file only (no `src/` or config changes).
