# Product verifier — next-slice blocker

Fable decision B, 2026-10-03 02:56 UTC. Existing product branch `codex/paid-pilot-product-20261003` at `6bfbbe7938854ed05340f971c787d8993afcacc3` remains preserved and backed up. Historical review provenance is recovered on its 14 declared reviewable paths; fresh runtime/dedupe/BYOK source review is approved, but helper safety findings block PR readiness.

**DO NOT EXECUTE** `artifacts/phase-4/paid-pilot-round1/product/verify-rerun-local.mjs` in its current form.

Next slice: one 20-minute correction on the existing product branch. Replace inherited child environment with an explicit runtime allowlist plus generated synthetic values; exclude provider, OAuth, preload and proxy variables. Record `docker run` container ID plus a unique ownership label; inspect both before cleanup, remove only the matching immutable ID, and preserve mismatches. Keep historical passing/failed evidence unchanged. No app/schema/policy expansion or real-provider call. Perform syntax and controlled non-Docker/no-provider verification, then independent pre-push review and re-pin manifest/hash.

Worker A is released after its current evidence report; no new worker or code changes for this blocker in round 2. Binding PR slice order remains unchanged. Prompt and verbatim Fable response are retained alongside this file.
