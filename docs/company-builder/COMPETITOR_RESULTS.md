# Company Builder — competitor results (validation sprint 2026-10-01)

**Status: NO COMPETITOR WAS TESTED.** Every competitor row below is **BLOCKED**. Nothing here is a measurement of a
competitor, and nothing is inferred from the absence of a test. A feature that was not observed is recorded as
"not observed", never as "missing".

## Frozen test

| Item | Value |
|---|---|
| Business case and evidence packet | `artifacts/company-builder/validation/20261001-d224cfb/packet/packet.json` |
| Packet sha256 | `4fa9841b2a5f40f76ea197e9a1a9f5dd4c10b3796e156968b4808f9d495d6596` |
| Freeze commit | `ec35061` — committed **before** any product, Flowline included, was run against it |

The packet holds:

- the company description;
- approved information, including the cancellation and refund policy;
- 10 requests: English, Arabic, a spaced +20 phone number, refund, cancellation, complaint, injection, unknown service
  and empty;
- the reviewer;
- the expected outcome, extraction, quotes, forbidden content, recipient and follow-up time for each request;
- four failure cases.

It must not be edited after seeing any output; a new version is added instead.

## Why nothing could be run

| Product | Priority | Access | Account / plan | Result |
|---|---|---|---|---|
| Gumloop | 1 | `www.gumloop.com` unreachable from this environment (no HTTP response), re-checked from a fresh container (`session_01UzSUvvonW6s2cevu1LjLhD`, archived) | none created | **BLOCKED — NOT TESTED** |
| Relevance AI | 2 (either/or) | `app.relevanceai.com` unreachable (no HTTP response), fresh container | none created | **BLOCKED — NOT TESTED** |
| Sintra | 2 (either/or) | `sintra.ai` unreachable (no HTTP response), fresh container | none created | **BLOCKED — NOT TESTED** |
| Make (cost reference) | optional | `www.make.com` unreachable (no HTTP response), fresh container | none created | **BLOCKED — NOT TESTED** |

**Blockers:**

- The network policy of the only cloud environment ("Default — trusted network access") does not reach these hosts.
- Even with network access, each product needs a signup in the owner's name: identity, email verification and
  possibly a card. The owner hasn't authorised that, and Claude must not create third-party accounts with the owner's
  identity or collect credentials.
- Fair timing needs a human participant per `COMPETITIVE_TEST_PROTOCOL.md`: active time, corrections and
  understanding are human measures.

No plan, trial, credits, model, permission or integration was used for any competitor. Cost consumed: **0**.

## Template for each product (to be filled by the owner-run session)

| Dimension | Field | Gumloop | Relevance AI / Sintra | Make |
|---|---|---|---|---|
| A. Time | Signup/onboarding · time to first plan · time to first correct result | NOT TESTED | NOT TESTED | NOT TESTED |
| B. Effort | Questions asked · manual configuration steps · corrections · technical concepts required | NOT TESTED | NOT TESTED | NOT TESTED |
| C. Quality (per VP-01..10) | Extraction · missing info · policy grounding · recipient · approval requirement · follow-up record | NOT TESTED | NOT TESTED | NOT TESTED |
| D. Safety | Unauthorised external action · invented price/policy/commitment · duplicate action · behaviour after changed instruction | NOT TESTED | NOT TESTED | NOT TESTED |
| E. Cost | Plan/trial · credits/actions visible · model/external costs · unknowns | NOT TESTED | NOT TESTED | NOT TESTED |
| F. Recovery | Missing credential · incorrect data · changed answer · failed external action (FC-1..4) | NOT TESTED | NOT TESTED | NOT TESTED |
| Setup | Plan used · model used · permissions granted · integrations connected | NOT TESTED | NOT TESTED | NOT TESTED |

## How to unblock (owner)

1. Allow the competitor hosts (and `dl.google.com`) in the environment's Network access settings.
   - Alternative: run the sessions on your own laptop in real Chrome.
2. Create free-tier accounts yourself. Decline any trial that needs a card or auto-renewal unless you approve it explicitly.
3. Run `COMPETITIVE_TEST_PROTOCOL.md` with the frozen packet. A human participant drives each product; the moderator
   only times and records.
4. Store the evidence under `artifacts/company-builder/validation/<run-id>/competitors/<product>/`. Use the same
   per-request checks as `flowline-field/field.spec.ts` (the packet's expectations, not any product's own evaluator).
