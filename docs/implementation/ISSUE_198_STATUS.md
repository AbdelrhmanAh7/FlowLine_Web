# Account enrolment QR (#198) — 2026-10-15

Status: implemented and verified locally; the PR (#278, branch `ai/198`) waits for
its prerequisites. PR #259 (#197) and PR #261 (#196) were still OPEN with
`mergedAt: null` on 2026-10-15, so `ai/198` carries their code through clean merges
of `origin/ai/197` and `origin/main`. Against `origin/ai/197` (the PR's stacked base)
the diff is QR-only:

- `package.json`, `pnpm-lock.yaml`: `qrcode.react` 4.2.0, exact pin, ISC,
  peer `react ^16.8 || … || ^19`; the lockfile gains only its entries.
- `src/components/totp-qr.tsx`: `QRCodeSVG` (168 px, level M) on a white,
  padded square, `aria-hidden`, drawn in the browser (no external QR service).
- `src/app/account/security/two-factor-card.tsx`: `<TotpQr>` above the secret
  from the same `enrolment.totpURI` state; the cancel button keeps the `requestRef`
  token that guards against in-flight race conditions.
- `e2e/account-security.spec.ts`: extended enable and RTL cases verifying QR
  visibility, SVG child, position below the secret, white background, zero foreign
  requests both immediately after display and after completion, and RTL bounds.
- `e2e-army/85-sign-in-and-core-flow.e2e.ts`: the `@issue-198` natural-language test
  (wrong password: no QR, no secret), tagged `feat:fl-accounts-sessions`.
- `docs/implementation/BETA_USER_GUIDE.md`: the bullet part 2 added now mentions
  scanning the QR code or typing the secret shown below it.

## e2e-army file cap (root cause of the red `gate`)

The hub copies only the first 8 top-level `e2e-army/*.e2e.ts` files
(`readdirSync(...).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8)`, nql-agents
`src/lib/e2earmry.ts`), and `tests/unit/e2e-army-tooling.test.ts` enforces that cap
on the tree. `origin/main` now holds 8 files — it gained `147-mizano-create-customer-and-quote`
and `221-auth-isolation` while #196/#197/#198 were parked — so any per-issue army file
pushed the repo to 9–10 and failed the guard (the previous failure was
`expected 10 to be less than or equal to 8`). The `#196` and `#198` army tests were
therefore consolidated into the existing `85-sign-in-and-core-flow.e2e.ts` and the
standalone `196-account-security.e2e.ts` / `198-totp-qr.e2e.ts` files removed; the
repo is back at 8 top-level files and `tests/unit/e2e-army-tooling.test.ts` passes
(12/12). The QR test keeps its `feat:fl-accounts-sessions` tag, so the hub's
tag-based PR-test detection still picks it up.

Review round 9 asked to drop two hardcoded English `aria-label`s that were not part
of #198 (the submit button and the user-menu trigger); both are removed, so
`src/components/shell/app-shell.tsx` has no diff against `origin/ai/197`.

## Evidence (isolated stack: throwaway PostgreSQL 16 cluster, `flowline_test_<suffix>`, own port, `.env.test` from `.github/ci/env.test.template` with generated keys)

| Check | Result |
| --- | --- |
| `pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` | 4 passed |
| Same run with the `<TotpQr>` line removed | enable and RTL cases fail (`totp-qr` not found) |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm lint`, `pnpm typecheck` | clean |
| `vitest run tests/unit/e2e-army-tooling.test.ts` | passed (12/12) |
| `vitest run tests/unit/api-error-shape.test.ts` | passed (3/3) |

The spec covers: QR visible with an `svg`, secret below it, exactly one
`POST /api/auth/two-factor/enable` per enrolment, white background, no request
to another origin (checked immediately upon display and after flow completion),
QR gone after Cancel and after the correct code, and in Arabic (`dir=rtl`) the
QR inside the page column with no horizontal scroll.
The army test covers the invalid case (wrong password: no QR, no secret).
