# Round-2 AI/tool usage

Lead and two security/root-cause workers: Codex gpt-6.1-sol high. No extra workers, heavy local job or real FlowLine provider call. Numeric remaining quota unknown; no Codex warning observed.

Fable: three bounded subscription decisions with tools disabled, one turn each: sequencing, WebKit/docs-only review, and provider-advertised quota rollover. CLI authentication reported the existing Max subscription; account identifiers are omitted. All returned decisions, with no limit/credit warning. No API key route.

CodeRabbit first billing/limit prompt at **02:40:59 UTC**, PR #13: “Review limit reached”; “Enable usage-based reviews in Billing to review now. Otherwise, wait until the next included review is available”; “Next included review available in 9 minutes.” It says admin approval is required for usage-based billing. This was a refusal, not a completed review. No billing opt-in, click, scope, budget or overage change. Openings stopped; exactly one bounded review attempt permitted by Fable at 02:52 after rollover. Another refusal stops all review attempts this round.

Gemini/Antigravity and OpenCode `-free` routes are authorized with stop-on-first-payment-prompt guards in DECISION_FABLE.md; no task in this narrowly assigned two-worker round required generation through them. No new prompt observed. Command Code remains STOPPED from round 1's insufficient credits. Claude Haiku remains stopped after its previous bounded failures. Detailed round-1 usage is retained in its separate journal.

All subscriptions and free routes here concern development assistance; they do not authorize customer/provider API use or establish real-provider certification.
