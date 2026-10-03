# Paid pilot — round 1 resume ledger

Started **2026-10-03 01:13 UTC**; refreshed **02:46 UTC**, before the **02:53 UTC** refresh deadline. Hard stop **03:03 UTC**. Binding authority: [PAID_PILOT_BRIEF.md](PAID_PILOT_BRIEF.md). Non-interactive: [owner steps remain BLOCKED](OWNER_ACTIONS.md).

**NOT READY for the first paid pilot. Round report, not FINAL:** internal acceptance work remains open as well as owner dependencies. Main is unchanged at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. This lead round performed no production deployment, DNS change, live payment, invitations or paid API traffic.

## Preservation and publication

Lead branch: `codex/paid-pilot-round1-20261003`. Existing dirty/untracked takeover work and inherited worktrees are preserved. Three bounded workers use fresh worktrees; only the lead commits/pushes. Another actor advanced the original auth lane; our H3 follow-up uses its immutable commit in a fresh worktree.

Reviewed slices are backed up as new remote branches without PRs. Gate triggers on main pushes, PRs and manual dispatch; Lighthouse triggers on main-targeted PRs/manual dispatch. Independently inspected new branch pushes do not trigger those inspected workflows; no CodeRabbit review was requested by this lead. **Backup is not a CI gate or merge readiness.** Main was not merged/pushed. Existing draft PRs #9–#11 and open field issue #6 remain unchanged.

**New PRs, CI dispatch and CodeRabbit remain BLOCKED under$0.** PR #8's fresh report said zero included reviews; a later coordinator note did not establish numeric headroom/overage prevention. Private-repository billing API reads returned404/missing `user` scope; computer-use inventory exposed no browsers. Proposed PR bodies stay local; draft PRs also trigger CI. This round requested **zero CodeRabbit reviews**, within the shared maximum3/rolling hour. PP-01/09 specify remedies. Never bypass gates, grant token scopes or activate overage.

## Reviewed implementation candidates

Full SHAs, dependencies, file counts and proposed PR order: [PR_CANDIDATES.md](../../artifacts/phase-4/paid-pilot-round1/PR_CANDIDATES.md). [Independent reviews](../../artifacts/phase-4/paid-pilot-round1/INDEPENDENT_REVIEWS.md) are local source review, not CodeRabbit. All acceptance below is bounded; no real external provider was called.

