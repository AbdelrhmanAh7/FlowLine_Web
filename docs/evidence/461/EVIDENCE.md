# PR #461: wait for the question before answering "don't know"

Tested SHA of the code change: ede1089a (head before this docs commit).

## Acceptance criteria

1. AC1: `e2e/company-builder.spec.ts` waits until `data-question` equals the expected id before clicking `cb-dont-know`.
   Evidence: helper `answerUnknown(page, questionId)` in `e2e/company-builder.spec.ts`; it asserts the attribute, then clicks.
2. AC2: Both "don't know" clicks (`cust_volume`, `other_areas`) go through the helper, so the second click cannot land on the previous question.
   Evidence: the diff replaces both direct clicks with `answerUnknown`.
3. AC3: No product code, CI workflow, assertion or timeout changes.
   Evidence: `git diff main..HEAD --stat` lists only `e2e/company-builder.spec.ts` (+ this file).
4. AC4: The `chromium` job on this PR passes, including `company builder (first slice)`.
   Evidence: PR checks on ede1089: `chromium` success, `gate` success.

## Root cause

Race in the test. After `cust_info` the page renders `cust_volume`; the first `cb-dont-know` click advances to `other_areas`. The old code issued the second click right after the first, without waiting for `data-question` to change, so in run 40061992174 the click ran while the previous question was still rendered and `other_areas` was never answered. `answerUnknown(page, questionId)` asserts `data-question` equals the expected id (Playwright retries until it does), then clicks, so each click is bound to its own question.

## Regression note

The failure was a race in a test (run 40061992174, `e2e/company-builder.spec.ts:72`), not a product bug. It was not reproduced locally because the spec needs the built stack; the green `chromium` run on this head is the only evidence. A single green run does not prove a flaky race is gone.

No screenshots: no UI change.

Review note: the `answerText` call at `cust_info` stays; that question takes a text answer, and only the two "don't know" questions use `answerUnknown`.
