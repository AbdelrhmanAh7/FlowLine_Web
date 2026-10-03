Applies one 30-second deadline to the full shared body stream so trickle bytes cannot extend reads. Timeout returns stable 408/body-read-timeout responses with English/Arabic UI messages; overflow/timeout refuses promptly even if hostile stream cancellation never resolves, and successful/failed reads clear timer and lock state.

Validation: Focused suite finished 31/31; the initially failing Arabic assertion exposed setup encoding corruption, corrected directly without weakening the assertion or retrying. See [body-deadline evidence](artifacts/phase-4/paid-pilot-round1/body-deadline.md).

Limits: No real client/network, deployed proxy, browser, provider, or CI gate was exercised. Approved-proxy isolation/admission still needs runtime proof.

Exact candidate: `9d7f0c426f0d952aa46296a9f32ee5c30b6c263e`; base `codex/pilot-security-resource-round1` at `a9f7597c90b98128a1cebf46a949810e0586c31d`; 7 changed paths. Requires fast CI and the final `gate`; no current CI or CodeRabbit result is claimed.

**BLOCKED: NOT GATED / NOT MERGEABLE.** Fast static/integration/Chromium jobs passed; Firefox/WebKit correctly skipped. Required gate37102200387 failed without starting (runner0, no steps): GitHub account billing/spending-limit annotation. All CI stopped under $0 guard; no settings change or rerun.

**408 vs413 webhook follow-up: deferred, unfixed.** Valid Minor at exact head9d7f0c4: timeout HttpError is mapped to413 and loses its code. Source independently read via git show. Preserve timeout status/code while retaining oversized413, add route regressions and obtain fresh CI/review in a later authorized round. Thread resolution records deferral, not repair.