| Slice | Commit / branch | Result / remaining acceptance |
|---|---|---|
| Lighthouse locale collection | `d4eae152b1931f08e1bc1c434eef3ca1f90bbde5` / `paid-pilot-lighthouse` | Separate EN/AR collection; syntax checked. Actual Lighthouse CI pending. |
| P3 landing/i18n polish | `c1ba48220fca07da7d9b0be3844732c14e06df20` / `paid-pilot-p3` |89 units; localized provider failures/design-token consistency. Browser acceptance pending. |
| Bounded copilot benchmark | `0c58c4d39a353957973b12036fa6e0ae415799f1` / `paid-pilot-copilot` |12 frozen EN cases, one attempt/aggregate cap;3 scorer units and fake benchmark DB test. Real EN/AR quality/cost BLOCKED. |
| HubSpot contact reads | `d5fa51e33fe807a075138e2660074335412df723` / `paid-pilot-hubspot` |Unit31/contract13 plus previously omitted egress31/redirect1 pass; combined DB passes. Live account BLOCKED. |
| Dated security report | `bc46dc257e28602e76f82d71b791ade401306643` / `codex/pilot-security-report-round1` |Historical source findings preserved; not deployed acceptance. |
| H4 / M1–M3 / M6 / M8 | `09be0b3641a139409fad242e9617eec9b0db1975` / `codex/pilot-security-redact-round1` |Secret redaction/step context, redirect protection, bounded scrub, beta fail-closed, billing503/redelivery.34 units; billing19 passes. Historical data PP-08 pending. |
| H1/H2/M7 auth/race fences | `08355ae423aa91c7d2b6f106878603d3c2f98ecb` / `codex/pilot-security-auth-round1` |Mailbox ownership/link consent; issuer/member/config/session fences; no revoked-member regrant.19 units+33 DB. Real identity PP-02 pending. |
| H3 federated local MFA | `2c85f058c2bf382ee861a2c2007af129705c62c6` / `codex/paid-pilot-federated-mfa-20261003` |Enrolled factors gate sessions/admin access; revoked initiators fenced.28 units+63 DB. Real MFA BLOCKED. |
| M4/M5 request/index bounds | `a9f7597c90b98128a1cebf46a949810e0586c31d` / `codex/pilot-security-resource-round1` |Body caps/early shared limits where proxy trusted, bounded knowledge extraction, EN/AR codes.54 units+4 DB. Deployed proxy and broader quotas open. |
| M4 whole-body deadline | `9d7f0c4` / `codex/paid-pilot-body-deadline-20261003` |30s whole-body deadline/localized408; hostile cancellation cannot delay denial.31 units; deployed proof pending. |
| M9/L2 runtime/image pins | `56f96d9ee31498d2a38d1b4516dadcc49b7ac352` / `codex/pilot-security-runtime-round1` |Node22LTS/immutable Node/Postgres/Caddy inputs;2 policy units. Final app build/ARM64 evidence pending. |
| L1 dependency pruning | `dd840db` / `codex/pilot-security-deps-round1` |Unused exact-version Drizzle loader removed, no advisory suppression; frozen offline install; zero production audit advisories/338deps;7 units+31 DB; real73-table generation/check/auth-worker compile; tsc/lint. Full production build/Node22 app validation pending. |
| Product/rerun/pilot drafts | `6bfbbe7938854ed05340f971c787d8993afcacc3` / `codex/paid-pilot-product-20261003` |Stable rerun dedupe/one execution meter, BYOK/plan copy, five templates, policy/support/acceptance drafts.193 focused tests+10 deterministic packet cases. Proposal not installed. |
| Uncertain5xx writes | `b854d2c` / `codex/paid-pilot-safe-retry-main-20261003` |Non-idempotent5xx verified/reviewed, no blind resend; safe retries retained.28 DB+27 units. Fresh-main17-file candidate preferred to combined-base backup485a4f8. |
| Monitor reliability | `67d3bed6c4524d6fe62bc8f7b43b199114ea2797` / `codex/paid-pilot-monitor-20261003` |Validate health/ops, scrub payloads, refuse credentialed redirects, retry failed delivery/recovery visibly.17 units; actual alerts PP-06 pending. |
| Pi source alignment | `f1921e5` / `codex/paid-pilot-deploy-align-20261003` |Immutable database/proxy pins,6MiB tunnel cap; based on draft #9. Cached pinned Caddy validates; compose parses without env resolution. No Pi change. |
| Provider honesty/tool roster | `2870967` / `paid-pilot-tool-roster` |Beta guide qualifies provider verification/privacy; see tool usage below. Backup published. |
| M5 retained raw-file admission | `360078e9d3357267711f006888b578f5a0c6c434` / `codex/paid-pilot-upload-admission-20261003` |All3 production insertion paths use atomic admission/actual bytes, defaults100MiB/workspace512MiB/install; operational circuit breakers, not plan promises.11 DB+24 units/tsc/lint. This base slice covers raw bytes only; queue/chunk follow-ons below are implemented. Global parser resources and physical-storage overhead remain open. |
| L3 parser authority | `571d1c62d83d7f01461739ad1ed4e830c04d7796` / `codex/pilot-sandbox-env-round1` |Actual child excludes credentials/PATH/preloads/proxies; explicit Windows runtime exception only.11 units/tsc/lint. Full filesystem/network/OS isolation remains open. |

## Combined evidence and preserved failures

Test-only assembly `codex/paid-pilot-combined-20261003` tested implementation **`4a907b84c630388befe77044bf18c318826737ed`** combines reviewed slices and original draft beta recovery work. It is **not a direct PR** (266 changed paths against main before final evidence, exceeds150). Independent assembly review found expected disjoint catalog/auth unions, no unintended executable security delta.

Fresh focused run: **134/134 DB tests,15 files**, using pruned isolated node_modules and a uniquely owned cached Postgres17.6 test container/database. Source clean, cleanup succeeded. No web/browser/live provider/local full gate. Evidence: that branch's `combined/integration-1790993308058.json` and log. A subsequent independent review identified inherited-process-environment exposure in the harness; explicit allowlisting/label-verified cleanup was added. Clean source `1fff962e4711816558b2e2484f2078deebe5753a` then passed141/141 across16files: [clean DB metadata](../../artifacts/phase-4/paid-pilot-round1/combined-clean-1fff962.json). The earlier141 run started during merge and is retained as dirty-source preparation only. Further harness hardening refuses dirty source and verifies final source identity. No real env file was read, credential exposure asserted or production database used.

Earlier harness attempts preserved: absent synthetic billing seeds caused110/128; two fixture corrections preceded billing-only19/19 and134/134. H3's missing fake legacy Google fixture was corrected before63 passes/new revoked-initiator regression. Safe-retry's GET fixture needed a required timeout; then28 passed. Body deadline's first localization test caught corrupted Arabic from PowerShell piping; UTF-8 correction gave31 passes. Upload admission's first two Company Builder fixtures failed to reach/name the stored legacy-agent field; corrected typed synthetic fixture passed unchanged quota assertions. No assertion/baseline removed.

