# PR #461: wait for the question before answering "don't know"

Tested SHA of the code change: ede1089a (head before this docs commit).

## Acceptance criteria

1. AC1: `e2e/company-builder.spec.ts` waits until `data-question` equals the expected id before clicking `cb-dont-know`.
   Evidence: helper `answerUnknown(page, questionId)` in `e2e/company-builder.spec.ts`; it asserts the attribute, then clicks.
2. AC2: Both "don't know" clicks (`cust_volume`, `other_areas`) go through the helper, so the second click cannot land on the previous question.
   Evidence: the diff replaces both direct clicks with `answerUnknown`.
3. AC3: No product code, CI workflow, assertion or timeout changes.
   Evidence: the PR's own commits (ede1089a, 1e2223ac, 44d1bbc5) change only `e2e/company-builder.spec.ts` and add this evidence file.
4. AC4: The `chromium` job on this PR passes, including `company builder (first slice)`.
   Evidence: PR checks on ede1089: `chromium` success, `gate` success.

## Root cause

The test had a race condition: after answering `cust_info`, the page renders the `cust_volume` question. The original test code clicked `cb-dont-know` for `cust_volume`, then immediately clicked `cb-dont-know` again for `other_areas` **without waiting for the `data-question` attribute to change to `other_areas`**. In the failed run (40061992174), the second click executed while `cust_volume` was still rendered, so `other_areas` was never answered and the test timed out waiting for "No more questions would change the plan."

The fix introduces `answerUnknown(page, questionId)` which:
1. Asserts `data-question` equals the expected `questionId` (Playwright auto-retries until the attribute matches)
2. Only then clicks `cb-dont-know`

This binds each "don't know" click to its own question, eliminating the race.

## Regression note

The failure was a race in the test (run 40061992174, `e2e/company-builder.spec.ts:72`), not a product bug. It was not reproduced locally because the spec needs the built stack; the green `chromium` run on this head is the only evidence. A single green run does not prove a flaky race is gone.

No screenshots: no UI change.

## Clarifications

- **`cust_info` is a free-text question**, not multiple-choice. The test uses `answerText(page, "cust_info", ...)` which fills a `<textarea>` / textbox. This is correct and unchanged by this PR.
- The `answerText` helper is used for `offering`, `cust_services`, and `cust_info` — all three are free-text questions in the interview flow.
- Only `cust_volume` and `other_areas` are "don't know" questions (they present a "I don't know" button instead of text/radio/checkbox inputs), so they use the new `answerUnknown` helper.
