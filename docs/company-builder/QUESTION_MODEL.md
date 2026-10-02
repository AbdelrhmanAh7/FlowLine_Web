# Company Builder — question model (bank v2)

Source: `src/company-builder/questions.ts` (`QUESTION_BANK_VERSION = 2`). Copy (title + "why we ask") is in
`src/i18n/messages/{ar,en}.json` under `companyBuilder.q.<id>`.

## Rules

- **Every question states what its answer changes** (`affects`, required, non-empty; unit-tested):
  `workflow · data · integration · permission · approval · ownership · output · feasibility · cost`. A question whose
  answer changes nothing is not in the bank.
- **Outcome first.** Stage 0 opens with the free-text result to improve (`offering`) and the closest outcome
  (`first_outcome`); an inference from the text is shown as a suggestion to confirm, never stored as confirmed.
- **Only the primary outcome's questions are asked.** Other areas (`other_areas`, asked last) become possible next
  improvements without their own questions.
- **Conditional** (`when` / `skipIf`): e.g. `cust_info` is skipped when requests are routed, not replied to; `tools_other`
  only when "Other" is picked; `client_name` only for agencies.
- **"I don't know yet"** is allowed wherever a missing answer can be planned around; it becomes an explicit
  unknown/blocker (e.g. `details_assumed`, `execution_volume`), never a guess.
- **Back / Edit / Save and continue**: every answer is saved immediately with optimistic concurrency; Back returns to the
  previous question with its answer; corrections create a new fact version (history kept); a changed answer produces a
  new plan version with a diff that needs review — never a silent overwrite.
- **No fake progress total**: the UI shows "You've answered N questions", not "N of M". Hard cap: 18 distinct questions.
- **Contradictions** are flagged and re-asked (e.g. "Just me" + a team member as reviewer).
- Free text is length-capped, control characters are stripped, and it is stored as data only (never code).

## Bank (order = stage, then position)

| Stage | Id | Kind | Asked when | Affects | Essential |
|---|---|---|---|---|---|
| 0 | `offering` | text ≤600 | always | workflow, data, integration | no |
| 0 | `first_outcome` | single (customer, finance, operations, sales, content, recruitment, other) | always | workflow, feasibility | yes |
| 0 | `situation` | single (start, improve, client) | always | data, feasibility | yes |
| 0 | `client_name` | text ≤80 | situation = client | permission, data | yes |
| 1 | `cust_channel` | single (email, form, chat, phone) | primary = customer | integration, data, feasibility | yes |
| 1 | `cust_reviewer` | single (owner, team_member) | customer | approval, ownership | yes |
| 1 | `cust_details` | multi (service, date, phone) | customer | workflow, output | no |
| 1 | `fin_location` / `fin_currency` / `fin_reviewer` | — | primary = finance | integration/data/feasibility · workflow/output · approval/ownership | yes |
| 1 | `ops_source` / `ops_reviewer` | — | primary = operations | data/integration/feasibility · approval/ownership | yes |
| 1 | `lead_source` / `lead_reviewer` | — | primary = sales | data/integration/feasibility · approval/ownership | yes |
| 1 | `rec_need` | single | primary = recruitment | feasibility | yes |
| 1 | `content_output` / `content_reviewer` | — | primary = content | feasibility/output · approval/ownership | yes |
| 2 | `team` | single (solo…large) | outcome known | approval, ownership (never agent count) | no |
| 2 | `tools` / `tools_other` | multi / text | outcome known / "other" picked | integration (+feasibility) | no |
| 3 | `cust_next`, `cust_services`, `cust_info`, `cust_volume` | — | customer | workflow · data/output · data/output · cost | no |
| 3 | `fin_need`, `ops_frequency`, `lead_min_size`, `hiring` | — | their outcome | output/integration · workflow/cost · workflow/output · ownership | no |
| 4 | `other_areas` | multi | outcome known | feasibility (next improvements only) | no |

The plan can be previewed as soon as the essentials of the primary outcome are known (the frozen benchmark v2 asserts
≤6–7 answers for the acceptance journeys); later questions refine it and each produces a reviewable plan diff.

## Evidence

- Unit: `tests/unit/company-builder.test.ts`:
  - "every question exists because its answer changes the plan";
  - "starts from the first result to improve…";
  - contradiction, Back and correction tests.
- Benchmark v2 (frozen before the change): 12/12. Benchmark v1 (frozen, previous direction): 7/12. The five v1 cases
  expect the old multi-agent plans, so this is a deliberate direction change, not a regression (`REPORT.md`).
