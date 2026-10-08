# Evidence — issue #63 (CodeQL triage)

Tested SHA: see the last line of this file for the review-round fix (alert #15); earlier rounds `a87590f56fbd19406d954e7ed2f0599b35e67aac` (branch `ai/63`, on main `bc59cab`), 2026-10-08, macOS, Node from the main checkout's install. Requirement ids are from the Notion PRD (Draft): REQ-FL-63-1 … 5.

| REQ | Requirement | How it is verified |
| --- | --- | --- |
| REQ-FL-63-1 | Review each alert individually | Alerts read with `gh api 'repos/AbdelrhmanAh7/FlowLine_Web/code-scanning/alerts?state=open'` on 2026-10-08: the 13 alerts of the issue (#1–#10, #12–#14), each traced to its flagged line. One row per alert in [`docs/security/CODEQL_TRIAGE.md`](../../docs/security/CODEQL_TRIAGE.md); `tests/unit/codeql-triage.test.ts` AC1 checks every row's rule, file and disposition. |
| REQ-FL-63-2 | Decide fix or dismissal per alert | Disposition column: 9 fixed (#1, #2, #3, #4, #5, #7, #8, #13, #14), 4 dismissed (#6, #9, #10 used in tests; #12 false positive). Alert #8 was first dismissed as won't fix; the PR's CodeQL run then raised #15 on the same line, so it is fixed instead (`--ca-file`). |
| REQ-FL-63-3 | Implement fixes | AC2 (flagged code gone from all 9 fixed sites), AC4 (`stop-test-stack.mjs` uses `execFileSync`, no `execSync`), AC5 (`verify-beta-stack.mjs` has no `NODE_TLS_REJECT_UNAUTHORIZED`/`rejectUnauthorized: false`; `--insecure-local` exits 2 as removed; an unreadable `--ca-file` exits 2), AC6 (fake `/__fake/fault` returns a fixed 400 message), AC7 (fake AI slow-fault `delayMs` limited to 0–60000). Manual: `stop-test-stack.mjs --port=39123 --fake-port=39124 --ai-port=39125` stopped a listener on 39124; `verify-beta-stack.mjs --base https://localhost:1` still runs its checks and reports the connection failure. |
| REQ-FL-63-4 | Dismissal reason written next to the code | AC3: each dismissed site carries a `CodeQL \`<rule>\` (alert #N)` comment and a reason of more than 40 characters in the triage table. |
| REQ-FL-63-5 | Group by rule family | One PR (196 added / 18 removed lines over 16 files at this SHA, under the ~300-line limit of the ship-plan brief), committed in family order: test-code sanitization, shell commands, fake servers, release/rate-limit, docs. |

## Test runs at the tested SHA

- New acceptance tests (all `@issue-63`): unit `tests/unit/codeql-triage.test.ts` 5/5, contract `tests/contract/codeql-fakes.test.ts` 2/2. All 7 failed before the fix commits (commit `0bd0b41`, tests only).
- Unit suite: 1247 passed, 4 skipped. The 2 files that bind local ports (`egress.test.ts`, `codex-poc-egress-redirect.test.ts`) fail with `listen EPERM` inside the agent sandbox and passed when run outside it (39/39 together with the two new files).
- Contract suite: 24 files, 470 passed (outside the sandbox, which blocks local listening).
- `eslint` on the changed files and `tsc --noEmit`: clean.

## Not verified here

- CodeQL itself: no CodeQL CLI locally. The PR's CodeQL run (and main's rescan after the merge) shows whether the 9 fixed alerts close (#8 and #15 included).
- The 4 dismissals are a GitHub action for a repository admin after the merge (commands in `CODEQL_TRIAGE.md`; [OWNER_ACTIONS.md](../../docs/implementation/OWNER_ACTIONS.md) item 5). Until then those alerts stay open with their reason documented.
- `e2e/phase3.spec.ts` (alert #3) needs the test stack and was not run; the new escape was checked in Node (`http://127.0.0.1:4010/stripe/checkout/x` matches, `http://127x0x0x1:4010/...` does not).
- The Windows branch of `stop-test-stack.mjs` (PowerShell via `execFileSync`) was not run; there is no Windows machine here.
- Integration tests that register slow faults (largest `delayMs` 2 500) were not run (no Postgres); their values are inside the new 0–60000 range.

## Review round 1 (alert #15)

CodeQL on the PR flagged `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` in `verify-beta-stack.mjs` (alert #15, the same rule as #8). Fixed rather than dismissed: `--insecure-local` is removed; `--ca-file <root.crt>` adds Caddy's local CA to the trust list (HTTPS requests go through `node:https` with `ca`, and `tls.connect` gets the same `ca`). `tests/unit/codeql-triage.test.ts` AC5 failed before the script change and passes after it.
