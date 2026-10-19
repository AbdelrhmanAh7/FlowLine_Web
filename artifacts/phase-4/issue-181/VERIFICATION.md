# Issue #181: admin copy error handling (part 3/3 of #119), verification

Branch `ai/181`, PR #184. Code head tested: `fcd1bc80` (the commit that adds this report changes only Markdown). Base for the regression run: `origin/main` at `264336fb`.

Origin: the hub's verify job on `be71f9f` reported "[high] Admin copy page not found, 404 on /admin/copy". There is no Sentry issue for it; nothing was reported through Sentry.

## The verify finding

Verify's browser is signed in as a user who is not a platform admin, as its own auth note says. `/admin/copy` answers that user with the app's ordinary 404 on purpose: `src/app/admin/copy/page.tsx` calls `notFound()` in `generateMetadata` and in the page, so a non-admin learns nothing about the editor (`docs/security/CREDENTIALS_DESIGN.md` item 10). The 404 is the expected refusal, and the product is unchanged for this finding.

The finding was reproduced as a test first. `e2e/admin-panel.spec.ts` "a non-admin opening /admin/copy sees the ordinary 404 page, not the copy editor or its title" (`d66488f4`) checks status 404, the unchanged URL, the heading "We couldn't find that page", and that neither the "Copy editor" heading nor the page title appears. The title is one line so the verify planner can read it.

## Acceptance criteria

The issue's status codes are adapted to what the route returns: anonymous callers and non-admins get 404 `NOT_FOUND` (a 401 or 403 would confirm the panel exists), and an unexpected failure gets 500 `INTERNAL`.

1. AC1. `/api/platform/copy` refuses with its documented codes: `NOT_FOUND` for anonymous and non-admin callers; `CROSS_SITE_REQUEST`, `CSRF_TOKEN_INVALID` and `STEP_UP_REQUIRED` (403); `UNSUPPORTED_MEDIA_TYPE` (415); `BODY_TOO_LARGE` (413); `BAD_JSON`, `VALIDATION`, `COPY_KEY_INVALID`, `COPY_VALUE_INVALID` and `COPY_DUPLICATE_EDIT` (400); `REVISION_CONFLICT` (409); `RATE_LIMITED` (429); `INTERNAL` (500).
2. AC2. A 500 body holds the code, a fixed message and the request id. It has no stack, no SQL or driver text and none of the submitted text.
3. AC3. Every refusal reaches the browser client as the `{ error: { code, message } }` envelope that `api()` turns into an `ApiError`. The editor maps `REVISION_CONFLICT` and `NETWORK` to `errors.*`, `STEP_UP_REQUIRED` to `platformAdmin.copyEditor.stepUp`, and any other code to `saveError`/`publishError`; each key exists in `ar.json` and `en.json`.
4. AC4. In a real browser, a refused save shows the translated text for the injected code: English for all four refusals, Arabic right-to-left for the dropped connection.
5. AC5. After a refusal the same Save button saves without a reload, and the app error boundary never appears.
6. AC6. The test commands exit 0.
7. AC7 (verify round 4). A non-admin opening `/admin/copy` gets the ordinary localized 404 page, right-to-left in Arabic and left-to-right in English, never the editor or a server error.

## Verification report

All runs are from 2026-10-19 on a local test stack (app :3181, fakes :4181 and :4182, database `flowline_test_181`). They used `next dev` unless the row names the production build (`FLOWLINE_TEST_NEXT=start`, the build CI and the hub use).

