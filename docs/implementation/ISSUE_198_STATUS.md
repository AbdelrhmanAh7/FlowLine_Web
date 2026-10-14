# Account enrolment QR (#198) — 2026-10-14

Status: implemented and verified locally on an isolated stack; the PR waits
for its prerequisites. PR #259 (#197) and PR #261 (#196) were still OPEN with
`mergedAt: null` on 2026-10-14 (`gh pr view`), so `ai/198` carries their code
through merges of `origin/ai/197` (latest: its head `1329953`). Against
`origin/ai/197` the diff is QR-only:

- `package.json`, `pnpm-lock.yaml`: `qrcode.react` 4.2.0, exact pin, ISC,
  peer `react ^16.8 || … || ^19`; the lockfile gains only its entries.
- `src/components/totp-qr.tsx`: `QRCodeSVG` (168 px, level M) on a white,
  padded square, `aria-hidden`, drawn in the browser (no QR service).
- `src/app/account/security/two-factor-card.tsx`: `<TotpQr>` above the secret
  from the same `enrolment.totpURI` state; the backup-codes list keeps
  `dir="ltr"` (an earlier attempt had dropped it).
- `e2e/account-security.spec.ts`, `e2e-army/198-totp-qr.e2e.ts`, the guide bullet.

Once #259 and #261 merge, merge `origin/main` into `ai/198`; the diff
against main then shrinks to the list above.

Rechecked for QA round 5 (head `32496f1`): `gh pr view` still shows #259
OPEN (changes requested) and #261 OPEN, both `mergedAt: null`, and
`origin/main` (`d136811`) has no `src/app/account/security/`. The scope
finding therefore stays open by design (CTO: park, do not merge unreviewed
code). The round's own findings are fixed: the army test is tagged only
`feat:fl-accounts-sessions`, the status spec's API-enable comment says why
it uses the API, and the guide's two-step bullet moved from Privacy to
Getting in with user wording ("isn't available yet").

Rechecked for review round 6 (head `6ede258`, 2026-10-14): #259 and #261
are still OPEN with `mergedAt: null`; `origin/main` is merged into the
branch (`6ede258`) but still has no `src/app/account/security/`, so the
diff against main is still not QR-only. The scope finding stays open by
design: the rebase onto main waits for both PRs to merge (CTO: park, do
not merge unreviewed code to speed this up). The `src/ai/hub/pricing.ts`
hunk seen against `origin/ai/197` is #238's JSDoc commit (`dd86153`,
already on main) and drops out of the rebase.

## Evidence (2026-10-14, isolated stack: throwaway PostgreSQL 16 cluster,
database `flowline_test_q198`, app :3198, fakes :4198/:4199, `.env.test` from
`.github/ci/env.test.template` with generated keys)

| Check | Result |
| --- | --- |
| `pnpm test:e2e e2e/account-security.spec.ts --project=chromium --workers=1` | 4 passed |
| Same run with the `<TotpQr>` line removed | enable and RTL cases fail (`totp-qr` not found) |
| `pnpm install --frozen-lockfile` (copy of package.json, lockfile, .npmrc, workspace) | passed |
| `pnpm lint`, `pnpm typecheck` | clean |
| `vitest related` on the changed sources | no related unit tests |
| army test type-check (hub `e2e` types, `tsc`) | clean |

The spec covers: QR visible with an `svg`, secret below it, exactly one
`POST /api/auth/two-factor/enable` per enrolment, white background, no request
to another origin, QR gone after Cancel and after the correct code, and in
Arabic (`dir=rtl`) the QR inside the page column with no horizontal scroll.
The army test covers the invalid case (wrong password: no QR, no secret); the
hub session's password is unknown, so the happy path stays in the spec.
`pnpm e2e:army` and the full suite were not run locally (CI and the hub run them).