VP-05/VP-06 consequential draft qualification is repaired in source/deterministic packets; fresh API/worker/browser/live field acceptance absent. DV2-02 protected configuration is PP-08 BLOCKED. Historical WebKit approval transport `ECONNRESET` remains **OPEN**:77 pass/1 fail plus later docs-only green CI is not a root cause or acceptance. No retry/baseline masking.

Current `97567e8` also passed84 focused units/13files, full typecheck and targeted lint. Initial lint invocation used a nonexistent platform-auth path; corrected existing paths passed. [Unit evidence](../../artifacts/phase-4/paid-pilot-round1/unit-97567e8.md). Actual pinned Node22-alpine v22.23.3 executed seven exact-module crypto checks: [crypto-only runtime evidence](../../artifacts/phase-4/paid-pilot-round1/runtime22-result.json). Current candidate crypto/journal also passed18 encrypted DB-backup/empty-destination restore/refusal/decryption checks in disposable network-isolated databases; both containers/private files removed: [DB-only recovery evidence](../../artifacts/phase-4/paid-pilot-round1/recovery-current-97567e8.json). These do not certify final application build, application migrations, ARM64, deployed restore/rollback or Pi. Historical beta ARM64 evidence remains historical; actual external alerts are unverified.

## Tool/model usage and quotas

| Tool | Tasks / result | Limit/cost disposition |
|---|---|---|
| Codex |Lead/security/product/pre-push sol high; routine luna high;3 workers max, heavy jobs sequential. |No warning observed. Numeric headroom unverified; no remaining-percentage claim. |
| Antigravity/Gemini |CLI models/help/auth inspection. |No positive subscription auth proof; generation BLOCKED under$0. |
| OpenCode free route |Inspected free model/routing. |Pay-as-you-go auxiliary routing not excluded; generation BLOCKED under$0. |
| Command Code |One usage/no-session probe. |Insufficient credits/handle assertion; STOPPED this round. |
| Claude Haiku |Existing Max auth; two bounded attempts. |Max-turn exits, no usable result; retries STOPPED. No API-key route. |
| Claude Fable |One tools-disabled bounded readiness decision. |Completed: NOT READY; provider/payment/policy/deployment acceptance missing. No quota warning. |
| CodeRabbit |Zero review requests. |Allowance/overage evidence absent; BLOCKED. |

Detailed `ai-tool-usage.md` lives on the tool-roster branch. Blocked $0 routes supersede target tool-share percentages; no paid alternative used. Assistant subscriptions do not establish customer API entitlement. Fresh read-only GitHub check at02:28UTC verified20 reviewed backup refs and zero round-branch Actions runs in the latest30; latest run predates this round. Combined/coordinator backups completed at closeout below; the earlier02:28 remote inventory is a historical snapshot, superseded by the final read-only check.

## Next round / remaining acceptance

1. Final evidence/branch backups and owned-resource cleanup are complete (see closeout below). Queue/index admission is completed in source `e437af28b177f9998bca582de7b9752ab7e8429e` (19DB/24units); retained file counts `0bf0a49abe1cbf4dc4c8f5c71f7529a04ef874fe` (17DB/36units) and indexed text storage `c6739566558981c0b59d5a3564603ef651c4b0bd` (26DB/32units) are independently reviewed/pushed. These remain operational circuit breakers, not approved commercial limits; refresh this ledger at closeout and stop only owned resources.
2. Internal work: global parser CPU/heap/concurrency and lower OS authority, full disk/index/row/backup capacity assessment, WebKit root cause, final application Node22/ARM64 build/evidence. Raw-file bytes/counts, admitted index queue and indexed text bytes are now bounded, but M5/L3 acceptance remains PARTIAL.
3. After PP-01/09 quota evidence, submit manifest PRs in dependency order (<=150 files), obtain exact-head CodeRabbit/remote CI, then merge and remove only eligible worktrees.
4. Owner PP-02–08: privately complete real identity/providers/AI with verified free allowance, actual sandbox payment journeys, approved target deploy/restore/rollback/alerts, historical-data cleanup, price/terms/support and EN/AR3–5-customer UAT. Full launch inventory remains12 workflow integrations/20 executed AI adapters; scope was not narrowed.

Passing local tests or CI alone cannot establish readiness to sell.

## Closeout verification snapshot (02:46 UTC)

