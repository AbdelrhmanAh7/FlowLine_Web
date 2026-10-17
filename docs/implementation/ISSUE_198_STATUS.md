# Account enrolment QR (#198) — 2026-10-15

Status: implemented and verified locally; PR #278 (branch `ai/198`) is stacked on `ai/197`
(PR #259, issue #197), which is stacked on `ai/196` (PR #261, issue #196). Both prerequisite
PRs #259 and #261 remain open (`mergedAt: null`), so PR #278 is parked as a draft with label
`ai-hold` until both prerequisites merge to main. Duplicate draft PR #260 was closed via
the hub's `closepr-cli` tool (`node src/closepr-cli.ts close`) with recorded reason per
Constitution articles 1 & 2 (superseded by active PR #278, enabling PR #278 to retarget its
base branch from `main` to `ai/197`).

Against `origin/ai/197` (the stacked base branch, which already contains `main` with #147/#219, so the
Mizano fake, contract tests and #147 docs are not part of this PR), `git diff origin/ai/197 HEAD --stat`
lists 10 files (176 insertions, 10 deletions): the 8 QR files below, this status note and `NEXT_ACTION.md`, plus
`tests/unit/demo-run-lock.test.ts`, which is main's race-free holder test from #287 (commit `68ad08e7`, needed because the old
test failed Unit on this PR) and drops out of the diff once `origin/ai/197` also contains it. The QR change itself is:

- `package.json`, `pnpm-lock.yaml`: `qrcode.react` 4.2.0, exact pin, ISC license,
  peer dependencies include React 19 (`^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`).
- `src/components/totp-qr.tsx`: client component rendering `QRCodeSVG` (168 px, level M) on
  a white, padded square (`bg-[white] p-3`), `aria-hidden="true"`, `data-testid="totp-qr"`,
  drawn entirely in the browser (no external service, zero foreign requests).
- `src/app/account/security/two-factor-card.tsx`: renders `<TotpQr uri={enrolment.totpURI} />`
  above the manual secret in the enrolment view from the same single `enrolment.totpURI` state;
  no second call to `/api/auth/two-factor/enable`. The submit Button keeps its standard
  unlocalized props with no hardcoded English `aria-label`.
- `src/components/shell/app-shell.tsx`: zero diff against `origin/ai/197` (unlocalized `aria-label`
  removed per review feedback).
- `e2e/account-security.spec.ts`: single consolidated `page.on("request")` listener verifying zero
  requests leave the app's own origin while the QR is shown and after completion; asserts QR is
  visible with an `<svg>`, positioned above the secret, on a white background; verifies QR disappears
  on Cancel and on successful confirmation; verifies RTL layout bounds in Arabic (`dir="rtl"`).
- `e2e-army/72-federated-mfa-failure-audit.e2e.ts`: natural-language test for `@issue-198 AC1` (wrong password: no QR,
  no secret), tagged `feat:fl-auth-api` (the better-auth two-factor endpoint it exercises), run against `fl-user` session.
- `docs/implementation/BETA_USER_GUIDE.md`: the privacy bullet under item 7 (Privacy) mentions
  scanning the QR code with the authenticator app (or typing the secret key shown below it).
- `scripts/gate-groups.mjs`, `e2e-army/85-*`, `e2e-army/196-*`, `e2e-army/197-*`: zero diff against `origin/ai/197`. The hub runs at most 8
  top-level `e2e-army/*.e2e.ts` files (`tests/unit/e2e-army-tooling.test.ts`), so the #198 army test lives in the `72-*` file, not its own.

## Prerequisite Stacking Order

```
main
 └── ai/196 (PR #261, issue #196: page, menu link, read-only MFA status)
      └── ai/197 (PR #259, issue #197: enable MFA with secret & backup codes)
           └── ai/198 (PR #278, issue #198: browser-side QR code for authenticator app)
```

Once PR #261 and PR #259 are merged to `main`, PR #278 will be retargeted to `main`,
`origin/main` merged into `ai/198`, verified with `pnpm install --frozen-lockfile` and
`pnpm test:e2e e2e/account-security.spec.ts`, and marked ready for final review.

## Evidence

Run on head `68ad08e7` plus this note, 2026-10-18, from the worktree.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --lockfile-only` | exit 0 (lockfile matches `package.json`; a full install aborts without a TTY because `node_modules` is a link to the main install) |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `vitest run --project unit tests/unit/e2e-army-tooling.test.ts` | 12/12 passed |
| `vitest run --project unit tests/unit/demo-run-lock.test.ts` | 19/19 passed |
| `pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` (isolated stack, own DB `flowline_test_c198`, port 3198) | 6/6 passed (43 s): same-origin requests only, one enable POST, QR above the secret, white background, QR gone after Cancel and after confirm, Arabic/RTL bounds |

Note: the first two runs on a cold `.next-test-3198` cache failed the #196 test "user menu opens the security page" (5 of 6 passed): the
Next.js dev error badge ("1 Issue") covered the user-menu button, so the click timed out. No console or page error was captured
afterwards and the test passed on the warm cache and in the full rerun above; the cause is a first-compile dev-server artefact, not
the QR change (the QR code is not on that page's initial render). CI runs the spec on a fresh stack, so a repeat there should be
looked at as a possible cold-start flake, not hidden.
