# Local PR title and body payloads

Snapshot: 2026-10-03, based on `PR_CANDIDATES.md` and the candidate-specific evidence summaries in this directory. These are local review payloads only: no PR, CI, CodeRabbit review, test run, push, or commit was triggered. New PR creation, including draft PRs, remains blocked by the current $0 review/Actions quota uncertainty. File counts are conservative changed-path counts; all proposed main-targeted payloads are below 150 paths. Main-targeted PRs require full CI and the final `gate`; stacked PRs require fast CI and the final `gate`.

The pilot's requested scope remains **all 12 advertised integrations and all 20 AI providers**. No payload below claims real-account/provider verification. Local mocks, contract tests, fake-provider runs, source review, and historical CI are described as such. Product pricing, limits, BYOK terms, and policies remain owner-review proposals; nothing here installs an entitlement or creates a provider charge guarantee.

## 1. Lighthouse reports

**Payload metadata:** Title: `ci: add warning-only locale-specific Lighthouse reports`. Branch `paid-pilot-lighthouse`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `d4eae152b1931f08e1bc1c434eef3ca1f90bbde5`; 4 paths; full CI, final `gate` required. Code author: routine lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `a1bad03526c2233f14f38a143844e818a89a2b044a6c43e5dbb2eded95cb2065`.

**Draft description:** Adds non-blocking Lighthouse CI collection with separate Arabic and English report outputs. Removes additive collection behavior that could mix a prior locale's report into the next locale. Reports performance evidence without turning score thresholds into merge blockers.

**Evidence:** `node --check lighthouserc.cjs` and whitespace check passed. Lighthouse CI/browser collection was not run locally; the lane's guide marks it CI-only. See [focused evidence](lighthouse-focused.md).

**Remaining limits:** No GitHub CI run, browser run, production performance guarantee, or real-provider check is claimed. External publication and CI are still blocked.

## 2. P3 interface and localization polish

**Payload metadata:** Title: `fix(ui): localize AI errors and improve landing keyboard order`. Branch `paid-pilot-p3`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `c1ba48220fca07da7d9b0be3844732c14e06df20`; 11 paths; full CI, final `gate` required. Code author: routine lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `cdcddbb724fdab2d0190192c37a8ebc04829eaf3e7a96f0d4568d6a80d2489a6`.

**Draft description:** Reorders responsive landing controls, maps uncommon AI errors through shared Arabic/English message catalogs, and updates the orange primitive token with contrast coverage.

**Evidence:** Four focused unit files passed (89 tests): design-system, i18n, landing-header, and run-messages. Source change was checked against the installed Next App Router guide. See [focused evidence](p3-focused.md).

**Remaining limits:** No browser, database, provider, full gate, or visual acceptance was run. The token remains in the existing generated-token pipeline; do not treat the local unit run as cross-browser proof.

## 3. Bounded Copilot benchmark tooling

**Payload metadata:** Title: `feat(qa): prepare bounded workspace Copilot benchmark`. Branch `paid-pilot-copilot`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `0c58c4d39a353957973b12036fa6e0ae415799f1`; 12 paths; full CI, final `gate` required. Code author: routine lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `869aa3568ecd1b33e6bd8f6d150ea370cbbaf499a97b88b7529e0bd8da14eb71`.

**Draft description:** Adds a reusable benchmark runner and scoring helpers for workspace Copilot. The runner enforces an aggregate cap, rejects unknown-priced real calls, makes one bounded provider attempt, and writes sanitized reports. Existing fake-provider artifacts stay explicitly identified as fake/local evidence.

**Evidence:** The isolated lane passed three scorer unit tests and source review checked cap/preflight and fake-versus-hosted separation. A later combined test-only candidate did execute a fake DB case; that is synthetic harness evidence, not hosted-model evaluation and not a standalone lane run. See [focused evidence](copilot-focused.md); the later combined-run detail will be linked when its summary is copied here.

**Remaining limits:** No standalone or live database certification, hosted-model quality, Arabic/English quality, cost/limit verification, provider failure proof, or live call is included. The full 20-provider launch validation remains required.

## 4. HubSpot paginated read

**Payload metadata:** Title: `feat(hubspot): add bounded paginated contact reads`. Branch `paid-pilot-hubspot`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `d5fa51e33fe807a075138e2660074335412df723`; 13 paths; full CI, final `gate` required. Code author: routine lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `098ec18ac579d05375a15761eda93af16639e54288f6028cad971ed87c6cf22d`.

