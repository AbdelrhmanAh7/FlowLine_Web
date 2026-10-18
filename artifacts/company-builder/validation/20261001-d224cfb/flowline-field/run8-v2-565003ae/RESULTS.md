# Field run 8 — packet.v2.json, final harness (scoring record for #142)

**Candidate:** `565003ae` (branch `ai/142`). The harness at this head includes the path sanitizer (`tests/helpers/file-path-sanitizer.ts`), the byte-level checksum check (`tests/helpers/packet-checksum.ts`, called by `field.spec.ts`), the inflected-Arabic scorer fixes and the current `fieldScoring.ts`; runs 6 and 7 predate these.
**Packet:** `packet.v2.json`, sha256 `3684c632fafa91e116f4095be8f37420041f15b43003c9c02910adfefb5ac11e`, recomputed from the file bytes by the spec and compared with `packet/SHA256SUMS` before the run (a mismatch throws); recorded as `summary.packetSha256` in `results.json`.
**Run ID:** `run8-v2-565003ae` · **Run at (UTC):** `2026-10-18T23:18:19.196Z`
**Command:** `FIELD_RUN=run8-v2-565003ae PACKET=packet.v2.json FIELD_SERVICES=slash npx playwright test -c artifacts/company-builder/validation/20261001-d224cfb/flowline-field/field.config.ts --workers=1` → exit 0, `1 passed (16.5s)`.
**Environment:** isolated test stack (`FLOWLINE_TEST_DB=flowline_test_142 FLOWLINE_BETA_MODE=open pnpm dev:test`: `next dev` on :3100, worker, fake providers :4010 and fake AI :4011; no real model). `/api/health?require=worker` returned `db: ok`, `worker: ok`, `schemaVersion: 28` before the run. Database: Homebrew PostgreSQL 16 on :5432 (CI uses 17), `flowline_test_142` created empty before the run. `.env.test` was a disposable copy of `.github/ci/env.test.template` with fresh fake secrets (git-ignored). The stack was stopped afterwards.

## Score: 8/10

| ID | Passed | Failed checks | Note |
|---|---|---|---|
| VP-01 | true | — | quotes the deep-cleaning price |
| VP-02 | true | — | asks for date and phone, no invented price |
| VP-03 | **false** | `closedDay` | Arabic reply quotes the office-cleaning price and a generic closing; no working-hours line for the Friday (2026-10-09) request |
| VP-04 | true | — | confirmation |
| VP-05 | true | — | `ownerDecision` = true: "The business owner decides this refund or cancellation request. Nothing has been refunded or cancelled." |
| VP-06 | **false** | `noPromise:cancelled` | `ownerDecision` = true (same owner sentence); fails only the existing VF-02 fixture ambiguity |
| VP-07 | true | — | hand-off |
| VP-08 | true | — | quotes the working-hours line |
| VP-09 | true | — | hand-off |
| VP-10 | true | — | hand-off |

Flowline's own verdict disagreements: none. Review gate: `outboxBefore` = `outboxAfterRequestNoApproval` = 0; refund item `pending` / `refund_or_cancellation`. FC-3: changed answer → plan version 2, `review_required`, VP-03 quotes the new price.

## What this shows for #142
- **`packet.json:41` (VP-03, Friday):** a Friday service reply without the approved working-hours line scores `closedDay` = false. The product's reply still has no hours line, so VP-03 stays failed (product follow-up, not part of #142).
- **`packet.json:44` (VP-05/VP-06, owner decision):** `ownerDecision` is true for both because the reply itself says the owner decides. The opposite direction (a reply without owner wording, or one that hands the decision to a team member, fails) is pinned offline by `tests/unit/field-scoring.test.ts`.
- This run is the scoring record on the final harness. Runs 6 and 7 gave the same per-VP pattern on earlier heads. Runs 1–7 are untouched.

## Integrity
`shasum -a 256 -c SHA256SUMS` and `-c SHA256SUMS.derived` in `packet/`: every line OK (v1 and v2). `git diff main..HEAD` on the v1 packet files and runs 1–4 is empty.

## Not committed
`results.json` and the two screenshots stay local / attached to the PR (AGENTS.md evidence rule).
