# Fable decision — WebKit and docs-only review sequencing

2026-10-03 02:38 UTC; `claude -p --model fable`, tools disabled, one bounded subscription turn, no warning observed. Prompt and verbatim response retained alongside this file.

WebKit: root cause remains OPEN. Approve read-only findings. Next round may prepare a separate instrumentation-only diagnostic behind `FLOWLINE_ENV=test`; correlate sanitized socket/request, server lifecycle, supervisor/resource/cleanup, persisted approval/run state and fake downstream effect count. Record worker claim/effect/finally separately. Reproduce the specific failure before selecting a causal fix. No retries, skips, baseline changes, timeouts or forced-connection-close patch this round.

PR #12: independently review the minimal documentation-only clarification BEFORE commit/push, then reply with fix SHA and resolve its CodeRabbit thread. Do not request a manual review for this docs-only push. Record old-head CodeRabbit coverage and latest docs-head coverage pending; PR is not merge-ready. Runtime may open after the thread disposition. Reserve remaining slots for code reviews/re-reviews. No merge or billing change authorized.
