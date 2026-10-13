# Template: Deal won → Mizano quote

Issue #149 (part of #144, Mizano connector v1). Gallery id `deal-won-mizano-quote` (`src/engine/design-templates.ts`, "Connected" section; strings under `designTemplates.deal-won-mizano-quote` in `src/i18n/messages/{en,ar}.json`).

Flow: **Deal** (manual trigger with an editable sample deal) → **Deal won?** → **Prepare customer and quote** → **Mizano — Create customer (needs approval)** → **Mizano — Create draft quote** → **Slack — Quote ready**. A deal that is not won ends at "Deal not won" and sends nothing.

- **Approval:** `requireApproval` is on the first Mizano call (`mizano.create_customer`). The worker opens the approval before the action runs, so a pending approval pauses the run (`waiting_approval`) and a rejection fails it (`APPROVAL_REJECTED`) with no call to Mizano and no Slack message. The approval shows the exact customer arguments it is bound to; the quote lines are visible in the "Prepare customer and quote" step output. Showing customer and lines in one approval card needs a preview-capable approval step (not built; see `AI_QUESTIONS.md`).
- **Amounts:** the prepare step formats `qty`, `unitPrice` and `taxRate` as two-decimal strings (`$formatNumber(x, "0.00")`), the shape `mizano.create_draft_quote` accepts.
- **Setup:** choose the Mizano and Slack connections and set `REPLACE_WITH_CHANNEL_ID`. Until a Mizano workspace issues a scoped API key (MZ G5) the Mizano steps are verified with mocks only.
- **Depends on #147** (`mizano.create_customer`, `mizano.create_draft_quote`). Until that merges, "Use" creates the flow but the Mizano steps cannot run.

Verification: `tests/unit/deal-won-mizano-template.test.ts` (engine run with a mocked Mizano: pending, rejected, approved, not won) and `e2e-army/149-deal-won-mizano-quote.e2e.ts` (gallery listing in EN and AR, Use opens the flow).
