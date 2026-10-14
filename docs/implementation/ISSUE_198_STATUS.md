# Account enrolment QR (#198) — 2026-10-14

Status: implemented and verified locally on an isolated stack; the PR waits
for its prerequisites. PR #259 (#197) and PR #261 (#196) were still OPEN with
`mergedAt: null` on 2026-10-14 (`gh pr view`), so `ai/198` carries their code
through clean merges of `origin/ai/197` (head `561fd618`) and `origin/main` (`bc60ed21`).
Against `origin/ai/197`, the diff is QR-only:

- `package.json`, `pnpm-lock.yaml`: `qrcode.react` 4.2.0, exact pin, ISC,
  peer `react ^16.8 || … || ^19`; the lockfile gains only its entries.
- `src/components/totp-qr.tsx`: `QRCodeSVG` (168 px, level M) on a white,
  padded square, `aria-hidden`, drawn in the browser (no external QR service).
- `src/app/account/security/two-factor-card.tsx`: `<TotpQr>` above the secret
  from the same `enrolment.totpURI` state; cancel button protected with `requestRef`
  token against in-flight race conditions.
- `e2e/account-security.spec.ts`: extended enable and RTL cases verifying QR
  visibility, SVG child, position above secret, white background, zero foreign requests
  both immediately after QR display and after completion, and RTL bounds.
- `e2e-army/198-totp-qr.e2e.ts`: natural language test verifying wrong password
  draws no QR code, tagged `feat:fl-accounts-sessions`.
- `docs/implementation/BETA_USER_GUIDE.md`: mention of QR code in English summary.

Per CTO decision and CodeRabbit/Claude review, #198 stays parked until #259 and #261
are merged into main. Once both prerequisites merge, `ai/198` will be rebased onto
`origin/main` (dropping the prerequisite merge commits), leaving strictly the 5 QR
files plus the e2e-army test and docs update in the diff against main.

## Evidence (isolated stack: throwaway PostgreSQL 16 cluster, database `flowline_test_q198`, app :3198, fakes :4198/:4199, `.env.test` from `.github/ci/env.test.template` with generated keys)

| Check | Result |
| --- | --- |
| `pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` | 4 passed |
| Same run with the `<TotpQr>` line removed | enable and RTL cases fail (`totp-qr` not found) |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm lint`, `pnpm typecheck` | clean |
| `vitest run tests/unit/api-error-shape.test.ts` | passed (3/3) |
| army test type-check (`tsc`) | clean |

The spec covers: QR visible with an `svg`, secret below it, exactly one
`POST /api/auth/two-factor/enable` per enrolment, white background, no request
to another origin (checked immediately upon display and after flow completion),
QR gone after Cancel and after the correct code, and in Arabic (`dir=rtl`) the
QR inside the page column with no horizontal scroll.
The army test covers the invalid case (wrong password: no QR, no secret).
