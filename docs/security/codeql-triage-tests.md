# CodeQL triage A: tests and e2e (issue #111, part 1/4 of #63)

Scope: alerts in `tests/unit/` and `e2e/`. `scripts/` alerts belong to part B (alert #4,
`scripts/stop-test-stack.mjs`, is not touched here). All four alerts below were fixed in code;
none needed a dismissal.

| Alert | Rule | File | Resolution |
|---|---|---|---|
| #1 | `js/identity-replacement` | `tests/unit/cb-pack-customer-follow-up.test.ts` | Removed the no-op `.replace(/^\(/, "(")` that replaced `(` with itself. The expected value is unchanged. |
| #2 | `js/incomplete-multi-character-sanitization` | `tests/unit/landing-header.test.ts` | Tag stripping now repeats until the string is stable (`stripTags`), so nested fragments cannot survive one pass. Test-only helper that reads rendered markup; it never feeds a browser. |
| #3 | `js/incomplete-sanitization` | `e2e/phase3.spec.ts` | The regex escape for the fake provider URL now escapes every regex metacharacter, including the backslash. |
| #14 | `js/incomplete-url-substring-sanitization` | `tests/unit/ai-hub-wave-b.test.ts` | The suffix check `host.endsWith("cohere.com")` became `host === "cohere.com" \|\| host.endsWith(".cohere.com")`. The hostname was already parsed with `new URL()`. |

Verification: `pnpm vitest run tests/unit/cb-pack-customer-follow-up.test.ts tests/unit/landing-header.test.ts tests/unit/ai-hub-wave-b.test.ts`.
`e2e/phase3.spec.ts` runs in the Chromium CI legs (it needs the test stack).

## e2e-army waiver

`E2E: not needed`: these changes are test-only and internal. No product screen, API, or job behaviour changes, so there is no user-facing flow for an e2e-army test to cover. The waiver is also recorded in the commit message of the fix. Alert #4 (`scripts/`) is out of scope here and belongs to part B.