**Draft description:** Adds a bounded, schema-validated paginated contact read with fixed provider-error handling and catalog/UI/test coverage. Keeps the integration marked deferred and live-blocked until real-account certification exists.

**Evidence:** Standalone lane: HubSpot unit 31, contract 13, plus the two omitted listener-based regressions: egress 31 and redirect 1. They ran separately without skips/retries and close ephemeral loopback servers. A later combined test-only candidate also passed 7 database tests using provider fakes; that is separate from the standalone evidence and does not establish live HubSpot verification. See [standalone focused evidence](hubspot-focused.md); the combined DB summary will be linked when copied here.

**Remaining limits:** No real HubSpot account or browser E2E was used. The 7 later database tests use provider fakes, not a live account. Do not describe HubSpot as live-verified or ready for customer data.

## 5. Security report provenance

**Payload metadata:** Title: `docs(security): preserve dated review and source provenance`. Branch `codex/pilot-security-report-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `bc46dc257e28602e76f82d71b791ade401306643`; 2 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `a670fc2e65e73389b1fe0583176eaf41c48fd760085a9cfdbd5512b48fce7a61`.

**Draft description:** Carries the dated security report and its source provenance into a standalone main-based candidate without inventing or silently rewriting historical findings.

**Evidence:** Documentation-only scope; staged diff whitespace check passed. See [candidate evidence](security-report.md).

**Remaining limits:** This preserves report provenance; it does not close findings, establish new runtime proof, or replace the outstanding M4/M5/M9/L1–L3 work. No fresh full CI or provider check is claimed.

## 6. Runtime and immutable image inputs

**Payload metadata:** Title: `build: align release runtime with Node 22 and pin image inputs`. Branch `codex/pilot-security-runtime-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `56f96d9ee31498d2a38d1b4516dadcc49b7ac352`; 10 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `04b60adcf8b723b1e78383a48ff30c20a0d9f309acfe55664da31d788bc15ca3`.

**Draft description:** Aligns declared and container runtime support to Node 22, pins reviewed image-index digests, and adds a policy test for executable release defaults. The candidate does not pull, build, run, or deploy these images.

**Evidence:** Two focused release-input policy unit tests passed, with targeted ESLint and whitespace checks. Image digest metadata was read from registry manifests. See [focused evidence](security-runtime.md).

**Remaining limits:** A scoped crypto execution against the selected Node 22.23.3 Alpine image passed 7 checks. The full application and Bookworm runtime/build, OS vulnerability review, platform bytes, deployment image overrides, and full CI remain unverified.

## 7. Drizzle tooling dependency prune

**Payload metadata:** Title: `fix(deps): remove unused vulnerable Drizzle loader chain`. Branch `codex/pilot-security-deps-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `dd840db6bf6f9329f61007152b3bb500b4d66b75`; 5 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `c7e2ba7a317e911dd17b0cb3508c6e1896fc6bbde0bf82a453a57a1c8c4f28db`.

**Draft description:** Removes the unused `@esbuild-kit/esm-loader` from the exact Drizzle Kit version's dependency graph using a version-scoped PNPM rule. It does not upgrade transitive majors, suppress advisories, alter auth APIs, or change repository migrations.

**Evidence:** Isolated offline/frozen install reused 531 packages with zero downloads. Seven unit tests and three auth/SSO integration files (31 tests) passed; full typecheck, schema snapshot check for 73 tables, targeted ESLint, and production audit with zero advisories passed. See [dependency-prune evidence](security-dependency-prune.md).

**Remaining limits:** No full Next production build, Node 22 runtime run, browser suite, or final combined CI was performed. Audit output is not a native-binary/container vulnerability scan. Prior advisory evidence and limits remain in [advisory check](security-dependencies.md).

## 8. Redaction and trust-boundary remediation

**Payload metadata:** Title: `fix(security): redact aggregates and fail closed at trust boundaries`. Branch `codex/pilot-security-redact-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `09be0b3641a139409fad242e9617eec9b0db1975`; 15 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `3b0b7255df0e38df1523b6840f0c7fadc9ff4722c3b8d9d72a608d11dc36b289`.

