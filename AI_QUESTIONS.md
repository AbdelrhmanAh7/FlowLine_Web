# Issue #198 — blocked by enrolment prerequisite

Checked 2026-10-13: GitHub issue #197 is open; refreshed `origin/main`
is `9c754b2`. Both that ref and this checkout lack
`src/app/account/security/two-factor-card.tsx` and
`e2e/account-security.spec.ts`. The account security page from #196 is
also absent. `git log main..HEAD` contains only the unrelated #235 docs
commit, so there is no partial #198 implementation to continue.

Can the harness requeue #198 after #196 and #197 merge, with `ai/198`
rebased onto their reviewed main commits? #198 explicitly requires #197
merged first. Building its enrolment flow here would duplicate another
issue and exceed this issue's scope.

No feature code, dependency, or E2E test was added: there is no enrolment
view to extend or run. This docs-only blocker must not be treated as
completion of #198 or close #195. Resume with the required test-only
e2e-army commit, then implement the QR and extend the existing enable test.

The issue's reuse comment recommends node-qrcode; the brief permits
`qrcode.react` or another browser-only SVG library. On resumption, verify
the chosen library's maintenance, license and React 19 compatibility,
and explain the choice in the PR description.
