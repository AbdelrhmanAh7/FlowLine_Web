# Account enrolment QR (#198) — 2026-10-14

Status: implementation present on `ai/198`; prerequisite, scope and runtime
validation remain blocked. Candidate `139ad5d1ffadc4a660727ef7b1a4ca192d2af50f`
contains the browser-rendered `TotpQr`, enrolment integration, QR guide bullet
and Playwright checks for visibility, cancellation, confirmation and origin.
The army test currently covers only an invalid password, not QR visibility.

Root cause of the scope finding: merge `a5d8dad` imported the unmerged #197
branch (including #196). Refreshed `origin/main` is `66cc279`; its enrolment
component is absent. Read-only GitHub queries on 2026-10-14 show PR #259
(#197, head `876a744`) and PR #261 (#196) both OPEN with `mergedAt: null`.
The resulting diff against main is 15 files / 403 insertions, beyond #198's
scope. The old handoff was carried forward unchanged after implementation.

Validation during this docs correction: `pnpm lint` and `pnpm typecheck` passed;
`pnpm e2e:army e2e-army/198-totp-qr.e2e.ts` exited 2 because `.env.test`
is missing. No app is listening on port 3100. Runtime acceptance criteria
remain unverified; no full suite or build was run.

Documentation regression check: the following assertion failed on the old
handoffs and passes after this correction (Node 26.10.0). It checks the
implementation exists and both handoffs acknowledge it; it does not prove
QR runtime behavior.

```sh
node <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
assert(fs.existsSync('src/components/totp-qr.tsx'));
for (const path of ['docs/implementation/ISSUE_198_STATUS.md', 'NEXT_ACTION.md']) {
  const text = fs.readFileSync(path, 'utf8');
  assert(text.includes('implementation present'), path);
  assert(text.includes('#259') && text.includes('#261'), path);
}
assert(fs.existsSync('AI_QUESTIONS.md'));
console.log('PASS: implementation and prerequisite handoffs agree');
NODE
```

Requeue after both prerequisite PRs merge, repair the branch onto their
reviewed main commits, retain the #198 test-first order and only QR changes,
then complete happy-path army coverage and focused validation. See
[AI_QUESTIONS.md](../../AI_QUESTIONS.md). No readiness or release approval
is implied.