**Draft description:** Applies the documented H4/M1/M2/M3/M6/M8 redaction and fail-closed fixes with synthetic local evidence while keeping historic findings and separate controlled operations visible.

**Evidence:** Six unit files passed (34 tests), full TypeScript check and whitespace check passed. See [focused evidence](security-redaction.md).

**Remaining limits:** Plaintext aggregate remediation is a separate controlled operation. Actual DB billing retry/provider behavior, browser suites, full gate, and live provider behavior were not freshly certified.

## 9. Request and knowledge parser resource limits

**Payload metadata:** Title: `fix(security): bound request and knowledge parsing resources`. Branch `codex/pilot-security-resource-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `a9f7597c90b98128a1cebf46a949810e0586c31d`; 20 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), reviewed M4/M5 source scope at diff SHA `653e49bea7653ee9c6fe37a240aeda711ee27574a54c00949b5fda3d82f4265c`; review does not close L3.

**Draft description:** Adds shared JSON and auth-request byte ceilings, trusted-IP admission before expensive parsing, a bounded beta-proxy request ceiling, and early-stop limits for knowledge CSV/JSON/text extraction. It preserves stable localized errors and existing multipart/malformed-input behavior.

**Evidence:** Six unit files passed (54 tests), the knowledge persistence integration passed (4 tests), and typecheck/targeted ESLint passed. See [resource evidence](security-resource.md).

**Remaining limits:** M4 is partial until approved-proxy isolation, body deadlines, and deployed routing are verified. M5 is partial until aggregate storage, queue/concurrency, parser CPU/heap, and retention limits are complete. The original resource-lane L3 finding described PDF/JSONata forks inheriting worker authority. The separate reviewed four-path sandbox candidate below removes worker credential inheritance, a partial mitigation; filesystem/network/OS authority and complete sandbox isolation remain unresolved.

## 10. M5 retained-upload admission (stacked)

**Payload metadata:** Title: `fix(storage): admit retained uploads atomically across routes`. Branch `codex/paid-pilot-upload-admission-20261003`; base resource `a9f7597c90b98128a1cebf46a949810e0586c31d`; head `360078e9d3357267711f006888b578f5a0c6c434`; 21 paths; fast CI on the stack, final `gate` required. Code author: M5 lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `1b0700bb1fecc5e29694898521698feb126f440a16058a80168543af84bd132f`.

**Draft description:** Serializes retained raw-file admission across workspaces and supported insertion routes, counts actual stored bytes inside the transaction, and rolls back insertion atomically when configured workspace or installation caps would be exceeded. Defaults are operational storage circuit breakers, not subscription entitlements, pricing, or a guarantee of total provider/storage cost.

**Evidence:** Eleven database tests and 24 unit tests passed with no skips; full TypeScript, targeted ESLint, and source whitespace checks passed. Race, actual-byte, deletion, rollback, invalid-config, and tenant-404 cases are covered. See [M5 evidence](upload-admission/README.md).

**Remaining limits:** This is partial M5 only. It does not cap row count/overhead, chunk storage, indexing queue depth, global parser CPU/heap, all database use, stale retention, or physical disk headroom. CI/deployed acceptance remains unverified.

## 11. Shared request-body deadline (stacked)

**Payload metadata:** Title: `fix(security): enforce a total request body read deadline`. Branch `codex/paid-pilot-body-deadline-20261003`; base resource `a9f7597c90b98128a1cebf46a949810e0586c31d`; head `9d7f0c426f0d952aa46296a9f32ee5c30b6c263e`; 7 paths; fast CI on the stack, final `gate` required. Code author: lead follow-up author. Independent reviewers: security and product workers (gpt-6.1-sol high), approved at source-diff SHA `0c9a441e8a1f8f8ac2f74583c514cc8a026774460b63899e311c0a6bb04a834f`.

**Draft description:** Applies one 30-second deadline to the full shared body stream so trickle bytes cannot extend reads. Timeout returns stable 408/body-read-timeout responses with English/Arabic UI messages; overflow/timeout refuses promptly even if hostile stream cancellation never resolves, and successful/failed reads clear timer and lock state.

**Evidence:** Focused suite finished 31/31; the initially failing Arabic assertion exposed setup encoding corruption, corrected directly without weakening the assertion or retrying. See [body-deadline evidence](body-deadline.md).

**Remaining limits:** No real client/network, deployed proxy, browser, provider, or CI gate was exercised. Approved-proxy isolation/admission still needs runtime proof.

## 12. SSO callback authority and local verification (H1/H2/M7)

**Payload metadata:** Title: `fix(auth): require mailbox-approved SSO linking and fence callback authority`. Branch `codex/pilot-security-auth-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `08355ae423aa91c7d2b6f106878603d3c2f98ecb`; 29 paths; full CI, final `gate` required. Code author: security lane worker. Independent reviewer: product security worker (gpt-6.1-sol high), approved at source-diff SHA `44c128ad07877f907677851d6a80a5d9e8d4bdcc6203cd88a2fee6622c7dd47f`.