| AC | Test | Command | Exit | Observed |
|---|---|---|---|---|
| AC1, AC2, AC3 (envelope) | `tests/integration/platform-copy-errors.test.ts`, 5 tests | `pnpm test:integration tests/integration/platform-copy-errors.test.ts` with `DATABASE_URL` pointed at `flowline_test_181` | 0 | 5 passed |
| AC3 (mapping), AC4 and AC5 at component level | `tests/component/copy-editor.test.tsx`, every case in English and Arabic against the real catalogues, with a key-existence check | `pnpm exec vitest run tests/component/copy-editor.test.tsx --project component` | 0 | 27 passed |
| CI runs the component tests | `package.json` `test` is `vitest run --project unit --project component` (`dbf88dca`) | `pnpm exec vitest list --project unit --project component --filesOnly` | 0 | 134 unit files plus `[component] tests/component/copy-editor.test.tsx` |
| AC4, AC5, AC7 in a browser | `e2e/admin-panel.spec.ts` | `pnpm exec playwright test e2e/admin-panel.spec.ts --project=chromium --workers=1` | 0 | 4 passed (28.0 s) |
| The same, production build | same | same | 0 | 4 passed (20.0 s); the copy rows were back to `{"ar": {}, "en": {}}` afterwards |
| AC4 regression on base | the platform-admin test with `src/app/admin/copy/copy-editor.tsx` taken from `origin/main` (`264336fb`) | same, with `-g "platform admin: onboard"` | 1 | expected "This changed since you loaded it. Reload and try again.", received "Could not save the draft. Check the text and refresh if it changed elsewhere." Main shows the generic save error for a conflict |
| AC1 (non-admin and cross-site refusals), AC7 | `e2e-army/200-route-error-headers.e2e.ts`, production build | `E2E_ARMY_URL=http://localhost:3181 E2E_ARMY_CLI=none pnpm e2e:army e2e-army/200-route-error-headers.e2e.ts` | 0 | 4 passed on `fcd1bc80`. On `62d568af` the same command exited 1 because `@issue-181 AC3` failed (see below) |
| The AC7 browser check can fail | the same file with the Arabic page expected `ltr` | same | 1 | `expect.toHaveAttribute failed`; the edit was reverted and the committed file is byte-identical to the tested one |
| e2e-army file types | `tsc -p` in a temporary directory whose `node_modules` links to the hub runner's (`e2e` 0.18.0, `@e2e-dev/web` 0.13.0), `nodenext`, `strict` | | 0 | clean; a misspelled matcher gives TS2551 |
| e2e-army hygiene | `tests/unit/e2e-army-tooling.test.ts` | `pnpm exec vitest run tests/unit/e2e-army-tooling.test.ts --project unit` | 0 | 12 passed |
| Typecheck | | `pnpm typecheck` | 0 | clean |
| Lint | | `pnpm lint` | 0 | clean |
| AC6 in CI | | the CI run on the pushed head | | pending; the harness pushes. On the previous head `be71f9f`, integration shards 1 to 3 passed in run 39223185972 |

The whole `pnpm test` suite was not run locally; the brief leaves the full suite to CI.

## Screenshots (local only)

Raw evidence stays out of git (AGENTS.md, "Evidence"), and this worker cannot attach files to the PR. The PNGs are on the implementer's machine in `/var/folders/ht/4kkc2fg11lx4jlbhby0nnbkw0000gn/T/181-evidence/`. A temporary copy of the two admin-panel tests captured them on `next dev` (2 passed, exit 0); the copy was deleted and never committed. Each image was opened and checked against the table.

| File | What it shows |
|---|---|
| `en-ltr-refusal-0.png` | `REVISION_CONFLICT`: "This changed since you loaded it. Reload and try again." above the editor, which stays open with Save draft enabled |
| `en-ltr-refusal-1.png` | `STEP_UP_REQUIRED`: "Confirm your identity in the admin panel before saving or publishing." |
| `en-ltr-refusal-2.png` | `INTERNAL` (500): "Could not save the draft. Check the text and refresh if it changed elsewhere." |
| `en-ltr-refusal-3.png` | dropped connection: "Can't reach Flowline — check your connection and try again." |
| `en-ltr-saved-after-refusal.png` | the same Save draft button after the conflict refusal: "Draft saved." and no alert |
| `ar-rtl-network.png` | the Arabic editor, right-to-left, showing "تعذّر الوصول إلى Flowline — تحقّق من اتصالك ثم حاول مجددًا." with the "حفظ في المسودة" button still there |
| `en-ltr-non-admin-404.png` | a non-admin on `/admin/copy`: "We couldn't find that page" and "Go to my workspace" |
| `ar-rtl-non-admin-404.png` | the same in Arabic, right-to-left: "لم نعثر على هذه الصفحة" and "الذهاب إلى مساحة عملي" |

