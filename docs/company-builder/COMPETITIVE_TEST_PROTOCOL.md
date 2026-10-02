# Company Builder — competitive test protocol

Status: **protocol ready; nothing tested.** Every competitor row is **NOT TESTED**. No result, time or cost below is a
measurement. The competitive edge is **NOT YET PROVEN**.

The dataset is in `competitive-dataset.json`, next to this file. It has one row per tool and task, all with
`status: "NOT_TESTED"` and null measurements.

## Hypothesis

For a small service business setting up its first useful result, **Customer Request Follow-up**, Flowline's
outcome-first builder reaches a *verified* first result with:

- **≥30% less setup time** than the best comparable tool (research target);
- **≥25% lower monthly cost** at the same volume (research target).

Both are *research targets*. They must never appear in product copy until measured under this protocol.

## Tasks (frozen synthetic inputs)

| Task | Input set | "Verified" means |
|---|---|---|
| T1 Customer Request Follow-up | `tests/fixtures/company-builder/customer-follow-up.fixtures.ts` (fu-01…fu-10) | For every fixture, the expected outcome (reply for review / hand-off with the reason), the correct extracted fields and missing list, a reply only from approved lines with no invented numbers, a follow-up record with the right time; and the participant says the result matches what they wanted |
| T2 Invoice organisation | invoice pack frozen fixtures | Per-currency totals correct, discrepancies flagged, nothing added across currencies |
| T3 Team operations summary | operations pack fixtures | Counts, overdue and blocked items match the recomputation |
| T4 Lead qualification | lead pack fixtures | Criteria applied with reasons, no automatic rejection |

T1 is the first comparison. T2–T4 follow only after T1 is measured.

## Participants and setup

- 5–8 small-business owners or operators per language (Arabic and English). None has used any of the tools before.
  They use their own laptop and a real Google Chrome.
- Each participant does T1 in Flowline and in **one** competitor, in counterbalanced order.
- Inputs are the frozen synthetic fixtures. **No real customer data.**
- Each tool is used in its own documented free or trial tier, with the participant's own account. Flowline never
  collects competitor credentials.
- A moderator observes and records. The moderator does not touch the keyboard; any help given is logged as support time.

## Metrics (same definitions for every tool)

Flowline computes these automatically in experiment mode (`FLOWLINE_CB_EXPERIMENT=on`,
`src/company-builder/experiment-metrics.ts`). For competitors, the moderator records them by stopwatch using the same
definitions.

| Metric | Definition |
|---|---|
| Time to plan preview | Session start → first plan/preview shown |
| Questions to preview | Distinct questions answered before the first preview |
| Edits before first accepted result | Answer changes after the first preview, up to the first accepted result |
| Connections required | Distinct services the plan needs that aren't connected |
| **Time to first verified result** | Session start → the first moment BOTH (a) all objective checks pass on a sample run and (b) the participant says the result matches what they wanted |
| Active user time | Time the participant is actually interacting (visible tab + input within 60 s; ≤60 s per sample) |
| System waiting time | Time spent waiting on runs (trial created → completed) |
| External onboarding delay | Time spent in third-party sign-up, verification or consent screens (moderator-logged, minutes) |
| Support time | Moderator or support help (logged, minutes) |
| AI cost | Only what a provider or CLI **reported**; never estimated. Flowline's default packs use no AI, so 0 |
| Platform charges | The tool's own plan price at the tested volume, from its public pricing page on the test date (cited); **not measured in sandbox** for Flowline |
| Support effort | = support time, reported once (not added to AI cost or platform charges) |
| Acceptance | Accepted / rejected results, with the reason |
| Reuse next week | A non-trial run of the same workflow 1–8 days after the first verified result |

**No double counting.** Each minute or unit of cost sits in exactly one bucket:

- active, waiting, external and support time are separate;
- AI cost, platform charges and support effort are separate.

## Procedure

1. Consent. Explain that the inputs are synthetic and that everything is recorded.
2. Give the participant the one-paragraph T1 goal (same text for every tool).
3. Start the clock. The participant sets up the tool until they believe it works, running the sample inputs.
4. The moderator runs the verification checklist for the frozen fixtures and marks each fixture pass or fail.
5. Ask: "Does this result match what you wanted?" (yes / no + reason).
6. Stop at the first verified result, or after 60 minutes (recorded as "not reached").
7. One week later, ask whether they reused it (and check run logs where possible).

## Analysis and reporting

- Report per tool: median and IQR for each time metric, and the verified-result rate.
- Report the failures in full; never drop a participant.
- A claim such as "30% less setup time" is allowed only if the median time to first verified result is ≥30% lower than
  the best competitor in the **same language**, with n ≥ 5 per arm. Otherwise the report says "not shown".
- Evidence goes to `artifacts/company-builder/competitive/<date>/`, tied to the tested Flowline SHA and each tool's
  version or date. It contains no participant personal data.

## Honesty rules

- A row stays `NOT_TESTED` until a session is recorded with evidence.
- A competitor's marketing claim never counts as a result.
- If a tool can't do the task, record "not reached" with the reason. Don't adapt the task in its favour or against it.