**Draft description:** Requires mailbox-approved SSO linking and binds callback authority to the initiating, verified user and expected configuration/member/account state. Revoked or stale authority fails closed instead of silently provisioning or linking an identity.

**Evidence:** Final lane record: 19 unit tests and 33 integration tests passed, with typecheck/targeted lint; no skips. Local fixtures and synthetic outbox cover email/IdP boundaries. See [auth evidence](security-auth.md).

**Remaining limits:** H3/federated MFA is a separate stacked candidate. Live email, ZITADEL/GitHub IdP, actual tenant-provider acceptance, browser UX, and final CI remain unverified.

## 13. Federated MFA follow-on (H3, stacked)

**Payload metadata:** Title: `fix(auth): require local MFA after federated sign-in`. Branch `codex/paid-pilot-federated-mfa-20261003`; base auth `08355ae423aa91c7d2b6f106878603d3c2f98ecb`; head `2c85f058c2bf382ee861a2c2007af129705c62c6`; 40 paths; fast CI on the stack, final `gate` required. Code author: security lane worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `34b122d37a22f15f4e734d0e36030bd9002327b85ccada457ee5476f19edc8a0`.

**Draft description:** Holds federated sign-in in an opaque expiring pending-factor state until local TOTP succeeds; rechecks the initiating identity, factor, session, membership, and SSO configuration at completion. Pending state cannot access a session/admin page before the final factor fence.

**Evidence:** Five unit files passed (28 tests), seven integration files passed (63 tests, including 15 H3 cases), full TypeScript and targeted ESLint passed. One earlier fixture failure was corrected in test setup; all original assertions remain and final regressions pass. See [H3 evidence](federated-mfa/README.md).

**Remaining limits:** No real IdP, live email, browser journey, deployed acceptance, or CI gate was run. Historical source-swapping logs are not current proof.

## 14. Monitoring payload validation and alerts

**Payload metadata:** Title: `fix(ops): validate probes and retry failed alert delivery`. Branch `codex/paid-pilot-monitor-20261003`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `67d3bed6c4524d6fe62bc8f7b43b199114ea2797`; 5 paths; full CI, final `gate` required. Code author: lead monitoring author. Independent reviewer: security worker (gpt-6.1-sol high), approved on the final 17-case source at diff SHA `fad123fef2c35c545ca62e4018927634b45ead49632567ba8e41dbc2e9cd481c`.

**Draft description:** Validates database/worker health payloads, fails malformed or missing checks, limits alert detail to approved metadata, and sends/retries severity notifications without hiding delivery failures. One-shot mode returns failure when probes fail; missing operations credentials report health-only coverage.

**Evidence:** Seventeen pure unit tests, targeted ESLint, full TypeScript and both monitor module syntax checks passed. Tests use injected fetch doubles only. See [monitor evidence](monitor.md).

**Remaining limits:** No actual alert receiver, external endpoint, credential, deployment, or infrastructure monitoring was exercised. Operations alert delivery still needs owner setup.

## 15. Safe retry after provider 5xx

**Payload metadata:** Title: `fix(retry): review uncertain writes after provider 5xx`. Branch `codex/paid-pilot-safe-retry-main-20261003`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `b854d2c94ce31ec2503c58f6d883dcfd117edcb1`; 17 paths; full CI, final `gate` required. Code author: routine retry lane worker. Independent reviewer: Root lead (gpt-6.1-sol high) approved source commit `485a4f854b5df7b1f8d3776bb8c93dfe0b463c82`; the main port has the same source patch ID `b0f276dd4d2c19cff174475e73d8697468a12e9b`, with no source edits.

