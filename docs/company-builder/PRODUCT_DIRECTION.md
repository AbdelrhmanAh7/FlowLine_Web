# Company Builder — product direction (v2, 2026-09-30)

Status: **HYPOTHESIS READY TO TEST.** The competitive edge is **NOT YET PROVEN**: no competitor has been tested and no
real customer has used this flow (see `COMPETITIVE_TEST_PROTOCOL.md`).

## The bet

A small business owner doesn't want "a company of AI employees". They want **one result that improves**, set up
quickly, whose output they can trust. Company Builder therefore starts from the result, not from an org chart:

1. **Outcome first.** The first question is *"What is the first result you want to improve?"* in the owner's words.
   Every later question exists only because its answer changes the workflow, data, integration, permission, approval,
   ownership, output, feasibility or cost (`QUESTION_MODEL.md`).
2. **The first output is a plan**, not a running system: goal, trigger, input data, steps, connections, roles and what
   they don't do, reviewer, expected result, what is automatic / prepared for review / kept with a person, what still
   needs setup, what needs approval, what isn't supported, and the cost with its unknowns stated.
3. **One primary outcome, a small team.** One tested task pack, one role (at most three), **zero agents unless the work
   is genuinely ambiguous**. Headcount never drives the number of agents. Other areas become *possible next
   improvements*: listed, never prepared or turned on.
4. **Preview before payment or activation.** A labelled sample run through the real engine, a human-readable result,
   and the owner's own verdict (*"Does this result match what you wanted?"*). Activation needs the objective checks
   **and** that verdict — neither replaces the other.
5. **Honesty.** "Ready to configure." / "Needs Gmail connection." / "Uses sample data until you connect your account." /
   "Requires approval before sending." Never "Your company is running". Simulated results are never presented as live.

## What was built (first vertical slice)

**Customer Request Follow-up** (`customer-follow-up` v1) end to end:

- interview;
- plan;
- idempotent draft creation;
- sample trial through the real engine and worker;
- objective checks (independent TypeScript re-computation);
- human-readable result;
- the owner's acceptance or rejection with a reason;
- a test action into the local sample outbox after review;
- entitlement-gated activation, bound to the trial-verified graph;
- pause and lapse.

Arabic and English are both covered.

Also available as tested packs (not the first slice): invoice organisation, team operations summary, lead
qualification, content preparation. See `TASK_PACKS.md`.

## What was deliberately NOT built

- No autonomous sending. Replies are drafts. The Gmail connection is shown as needed; nothing is sent externally.
- No local model inference and no AI in the default packs (fixed rules only, so no AI cost).
- No OCR. Invoices must already be digital.
- No hiring decisions. Recruitment stays planned only.
- No scheduled or unattended activation. Only a manual trigger can be activated in this build.
- The customer cloud AI mode (`CUSTOMER_CLOUD`) is not enabled.
- The owner-only CLI prototype remains private: founder identity, designated workspace and private bind (`CLI_PROTOTYPE.md`).

## Modes (unchanged)

| Mode | Who | What |
|---|---|---|
| `DETERMINISTIC_TEST` (default) | every workspace (flag `FLOWLINE_COMPANY_BUILDER=on`) | reviewed rules + tested packs; no model |
| `OWNER_CLI_PROTOTYPE` | the founder only, designated workspace, private host | Claude/Codex CLI may propose/tune the plan and run text trials; output is re-validated; never exposed to customers; payment or ownership never grants it |
| `CUSTOMER_CLOUD` | nobody (not enabled) | customer's own cloud AI connection through the UI |

## How we'll know (research, not claims)

Experiment mode (`FLOWLINE_CB_EXPERIMENT=on`) measures time to plan preview, questions, edits before the first
accepted result, connections required, time to the first verified result, active vs waiting vs external vs support time,
AI cost vs platform charges vs support effort, acceptance, and reuse in the following week. The **30% setup-time** and
**25% cost** reductions are *research targets* for the competitive test, never product claims.
