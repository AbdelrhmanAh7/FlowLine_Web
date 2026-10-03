# Request body deadline — local proof

Base: `a9f7597` (reviewed resource candidate); branch `codex/paid-pilot-body-deadline-20261003`. Shared body admission now has one 30-second deadline for the entire stream. Trickle bytes cannot extend it. Timeout returns stable 408/BODY_READ_TIMEOUT with English/Arabic UI messages. Overflow and timeout refuse promptly even when a hostile stream cancellation hook never resolves; successful and failed reads clear their timer and reader lock.

Four focused unit files (`http-body-deadline`, `http-capbody`, `public-body-budget`, `i18n`): 31 passed, no skips. Five new cases cover stalled/trickling streams, hostile cancellation, preserved valid content and both-language error projection. Full `tsc --noEmit --incremental false` and targeted ESLint passed. Source whitespace check passed.

Initial focused run: 30 passed / 1 failed. The new Arabic string was corrupted by PowerShell pipeline encoding; the unchanged Arabic assertion caught it. The source string was corrected through a direct UTF-8 patch, then all 31 passed. No assertion/baseline was weakened and no retry was added.

Independent source review: security worker (gpt-6.1-sol high), no blocker. Exact staged snapshot approval is recorded in the round review ledger. No real client/network, deployed proxy, provider, browser or CI gate was exercised. Approved-proxy isolation/admission still needs runtime proof; this source fix closes only the body deadline gap.