**Draft description:** Avoids automatically repeating non-idempotent writes after a provider 5xx that may follow a successful side effect. Provider verification runs first where supported; otherwise the action enters outcome review. A reviewer retry requires verified non-application, while a reviewer marking the action done resumes without resending. Read-only/idempotent actions retain automatic retries.

**Evidence:** Twenty-eight integration tests and 27 unit tests passed; full TypeScript and targeted ESLint passed with no skips. Tests use local fakes and a synthetic commit-then-500 fault. See [safe-retry evidence](safe-retry/README.md).

**Remaining limits:** The main port's source patch equivalence is recorded, but the final candidate still needs exact-head review and required CI. No real provider, payment, email, browser, or deployed side effect was exercised.

## 16. Tool-roster and beta-guide clarification

**Payload metadata:** Title: `docs(beta): qualify provider verification and record tool limits`. Branch `paid-pilot-tool-roster`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `287096749d8107a7c9a8fe2ce20ec0d77fb861ef`; 2 paths; full CI, final `gate` required. Code author: routine documentation worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at evidence diff SHA `36a29afa47dc000a5440a8322922592a27b2d511979ca6f6078e7ceed310bf6b`.

**Draft description:** Clarifies that implemented integrations are not pilot-certified until current provider/account artifacts exist; scopes Flowline's own no-training statement to its policy draft and leaves external-provider data terms explicit; records bounded AI tool attempts and quota outcomes.

**Evidence:** Documentation and tool-use review only; no product tests were run for this slice. Usage evidence is in [the AI tool journal](ai-tool-usage.md).

**Remaining limits:** No current provider account, integration, AI-provider quality/cost/limit, or legal-term verification is claimed. All 12 integrations and 20 AI providers remain in the owner's full validation scope. This branch's push state is not independently verified here.

## 17. Pilot product retry and copy

**Payload metadata:** Title: `fix(pilot): deduplicate rerun requests and disclose BYOK charges`. Branch `codex/paid-pilot-product-20261003`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `6bfbbe7938854ed05340f971c787d8993afcacc3`; 21 paths; full CI, final `gate` required. Code author: product worker. Independent reviewer: Root lead (gpt-6.1-sol high), approved at source-diff SHA `632bae80e00ab69340586338f7a6e7e978d51a9b42b1f229d30607927832f5ee`.

**Draft description:** Binds retry deduplication to source, step, revision, and request identity so one request does not create duplicate executions; clarifies the explicit business-owner decision for consequential drafts and separates customer BYOK provider charges from Flowline subscription charges.

**Evidence:** 193 focused tests and 10 deterministic packet requests passed, according to the independent review ledger. Actual HTTP/browser/provider acceptance was not performed. The review notes the proposed plan and terms remain drafts, not installed entitlements or policy.

**Remaining limits:** No price/plan is installed, no sandbox checkout lifecycle or live provider call is proven, and deliberate new reruns can still cause external effects. Customer UAT and policy/price approval remain pending. All 12 integrations and 20 AI providers remain in scope.

## 18. L3 sandbox-fork credential boundary

