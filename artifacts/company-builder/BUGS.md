# Company Builder — findings log (direction v2, first vertical slice)

This is the running log for the direction-v2 change (`816f342..HEAD`). Phase-1 findings stay unchanged in
`20260930-51f1473/BUGS.md` (historical evidence; not rewritten).

**Severity:**

| Level | Meaning |
|---|---|
| P0 | Blocker |
| P1 | Must fix before an owner trial |
| P2 | Should fix |
| P3 | Minor |

**Source:**

| Code | Where the finding came from |
|---|---|
| `unit`, `int`, `e2e` | The automated suites |
| `explore` | Exploratory pass in Chromium. This substitutes for real Google Chrome, which the container's network policy blocks (`dl.google.com`, 403). |
| `helper-review` | Claude reviewing a Sonnet helper's diff |
| `fable` | Independent Fable review |

| ID | Sev | Finding (reproduction → expected / actual) | Source | Status | Fix / evidence |
|---|---|---|---|---|---|
| CB2-00 | P1 | Follow-up pack run 1 against the frozen fixtures: 3/14 tests failed (11/14 passed). (a) The cancellation line "…24 hours…" was classified as an *hours* answer. (b) The evaluator checked numbers against the reply's own `used_lines` and compared missing details with the record, so it could not catch invented numbers or wrong extraction. | unit (frozen fixtures, before tuning) | FIXED | Each approved line belongs to its first matching topic only. The evaluator re-computes details independently and allows only digits from the owner's approved lines. The fixtures were **not edited**. Evidence: `v2-first-slice/follow-up-fixtures-run1-3-FAILED.txt` → `follow-up-fixtures-run2.txt` (14/14). |
| CB2-01 | P1 | Stored run output is Postgres jsonb, which reorders object keys. The follow-up evaluator compared `detected` with `JSON.stringify`, so **every real trial was reported "doesn't match"** even with a correct result. `operations-summary` had the same pattern. The in-memory unit runs hid it. | int (real worker) | FIXED | `sameJson` (canonical, key-order independent) in `packs/types.ts`, used by both packs. Regression unit test "evaluators don't depend on object key order", confirmed to fail on the old code. int: "a sample trial runs…" 28/28. |
| CB2-02 | P2 | The owner CLI text trial was hard-wired to `customer-triage`. New plans no longer contain it, so every text trial would fail with "Task not found". | Claude reading the code after the direction change | FIXED | Envelope accepts `customer-follow-up` (and legacy triage). The API targets the follow-up task and adds a stable per-job request id; no timestamp is invented. The fake CLI was updated; int-cli 16/16. |
| CB2-03 | P3 | The `other_areas` "why we ask" text promised "their own questions", but other areas only become next improvements. | Claude copy review | FIXED | AR/EN copy now says they are listed as possible next improvements only, and nothing is prepared or turned on. |
| CB2-04 | P3 | The experiment panel hard-coded Arabic duration units and a `$` sign outside i18n. | helper-review | FIXED | `experiment.duration` key; `Intl.NumberFormat` currency. |
| CB2-05 | P1 | The follow-up time used `dateStyle`/`timeStyle` together with `timeZoneName`, which throws a `TypeError`. The "fallback" retried the same options, so **the session page crashed** as soon as a result was shown. | e2e (Chromium) | FIXED | `src/company-builder/format.ts` uses explicit fields and a safe fallback (UTC, raw ISO). Unit `cb-format.test.ts`. E2E Chromium 4/4, Firefox 3/3. |
| EX-01 | P2 | The Arabic plan showed raw keys (`work.item.extract_request_facts`…) under "What happens automatically": planner work items can be capability ids, and the UI didn't look them up. | explore | FIXED (retest pending) | `workItem` looks up `node` → `work.item` → `capability`. Unit "every plan item the planner produces has business copy in both languages". |
| EX-02 | P3 | Arabic digits are inconsistent: the follow-up time uses Arabic-Indic digits, while the plan version ("النسخة 1") and the run range ("80–450") use Latin digits. Readable, but mixed. | explore | OPEN | Needs a product decision on digit style in interpolated numbers (the app-wide `t()` doesn't format numbers). |
| EX-03 | P3 | The approval section rendered as "…before sending. Owner", which reads as one broken sentence. | explore | FIXED (retest pending) | Now two lines: "Requires approval before sending." and "Who reviews: …". |
| BENCH-V1 | — | Frozen benchmark v1 now scores 7/12 (0 violations). B01, B06, B08, B10 and B11 fail on task selection because v1 expects the previous direction: multi-agent plans and several departments at once. | unit | ACCEPTED (direction change) | v1 expectations are **unchanged**; only the scorer's allowed local step types gained `data.store`, with a comment. Benchmark v2 (frozen before the planner change) scores 12/12, written by the same author for the deterministic generator only. `v2-first-slice/benchmark-v1-rescored.json`, `benchmark-v2.json`. |
| ENV-04 | P3 | `pnpm stop:test` did not stop a production-mode (`FLOWLINE_TEST_NEXT=start`) stack: `next start` and the fake servers kept ports 3100/4010/4011. A restart then silently served the OLD build, and every E2E test failed. | e2e run | OPEN (tooling) | Workaround: kill the listeners by PID before restarting. Pre-existing tooling; not changed here. |
| PRE-02 | P2 | Pre-existing E2E race in `failures.spec.ts:97`, from phase 1. | e2e | OPEN (pre-existing) | Unchanged by this work. |
