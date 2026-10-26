# Evidence: issue #426 (supersedes part of #380)

Scope: the one item "malformed URI escapes in search parameters". `src/middleware.ts` from `ai/375` was never merged, and Next.js 16 calls the file `proxy.ts`, so this adds `src/proxy.ts` (not `middleware.ts`) with the decode check done by `src/lib/uri.ts`. The other four items listed in #426 are out of scope here.

## Acceptance criteria

| AC | Criterion | Verified by |
|---|---|---|
| AC1 | A path or query string with a percent-escape that does not decode (`%E0%A4%A`, `%zz`, a lone `%`) is detected; valid escapes (Arabic UTF-8, `%25`, `+`, `%20%20`, empty query) are not | `tests/unit/malformed-uri-proxy.test.ts` `hasMalformedPercentEscape` (9 cases) |
| AC2 | `proxy()` answers such a request with a 404: bounded JSON `NOT_FOUND` + `no-store` for `/api/*`, a rewrite to `/not-found` for pages; valid requests pass through | `tests/unit/malformed-uri-proxy.test.ts` `proxy` (3 tests); `e2e-army/200-route-error-headers.e2e.ts` `@issue-426 AC2` |

Regression: the base has no `src/proxy.ts` or `src/lib/uri.ts`, so the new test file fails to import there; on this branch it passes.

## Commands (tested SHA: see the PR head)

- `pnpm vitest run --project unit tests/unit/malformed-uri-proxy.test.ts`: 12 passed.
- Typecheck and lint: see the PR checks and the commit message.
- The e2e-army scenario runs in the hub's verify job; it was not run locally.