**Payload metadata:** Title: `fix(sandbox): exclude worker credentials from parser forks`. Branch `codex/pilot-sandbox-env-round1`; base `main` `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; head `571d1c62d83d7f01461739ad1ed4e830c04d7796`; 4 paths; full CI, final `gate` required. Code author: security worker. Independent reviewer: Root lead (gpt-6.1-sol high), raw-diff SHA256`833df3a1c25c7937a933a66c6f2d1cb8598b1ba5b3ff33e8d11155525276d5d8`.

**Draft description:** Prevents parser forks from inheriting the worker process credentials. The change is limited to the four-path candidate; it does not claim a complete low-authority sandbox.

**Evidence:** Root's independent source review is recorded at the hash above. [Parser-environment evidence](parser-environment.md) records 11/11 focused unit tests, full typecheck and targeted lint passing. Final combined validation also exercised the sandbox tests. No tests were run for this documentation-only correction.

**Remaining limits:** Do not claim full filesystem/network/OS isolation, CPU/heap/time limits, or resolution of every L3 concern. Verify the exact test evidence, remaining process authority, CI, and runtime behavior before any owner-authorized publication.

## 19. Queue and index admission (stacked)

**Payload metadata:** Title: `fix(knowledge): bound indexing admission atomically`. Branch `codex/paid-pilot-index-admission-20261003`; base upload-admission `360078e9d3357267711f006888b578f5a0c6c434`; head `e437af28b177f9998bca582de7b9752ab7e8429e`; 21 paths; fast CI on the stack, final `gate` required. Code author: product worker. Independent reviewer: Root lead (gpt-6.1-sol high), raw-diff SHA256`6dc4f2a97a58146e1f94cc9276f7ca408b754b24d0a7ecb24ba6815a9d8d3c51`.

**Draft description:** Adds atomic admission for knowledge indexing queue work on top of the retained-raw-file admission layer, keeping this resource-control follow-up separately reviewable and stacked on its prerequisite.

**Evidence:** Root's independent review record reports 19 database tests and 24 unit tests passed. See [queue-admission evidence](index-admission/README.md); no live provider was used.

**Remaining limits:** No live provider, customer data, browser, or deployed worker acceptance is claimed. Product usage limits and subscription entitlements are not set by queue/storage controls.

## 20. Retained-row count admission (stacked)

**Payload metadata:** Title: `fix(storage): cap retained upload row admission`. Branch `codex/pilot-retained-count-round1`; base upload-admission `360078e9d3357267711f006888b578f5a0c6c434`; head `0bf0a49abe1cbf4dc4c8f5c71f7529a04ef874fe`; 8 paths; fast CI on the stack, final `gate` required. Code author: retained-count lane worker. Independent reviewer: Root lead, approved at raw-diff SHA `67d98f69f3bfc8ff7a9b901fef2e6b3ad762951afa727ba2a81a1770789e50ad`.

**Draft description:** Adds a separate retained-row admission limit on top of M5 upload admission, covering the row-count dimension that byte caps alone do not bound.

**Evidence:** Root's independent review record reports 36 unit tests and17 database tests passed. See [count evidence](retained-count.md).

**Remaining limits:** This limit does not establish physical disk headroom, indexing queue/chunk limits, total storage cost, or subscription entitlements. Full CI, deployment, and customer-data acceptance remain unverified.

## 21. Chunk admission (stacked)

**Payload metadata:** Title: `fix(knowledge): bound chunk admission and references`. Branch `codex/paid-pilot-chunk-admission-20261003`; base queue/index admission `e437af28b177f9998bca582de7b9752ab7e8429e`; head `c6739566558981c0b59d5a3564603ef651c4b0bd`; 18 paths; fast CI on the stack, final `gate` required. Code author: chunk-admission lane worker. Independent reviewer: Root lead, approved at raw-diff SHA `81f9694d48254294eb44e6d27c9f0b6a4889c1b1db1dea4f03fe71182e09f347`.

**Draft description:** Adds a bounded chunk-admission follow-up on the reviewed queue/index layer, keeping chunk and reference limits independently reviewable from retained-byte and retained-row controls.

**Evidence:** Root's independent review record reports 26 database tests and32 unit tests passed. See [chunk evidence](chunk-admission/README.md).

**Remaining limits:** These local checks do not establish deployed queue behavior, physical storage headroom, customer-data acceptance, or product usage entitlements. Full CI remains unverified.

## Candidates deliberately without a new payload

- `codex/paid-pilot-deploy-align-20261003` remains in existing draft PR #9's lineage; retain its title/body there without changing that draft.
- `codex/paid-pilot-combined-20261003` is test-only at head `4a907b84c630388befe77044bf18c318826737ed` and exceeds the 150-path cap (>250 paths). Never submit it.
- `codex/paid-pilot-safe-retry-20261003` includes inherited content and exceeds the cap at 156 paths; use the standalone main port above.
- `codex/paid-pilot-round1-20261003` is a zero-diff coordinator/base alias.

These payloads cover only the frozen refs listed in `PR_CANDIDATES.md`; no alternate branch aliases are claimed ready. The resource candidate's L3 finding remains open despite the separate sandbox-fork credential-boundary candidate above; this document does not claim complete L3 closure.

## Publication gate

These body payloads stay local until the owner-verified $0 review and Actions conditions permit publication. Existing drafts #9–#11 remain untouched. No PRs—including drafts—are created by this file. Main candidates will need full CI; stacked candidates will need fast CI; the final `gate` job is required for each. No provider, billing, deployment, or UAT claim should be upgraded without its own evidence.
