# Request body deadline — local proof

Original base: `a9f7597` (reviewed resource candidate); branch `codex/paid-pilot-body-deadline-20261003`. Shared body admission now has one deadline for the entire stream (30 s when this note was first written). Trickle bytes cannot extend it. Timeout returns stable 408/BODY_READ_TIMEOUT with English/Arabic UI messages. Overflow and timeout refuse promptly even when a hostile stream cancellation hook never resolves; successful and failed reads clear their timer and reader lock.

Four focused unit files (`http-body-deadline`, `http-capbody`, `public-body-budget`, `i18n`): 31 passed, no skips. Five new cases cover stalled/trickling streams, hostile cancellation, preserved valid content and both-language error projection. Full `tsc --noEmit --incremental false` and targeted ESLint passed. Source whitespace check passed.

Initial focused run: 30 passed / 1 failed. The new Arabic string was corrupted by PowerShell pipeline encoding; the unchanged Arabic assertion caught it. The source string was corrected through a direct UTF-8 patch, then all 31 passed. No assertion/baseline was weakened and no retry was added.

Independent source review: security worker (gpt-6.1-sol high), no blocker. Exact staged snapshot approval is recorded in the round review ledger. No real client/network, deployed proxy, provider, browser or CI gate was exercised. Approved-proxy isolation/admission still needs runtime proof; this source fix closes only the body deadline gap.

Rebase note (issue #26): the branch was rebased onto `b63ffed` (PR #16 Caddy ingress caps), which already contains the same whole-body `capBody` deadline. The single implementation in `src/server/http.ts` is PR #16's, with `BODY_READ_TIMEOUT_MS = 10_000` matching the ingress `read_body 10s` (superseding the 30 s above); this branch's unit tests reference the exported constant, not a literal. The test counts above were measured before the rebase and are not re-measured here.
