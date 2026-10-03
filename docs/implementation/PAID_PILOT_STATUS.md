# Paid pilot — round 2 live ledger

Started **2026-10-03 02:28:30 UTC / 05:28:30 Cairo**. Stop new work before **04:13:30 UTC / 07:13:30 Cairo**; finish before **04:23:30 UTC / 07:23:30 Cairo**. Fable further requires no PR opening after **03:43 UTC / 06:43 Cairo**. Absolute owner stop **09:46 Cairo**. This round uses the earlier deadlines.

**NOT READY. Round report, not FINAL.** Binding [round-2 decision](../../artifacts/phase-4/paid-pilot-round2/DECISION_FABLE.md) supersedes the historical round-1 PR/CI blocks below: **PROCEED-with-guards**, $0 cap, max 3 CodeRabbit reviews per rolling hour (including fix re-reviews), stop on first rate-limit notice until window rolls, stop dispatches on quota/billing cancellation. Never change billing settings, scopes, spending limits or overage. Only lead opens PRs. No merge this round; main remains `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. Drafts #9–#11 remain untouched. Real identity/provider/payment/deployment/policy/UAT owner steps PP-02–PP-08 stay BLOCKED.

Lead branch `codex/paid-pilot-round2-20261003`, isolated worktree `FL-wt-pilot-round2-lead-20261003`; primary dirty/untracked files and all inherited worktrees preserved. Two workers maximum: A backup/exact-head audit/PR payloads; B read-only WebKit forensics. Both gpt-6.1-sol high for security and root-cause work. Heavy local jobs this round: **0**; verification runs on GitHub. Fable subscription decision completed without a quota warning; numeric remaining headroom unknown.

| Task | State | Exact evidence / next action |
|---|---|---|
| Candidate backups | DONE for 19 manifest refs plus 2 immutable combined snapshots | Origin refs matched exact manifest heads; five review-provenance mismatches remain. Independently reviewed immutable combined backups: `97567e8d1e5cf8c724946c3c283b47dbef57a262` and `3c10df7731ae06845a40c0b3b8749b84324ca281`. Combined and old safe-retry never direct PRs. |
| M5 commit | DONE before round | `360078e9d3357267711f006888b578f5a0c6c434`, clean upload worktree, stacked on resource `a9f7597`; do not duplicate. |
| Security report | PR OPEN / latest-docs review coverage pending, NOT merge-ready | [#12](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/12), latest `a9276f663a2984531ae4f4a76379f36eeff8ce18`, 2 files. CodeRabbit reviewed previous `bc46dc2`; one minor provenance finding fixed, replied and resolved. No manual docs re-review per Fable. Current full [Gate 37090561314](https://github.com/AbdelrhmanAh7/FlowLine_Web/actions/runs/37090561314) running; original run 37090125829 superseded/cancelled by push, not quota. Initial review reserved 02:31:51 UTC. |
| Runtime | PR OPEN / CodeRabbit RATE-LIMITED, gate running | [#13](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/13), `56f96d9ee31498d2a38d1b4516dadcc49b7ac352`; exact prior independent diff hash verified; initial attempt 02:40:48 UTC, refused at 02:40:59. Full Gate 37090636510 running. Provider advertised next included review in 9 minutes; Fable permits exactly one unchanged-head manual probe at 02:52 UTC, third conservative attempt. A second refusal stops reviews this round. No new PR before 03:31:52 UTC; no usage-based billing enabled. |
| Dependencies | REVIEW-QUOTA BLOCKED / next if window permits | `dd840db6bf6f9329f61007152b3bb500b4d66b75`; exact prior independent diff hash verified. Open only after runtime review completes/all threads disposed and before 03:43 UTC. |
| Redaction / resource / auth | QUEUED next rolling window | `09be0b3` / `a9f7597` / `08355ae`; exact prior independent review hashes verified. Re-reviews consume same slots and may displace planned PRs. |
| Later candidate review provenance | BLOCKED for PR readiness | Lighthouse, P3, Copilot, HubSpot, product current complete diff hashes differ from historical review hashes; already backed up, but fresh independent review required before submission. |
| WebKit transport root cause | OPEN / read-only investigation | Native runner confirmed; historical reset lacks socket lifecycle instrumentation. Docker helper not used in failed job. Findings will distinguish hypothesis from cause. |

Actions minutes: **pending live run completion/timing API**; neither included balance nor billing is inferred from elapsed time. No paid route, local test stack, provider request, deployment, DNS, live payments, invitations or owner login occurred. [Sequencing decision](../../artifacts/phase-4/paid-pilot-round2/SEQUENCING_DECISION.md) and final round snapshots are the authoritative round-2 evidence. Historical ledger below retains its dated states.

---

## Historical round-1 ledger (superseded where round 2 explicitly differs)

# Paid pilot — round 1 resume ledger

Started **2026-10-03 01:13 UTC**; refreshed **02:29 UTC**, before the **02:53 UTC** refresh deadline. Hard stop **03:03 UTC**. Binding authority: [PAID_PILOT_BRIEF.md](PAID_PILOT_BRIEF.md). Non-interactive: [owner steps remain BLOCKED](OWNER_ACTIONS.md).

**NOT READY for the first paid pilot. Round report, not FINAL:** internal acceptance work remains open as well as owner dependencies. Main is unchanged at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. No production deployment, DNS change, live payment, invitations or paid API traffic occurred.

## Preservation and publication

Lead branch: `codex/paid-pilot-round1-20261003`. Existing dirty/untracked takeover work and inherited worktrees are preserved. Three bounded workers use fresh worktrees; only the lead commits/pushes. Another actor advanced the original auth lane; our H3 follow-up uses its immutable commit in a fresh worktree.

Reviewed slices are backed up as new remote branches without PRs. Gate triggers on main pushes, PRs and manual dispatch; Lighthouse triggers on main-targeted PRs/manual dispatch. Independently inspected new branch pushes do not trigger those inspected workflows; no CodeRabbit review was requested or observed. **Backup is not a CI gate or merge readiness.** Main was not merged/pushed. Existing draft PRs #9–#11 and open field issue #6 remain unchanged.

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
| Provider honesty/tool roster | `2870967` / `paid-pilot-tool-roster` |Beta guide qualifies provider verification/privacy; see tool usage below. Backup pending. |
| M5 retained raw-file admission | `360078e9d3357267711f006888b578f5a0c6c434` / `codex/paid-pilot-upload-admission-20261003` |All3 production insertion paths use atomic admission/actual bytes, defaults100MiB/workspace512MiB/install; operational circuit breakers, not plan promises.11 DB+24 units/tsc/lint. Chunk/queue/parser/storage overhead remains open. |
| L3 parser authority | `571d1c62d83d7f01461739ad1ed4e830c04d7796` / `codex/pilot-sandbox-env-round1` |Actual child excludes credentials/PATH/preloads/proxies; explicit Windows runtime exception only.11 units/tsc/lint. Full filesystem/network/OS isolation remains open. |

## Combined evidence and preserved failures

Test-only assembly `codex/paid-pilot-combined-20261003` currently **`97567e8d1e5cf8c724946c3c283b47dbef57a262`** combines reviewed slices and original draft beta recovery work. It is **not a direct PR** (more than232 changed paths against main, exceeds150). Independent assembly review found expected disjoint catalog/auth unions, no unintended executable security delta.

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

Detailed `ai-tool-usage.md` lives on the tool-roster branch. Blocked $0 routes supersede target tool-share percentages; no paid alternative used. Assistant subscriptions do not establish customer API entitlement. Fresh read-only GitHub check at02:28UTC verified20 reviewed backup refs and zero round-branch Actions runs in the latest30; latest run predates this round. Combined/coordinator final backup remains pending.

## Next round / remaining acceptance

1. Finish the bounded indexing-queue admission slice (IN PROGRESS;16workspace/64installation operational proposal), final combined checks/evidence/branch backup; refresh this ledger at closeout and stop only owned resources.
2. Internal work: aggregate chunk/queue/parser limits, lower-authority isolation, WebKit root cause, final application Node22/ARM64 build/evidence.
3. After PP-01/09 quota evidence, submit manifest PRs in dependency order (<=150 files), obtain exact-head CodeRabbit/remote CI, then merge and remove only eligible worktrees.
4. Owner PP-02–08: privately complete real identity/providers/AI with verified free allowance, actual sandbox payment journeys, approved target deploy/restore/rollback/alerts, historical-data cleanup, price/terms/support and EN/AR3–5-customer UAT. Full launch inventory remains12 workflow integrations/20 executed AI adapters; scope was not narrowed.

Passing local tests or CI alone cannot establish readiness to sell.