## Why the e2e-army AC3 test changed (`fcd1bc80`)

`@issue-181 AC3` asserted `lang="ar"` and `dir="rtl"` on the `<html>` tag of the fetched HTML. It failed on `next dev` and on the production build. The server answers a thrown `notFound()` with Next's error shell, `<html id="__next_error__">`, which has neither attribute, and the browser then renders the root layout and the 404 page from the payload. Every thrown `notFound()` in the app behaves this way. Signed in as a fresh non-admin with `fl_locale=ar`, on the production build:

| URL | Status | `<html>` in the response |
|---|---|---|
| `/admin/copy` | 404 | `<html id="__next_error__">` |
| `/admin` | 404 | `<html id="__next_error__">` |
| `/w/no-such-ws-181/canvas` (workspace layout) | 404 | `<html id="__next_error__">` |
| `/w/no-such-ws-181/flows` | 404 | `<html id="__next_error__">` |
| `/billing/checkout` | 404 | `<html id="__next_error__">` |
| `/no-such-page-181` (no route matches) | 404 | `<html lang="ar" dir="rtl" data-theme="light">` |

The probe was a one-off script and is not committed. The test came in with `c71f472a`, whose message says "Not run against a live stack", and Next has been 16.3.6 since the scaffold, so the assertion never held. The test keeps its title and its checks on the fetched HTML (404, the localized text, no copy-editor keys, now in English as well). On the rendered page it checks `lang` and `dir`, the 404 heading and the absence of the editor heading, in Arabic and in English. Its tag changed from `lvl:api` to `lvl:ui` because it now drives a browser.

The missing `lang`/`dir` in the server HTML affects the whole app and is not changed here. It needs an owner decision, since issue creation is frozen.

## The spec's contract-test criterion

The issue asks for a contract test of the code-to-key mapping and the envelope. No file under `tests/contract/` covers it. The integration test covers the envelope end to end by handing each real route Response to `api()`, and the component tests cover the mapping, including a check that each key exists in both catalogues. The app-wide `apiErrorMessage` in `src/i18n/errors.ts` does not list `UNSUPPORTED_MEDIA_TYPE` or the `COPY_*` codes; the copy editor's write path does not use it and shows `saveError` or `publishError` for them.

## Changed covering tests (this round)

- `e2e/admin-panel.spec.ts`: the non-admin `/admin/copy` 404 test (`d66488f4`) and the refused-save checks inside the platform-admin test (`62d568af`).
- `package.json`: `pnpm test` also runs the `component` project (`dbf88dca`).
- `e2e-army/200-route-error-headers.e2e.ts`: AC3 checks language and direction in the browser (`fcd1bc80`).

- `tests/component/copy-editor.test.tsx`: userEvent setup scoped to beforeEach per locale, and the NETWORK error immediate-alert test parameterized across both save and publish with request validation.
- `src/app/admin/copy/copy-editor.tsx`: type-safe literal MessageKey ternary for REVISION_CONFLICT and NETWORK.

`tests/integration/platform-copy-errors.test.ts` was not changed this round; rerun above.

## Left for the harness

- Push, get green `gate` and `docs`, and run the full tier once on the final candidate: `e2e/admin-panel.spec.ts` runs only there.
- Check that the hub's e2e-army result lists the four tests of `e2e-army/200-route-error-headers.e2e.ts`.
- Attach the screenshots to the PR if they are wanted there.
