# Template: Deal won → Mizano quote

Issue #149 (part of #144, Mizano connector v1). Gallery id `deal-won-mizano-quote` (`src/engine/design-templates.ts`, "Connected" section; strings under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/{en,ar}.json`).

Flow: **Deal** (manual trigger with an editable sample deal) → **Deal won?** → **Prepare customer and quote** → **Mizano — Create customer (needs approval)** → **Mizano — Create draft quote** → **Slack — Quote ready**. A deal that is not won ends at "Deal not won" and sends nothing.

- **Approval:** `requireApproval` is on the first Mizano call (`mizano.create_customer`). The worker opens the approval before the action runs, so a pending approval pauses the run (`waiting_approval`) and a rejection fails it (`APPROVAL_REJECTED`) with no call to Mizano and no Slack message. The approval shows the exact customer arguments it is bound to; the quote lines are visible in the "Prepare customer and quote" step output. Showing customer and lines in one approval card needs a preview-capable approval step (not built; CTO decision on #149: ship with the customer-only approval, follow-up issue tracks an approval that shows arbitrary context).
- **Amounts:** the prepare step formats `qty`, `unitPrice` and `taxRate` as two-decimal strings (`$formatNumber(x, "0.00")`), the shape `mizano.create_draft_quote` accepts.
- **Setup:** choose the Mizano and Slack connections and set `REPLACE_WITH_CHANNEL_ID`. Until a Mizano workspace issues a scoped API key (MZ G5) the Mizano steps are verified with mocks only.
- **Depends on #147** (`mizano.create_customer`, `mizano.create_draft_quote`). Until that merges, "Use" creates the flow but the Mizano steps cannot run.

The Slack text reads the customer and line count from the prepare step, not from Mizano's responses, so it does not depend on Mizano echoing the request.

Verification: `tests/integration/deal-won-mizano-approval.test.ts` (the real worker + approval flow with recording stand-ins for the two Mizano actions until #147 merges: pending approval sends nothing, approve creates customer then quote then posts to Slack, reject fails with `APPROVAL_REJECTED` and calls nothing), `tests/unit/deal-won-mizano-template.test.ts` (engine wiring and data flow with a mocked host: pending, rejected, approved, not won) and `e2e-army/149-deal-won-mizano-quote.e2e.ts` (gallery listing in EN and AR, Use opens the flow).


A browser-level happy-path e2e (approve in the UI, draft quote at a fake Mizano server) waits for #147 (real actions) and #225 (fake `mizano` handler), per the CTO decision on #149; the worker-level test above covers the approval behaviour meanwhile.