- Exact tested implementation: `4a907b84c630388befe77044bf18c318826737ed`. Final combined focused DB run **162/162 tests,18 files**, includes queue, tiny/empty retained-file counts and chunk budgets. Source/lock/config/CI/deploy inputs were clean before and after; HEAD unchanged; owned container cleanup verified. [Final DB metadata](../../artifacts/phase-4/paid-pilot-round1/combined-final.json).
- Final focused units **112/112,15 files**, full typecheck and targeted lint pass. [Focused summary](../../artifacts/phase-4/paid-pilot-round1/final-checks.json). No browser/local full gate/live-provider test or full application build.
- Operational defaults, consistently configured across processes: retained raw bytes100MiB/workspace512MiB/install; retained files512/4096; pending+indexing sources16/64; indexed UTF-8 text128MiB/512MiB. Transactions serialize writers, count actual storage, preserve ACLs, roll back denied writes and free capacity on deletion. Indexed replacement excludes its old generations; deleted/lost worker claims cannot recreate chunks. Chunk/row/index overhead and complete installation disk use are not certified.
- Fresh chunk test attempt24/26 failed on new fixture assumptions about schema initial generation; assertions now compare actual initial generation/replacement increment and preserved old generation, with product code unchanged; final26/26 retained. Count launcher first used incorrect synthetic key variable names; corrected documented names, final17/17. These failures remain evidence.
- Independent final source review confirms exact retained-file/chunk helper blobs and expected8-code Company Builder union. Required CodeRabbit/CI remain blocked. Pattern-only UTF8/UTF16/base64 Git-blob review is a supplement, not the required secret-matching CI gate; no real env files were read.

## Priority disposition / next

| Owner priority | Disposition | Next required evidence |
|---|---|---|
| Finished isolated lanes | Source prepared, independently reviewed, backed up; combined locally tested | PP-01/09 quota, separate<=150-file PRs, exact-head CodeRabbit +remote CI, merge |
| Complete workflow journey | PARTIAL: API/service/worker/DB doubles pass, rerun requests deduped and5xx writes reviewed | EN/AR browser journeys, field rerun and real external side-effect proof |
| Every integration/AI provider | BLOCKED PP-03/04;12 integration/20 AI adapters inventoried | Dedicated accounts/consent/keys/free allowance, actual EN/AR quality/cost/limits/failures |
| Security/field closure | Source repairs locally tested; M4/M5/M9/L1/L2/L3 and field acceptance PARTIAL | Parser authority/resource controls, current builds, WebKit root cause, PP-02/08 identity/history proofs |
| Deployment/monitor/backup | PARTIAL: source/Caddy/crypto/DB-only restore proven | PP-06 target authorization; full app artifact, migration, actual deployed restore/rollback/alerts |
| One plan/BYOK/metering | Draft one paid1000-execution/2-concurrency plan, request meter source tested; no installed commercial price | PP-05 price/currency/terms and actual sandbox checkout/renewal/cancel/decline |
| Five templates/onboarding/support/policies | Deterministic local templates tested; explicit owner decision and drafts supplied | PP-07 terms/support/legal entity/retention and EN/AR 3-5-customer UAT; invitations separately authorized |

Verdict remains **NOT READY**. This is not FINAL because internal acceptance work remains. Resume from the exact source/manifest/evidence; preserve inherited work and do not repeat owner-fulfilled Company Builder merge approval.

## Round closeout (02:58 UTC)

- Reviewed coordinator checkpoint `186504708ec7595325984e055c7c3d8b75182670` and combined source/evidence backup `de79ab296e772e5f285b33c4cd0ac9056b73f250` are pushed. Tested implementation stays `4a907b84c630388befe77044bf18c318826737ed`; the combined evidence commit changes no source/test/lock/CI/deploy inputs. [Remote/cleanup proof](../../artifacts/phase-4/paid-pilot-round1/CLOSEOUT.json).
- Final read-only API check discovered concurrent PRs #12/#13 and three Gate runs not initiated by this lead session. Runtime head `56f96d9ee31498d2a38d1b4516dadcc49b7ac352` passed all six full-tier jobs in run37090636510. Report remote advanced independently to `a9276f663a2984531ae4f4a76379f36eeff8ce18` and passed full-tier run37090561314; our original `bc46dc2` run was cancelled. These exact narrow heads have remote CI evidence; the combined candidate and remaining slices do not. No inference about quotas, costs, CodeRabbit or acceptance. Preserve the advanced remote ref; do not force-reset it.
- `pnpm stop:test` completed from an owned empty temporary cwd at scoped unused ports, with no existing env file read. Zero listeners on3100/4010/4011/38991/38992/38993; zero marked test launchers. Owned verification/recovery containers and private recovery files were removed; the three inherited containers were preserved. Combined checkout is clean; inherited primary untracked work remains preserved.
- No further source lanes this round. Resume internal acceptance and PP-01 through PP-09 from this ledger; **NOT READY**, not FINAL.
