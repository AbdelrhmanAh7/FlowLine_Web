# Request and knowledge parsing resource controls

The original test record below is historical. The proxy/deadline follow-up on base `a9f7597` is recorded separately in [proxy-body-limits.md](proxy-body-limits.md), with the current [layered request policy](../../../docs/security/REQUEST_BODY_LIMITS.md).

- Base/tested HEAD: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`, branch `codex/pilot-security-resource-round1`. Tested source was an uncommitted dirty diff, no new candidate SHA claimed.
- M4 source: shared JSON parser ceiling 1 MiB, email/beta JSON ceiling 16 KiB, every auth POST ceiling 64 KiB before cloning/Better Auth parsing, shared trusted `X-Real-IP` admission 60 requests/minute before expensive parsing, beta proxy ceiling 6 MiB preserving upload overhead. Admission deliberately ignores untrusted forwarding chains; absent/invalid proxy identity still gets byte caps but has no per-IP admission, so approved proxy isolation remains required.
- M5 partial source: knowledge extractor aborts CSV above 2,000 rows, 200 columns, or 4,000 characters of expanded row text. JSON depth is checked before parse (64 levels); compact stringify avoids indentation amplification; all formats stop constructing chunks at 2,000 rather than materializing arbitrarily many pieces.
- `pnpm exec vitest run tests/unit/http-capbody.test.ts tests/unit/zitadel-review-fixes.test.ts tests/unit/public-body-budget.test.ts tests/unit/public-route-body-budget.test.ts tests/unit/knowledge-extract-budget.test.ts tests/unit/knowledge-errors-i18n.test.ts`: **6 files / 54 tests passed**, no skips.
- Coverage includes absent/false/oversized Content-Length, bounded stream cancellation, every auth POST class (social/link/email/signup/callback/TOTP), valid public requests, trusted-IP admission before reads, CSV abort callback count and exact limit, JSON preparse depth, quoted delimiters, combined array chunk budget, plain-text early stop, existing multipart preservation and auth-body guards.
- New limit errors persist stable codes with matching Arabic/English UI translations; request 413 responses also use the translation catalogue. Existing malformed JSON / empty PDF diagnostics are preserved.
- `tests/integration/p3-knowledge.test.ts`: **4 tests passed**, including real indexing persistence, Arabic/English code lookup and zero chunks on excessive JSON nesting. Ran against this worker's already isolated `flowline_test_pilotsecauth`, with only synthetic credentials in child-process memory, no environment-file reads. First run: 3 passed / 1 failed because the new test incorrectly expected a literal depth number in deliberately simple translated prose; corrected to the exact catalogue lookup, then all 4 passed. Existing assertions preserved.
- `pnpm exec tsc --noEmit` and targeted ESLint: passed after resource/i18n source changes; subsequent integration-test addition passed execution (combined candidate must repeat typecheck). No provider/browser/local-gate/deployment work for this branch.

## Remaining findings

M4 remains **PARTIAL for deployment verification**: the follow-up adds Caddy route caps and socket read deadlines plus the shared `capBody` deadline. Some authenticated custom JSON readers still rely on ingress. Caddy runtime behavior, deployed trusted-proxy/no-direct-web exposure and any provider/tunnel client deadlines remain unverified. The old blanket 6 MiB proxy ceiling above describes the original run only; see [proxy-body-limits.md](proxy-body-limits.md) for the follow-up evidence and outstanding acceptance checks.

M5 remains **PARTIAL**: no atomic aggregate workspace/installation storage reservations, shared upload/queue concurrency quotas, retained-source accounting or dedicated parser CPU/heap isolation. CSV/JSON still run on the worker with a 5 MiB admitted file; source/queue starvation needs that subsequent work.

L3 remains **OPEN**: the PDF/JSONata fork retains worker environment, filesystem/network access and OS identity. No RCE is asserted. A separately reviewed low-authority executor must deny synthetic environment/file/network access while preserving valid parsing/time/heap limits; direct shared Docker-daemon authority is not an acceptable shortcut. This round does not certify such isolation.

M9/L2 source work is separate in `codex/pilot-security-runtime-round1`. L1 remains **OPEN**: esbuild 0.18.20 in transitive Drizzle tooling needs a compatible dependency update/removal with auth/migration/worker/build validation, not an untested override. [Maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

All original lanes/environment files preserved. No environment-file reads, paid calls, commits or pushes by this worker. Model/tool: Codex security worker.
