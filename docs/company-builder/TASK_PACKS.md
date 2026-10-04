# Company Builder — verified task packs

A task pack is a **tested workflow template** (`src/company-builder/packs/*.ts`). It is not a prompt and not an agent.
Each pack declares these fields:

| Field | Meaning |
|---|---|
| `id` and `version` | Identify the pack; a version is immutable once installed. |
| `department` | The outcome area it serves. |
| `nodeTypes` | The only step types allowed (all local). |
| `capabilities` | What the pack can do, in business-language copy. |
| `compile(params)` | Owner parameters are embedded as JSON **literals** (`lit()`), never as code. |
| `sample(params)` | A labelled sample input. |
| `evaluate(output, input, params)` | Objective checks that **re-compute the expected result independently in TypeScript**; the flow's own claims are not trusted. |
| `fixtures` | Generic fixtures; the first-slice pack also has a frozen fixture file. |

A trial is a real engine run (worker). Its verdict keeps four things apart:

1. **Structure is valid**: the graph validates.
2. **Ran without errors.**
3. **Result matches what was asked**: every objective check passes.
4. **The person's own acceptance**: stored separately (see `lifecycle.ts`).

A trial is refused as "sample-safe" if a person added steps outside the pack's local node types.

| Pack | v | Outcome | Steps (local only) | Output | Status |
|---|---|---|---|---|---|
| **`customer-follow-up`** (A) | 1 | customer | trigger.manual, transform.json ×2, logic.condition, data.store, output ×3 | `reply_draft` for review **or** `needs_person` + `follow_up_record` | **First vertical slice: complete** |
| `invoice-organiser` (B) | 1 | finance | local only | `ledger_draft` / `discrepancy_review` | Tested pack (from phase 1); not the first slice |
| `operations-summary` (C) | 1 | operations | local only | `summary_draft` / `needs_input` | Tested pack (unit + fixtures); not exercised end to end in the browser |
| `lead-qualification` (D) | 1 | sales | local only | `qualified_lead` / `needs_person` (no automatic rejection) | Tested pack (unit + fixtures); not exercised end to end in the browser |
| `content-brief` | 1 | content | local only | `content_draft` / `needs_input` | Tested pack (phase 1) |
| `customer-triage` | 1 | customer | local only | reply / hand-off | **Superseded** by customer-follow-up for new plans; kept so older installed blueprints keep working |

## A — Customer Request Follow-up (first slice)

**Parameters** (from the interview):

- `approvedInfo`: the owner's approved lines, at most 1200 characters.
- `services`: aliases separated by `|`, Arabic or English.
- `requiredDetails`: any of service, date and phone.
- `followUpHours`: 24.
- `timezone`: the workspace's IANA time zone.
- `language`.

**What it does**

1. **Normalises** Arabic-Indic and Persian digits and **extracts** service (by alias), date (`YYYY-MM-DD`) and phone (9–14 digits,
   with dates removed first). Relative dates such as "tomorrow" are *not* guessed; the date is then asked for.
2. **Classifies** the topic, matching keywords at word starts only. Order: complaint → refund → pricing → coverage → hours → delivery. Each approved line
   belongs to its first matching topic only, so a line about cancellation windows mentioning "hours" is not an hours answer.
3. **Hands off to a person** when the request is empty, is a complaint (even one that mentions a price or refund), or
   when no approved information applies.
4. Otherwise it **drafts a reply** from approved lines only, plus fixed Arabic/English templates asking for each
   missing detail (the templates contain no numbers). The request text is never echoed back, and instruction-like text
   is flagged `suspicious` and treated as data.
5. **Records the follow-up** with `data.store` in the namespace `cb_customer_follow_ups`:
   - Key: the request id; `sample:<id>` for sample runs, so sample records never mix with real ones.
   - Contents: status (`awaiting_review` / `needs_person`), detected fields, missing details, and
     `next_follow_up_at` = received time + 24 h (null when the request has no timestamp; never invented), with its time zone.
   - Re-running the same request updates the same record rather than adding a duplicate.

**Objective checks.** Since the independent review (FB-01), `recomputeFollowUp` recomputes the **entire expected
result** in TypeScript from the request and the owner's parameters: outcome, hand-off reason, exact approved lines,
exact reply text, and the record's key, customer and follow-up time. Each check compares the flow's output with that
result, never with the flow's own claims:

| Check | What it verifies |
|---|---|
| `one_outcome` | Exactly one of: a reply or a hand-off. |
| `follow_up_recorded` | A follow-up record exists. |
| `record_status_consistent` | The record's status matches the outcome. |
| `details_extracted_correctly` | Fields and the missing list match a TypeScript re-extraction. |
| `reply_to_sender` | The recipient is the sender, never invented. |
| `reply_only_approved_info` | The reply uses approved lines only. |
| `no_invented_numbers` | Every digit in the reply comes from the owner's approved lines; digits in the reply's own claims or in the request don't count. |
| `request_text_not_echoed` | The request text isn't copied into the reply. |
| `asks_for_missing_details` | The reply asks for exactly the recomputed missing details. |
| `review_required` | The reply waits for review. |
| `handoff_has_reason` | A hand-off states its reason. |

**Evidence**

- **Frozen fixtures** (`tests/fixtures/company-builder/customer-follow-up.fixtures.ts`, committed before the pack in
  `6afd2e4`):
  - fu-01…fu-10: complete English request, missing details, Arabic digits, complaint with a price, injection, empty,
    unknown service, mixed language with a relative date, no timestamp, sample-labelled.
  - Run 1: 11/14 tests (`follow-up-fixtures-run1-3-FAILED.txt`; two real defects, fixed without editing the fixtures).
  - Run 2: 14/14. After the review fixes the test file has 25/25 (11 regressions added, each confirmed failing on the old pack).
- **Wrong-result test:** a structurally valid output with a wrong business result fails the exact checks listed in the test.
- **Key-order independence:** stored run output is jsonb, which reorders keys. Bug CB2-01 was found by the integration
  run and fixed with a regression test.
- **Integration:**
  - a real sample run writes one `sample:` record in the workspace time zone;
  - an edited draft that invents a refund and a price is caught;
  - accepting that result never makes it verified.
- **E2E (Chromium, Firefox):** the full journey including rejection with a reason, then acceptance, a refresh, the
  test action and activation.


**Owner decisions 2026-10-01 (in `1fe3d31`)**

- **Refunds and cancellations always need a person.** The pack:
  - identifies the request (topic `refund`: refund, cancel, cancellation, استرداد, إلغاء…);
  - quotes only the approved policy lines and adds a fixed note that names the business owner as the decision maker for that request and promises no outcome;
  - flags the draft and the record `consequential: "refund_or_cancellation"` / `requires_human_decision: true`;
  - leaves the draft `awaiting_review`.

  The review inbox labels the item, and approving it only puts the draft text in the outbox. No refund or payment step
  exists in the flow; the node types are local only, and trials refuse anything else.

  Check `consequential_needs_person`. Tests: unit REF-* (AR/EN refund and cancellation, tampering, no promise, REF-NOTE
  for the fixed note naming the owner as the decision maker) and
  integration REF (an editor can't approve, nothing is sent before the owner approves, billing is unchanged).
- **Phone numbers as written.** Groups separated by spaces, dots, dashes or parentheses are joined for comparison only
  when they start with "+" or 0 and give 9–13 digits; no country code is guessed. `phone_display` keeps the written form.
- **Records per interview.** The storage key is `<session id>/<sample:>request id` (`recordScope`), so two interviews
  in one workspace never overwrite each other, and retries or new plan versions update the same record.

**Limits** (shown honestly in the plan):

- The Gmail connection is *needed*, not connected; the trial uses sample data.
- A chat or phone channel is unsupported and disclosed as such.
- No sending: approving the test action writes to the local sample outbox only.
- Free-form questions outside the approved lines go to a person. An AI answers-assistant is a *possible next
  improvement* only.

## B–D and others

- **Invoice organisation (B).** Fields are checked, totals recomputed per currency (currencies are never added
  together) and ledger rows drafted. Discrepancies go to review. No OCR: paper needs a digital copy (a blocker says so).
- **Team operations summary (C).** Permitted task-status items are normalised; counts and overdue/blocked items come
  from fixed rules; a template summary is prepared for review. Malformed items are listed; nobody's performance is
  judged. Built by a Sonnet helper and reviewed by Claude (params embedded as data only, local steps only). 10 unit tests.
- **Lead qualification (D).** A lead is normalised and scored against minimum size, target countries and excluded
  domains, with the reasons shown. Leads that don't meet the criteria go to a person; nobody is rejected automatically.
  Built by a Sonnet helper and reviewed by Claude. 6 unit tests.

Packs B–D are **not prerequisites** for the first slice and have no browser journey of their own in this change.
