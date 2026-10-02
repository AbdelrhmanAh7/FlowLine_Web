# Company Builder — acceptance matrix

Tested revision: see `REPORT.md` (exact SHA). `unit:` = `tests/unit/company-builder*.test.ts`, `int:` =
`tests/integration/company-builder.test.ts`, `int-cli:` = `tests/integration/company-builder-cli.test.ts`, `e2e:` =
`e2e/company-builder.spec.ts`, `bench:` = `tests/unit/company-builder-benchmark.test.ts` + `tests/fixtures/company-builder/benchmark.ts`.

## Source traceability (Q01–Q14, R01–R36, copy ids)

**PENDING — source files not supplied.** `Flowline_Virtual_Company_Product_Study_AR_2026-09-30.html`,
`Flowline_Virtual_Company_Risk_Register_AR.md` and `Flowline_Virtual_Company_UX_Copy_AR.json` were not in the
repository or the session. Their ids are not invented here. When supplied, map each id to the rows below (most brief-level
scenarios already have a row) and add rows for anything uncovered. R32 (separation of the founder CLI from customer
runtime) is preserved by CBR-01…CBR-04 regardless.

## Brief §9 scenarios

| Scenario | Prevention / implementation | Test | Status |
|---|---|---|---|
| Solo founder without tools | sample-data plan (`plan.sampleData`), no fake customers/revenue | bench B01; unit planner "partial plan" | PASS (deterministic) |
| Existing company | finance/customer packs | bench B02; int journey | PASS |
| Agency, two similar client names | one workspace per client; membership 404 | int "agency…"; bench B03 | PASS |
| Ambiguous / contradictory answers | contradiction rules, re-ask first, `fact_contradictory` blocker | unit "flags contradictions"; bench B07, B08 | PASS |
| Backtracking, resumed sessions | path + Back, durable state, revision conflict 409 | unit; int "saves every answer…"; e2e journey (reload + Back) | PASS (Chromium; see REPORT for other browsers) |
| Every department | customer, finance, content packs; recruitment planned | bench B01–B05, B10 | PASS |
| Unsupported tools / design outputs | `tool_not_supported`, `content_output_not_supported`, `unavailable` | unit planner; bench B04, B06 | PASS |
| No rows, missing columns, malformed documents | invoice pack validation → discrepancy review | unit packs fixtures `inv-empty`, `inv-malformed` | PASS |
| Prompt injection in inputs | flagged `suspicious`; replies only from approved lines; no echo | unit fixture `cust-injection`; bench B11 | PASS |
| Correct JSON, wrong business result | pack business checks; `matchedOutcome` false | unit "correct JSON with the wrong business result"; int "a person's edit that breaks…" | PASS |
| Duplicate installation, crash mid-way | install key + step records + advisory lock | int "double click, concurrent calls and a crash…" | PASS |
| Changed answers after approval, revoked membership, stale approval | binding recomputed at decision | int "stale approvals are invalidated…" | PASS |
| Private finance/HR knowledge withheld from another role/workspace | agent gets only its own approved-answers source; tenancy 404 | int "creates real draft flows…" (knowledge ACL); int agency | PASS (no HR knowledge exists: recruitment is planned only) |
| Repeated / out-of-order payment events; failed provisioning after payment | billing webhooks never touch CB state; entitlement read-only from billing | int "payment events never activate tasks…" (+ existing p3-billing ordering tests) | PASS |
| Uncertain external outcomes | `uncertain` → verify before retry | int "concurrent approvals…uncertain…" | PASS |
| Concurrent actions | row lock on review item; unique outbox per item | int same | PASS |
| Exhausted limits | CLI quota → `blocked_quota`; run limits via existing `assertExecutionAllowed` | int-cli "login expiry, quota…" | PASS (CLI double) |
| Provider/CLI unavailable, login expired, permission denied, timeout, invalid output, quota, interrupted | adapter error classes | int-cli (fake CLIs) | PASS (DETERMINISTIC double, not real CLI) |
| Malicious command-like text, oversized output, symlink/path escape, inherited CLI config | fixed argv, no shell, 64 KB cap, realpath checks, instruction-file preflight | unit argv/env; int-cli | PASS |
| Public / non-founder attempts to start or cancel the founder's CLI job | uniform 404 before role checks | int-cli "ordinary owners…"; e2e isolation | PASS |
| Browser refresh / worker restart without duplicate work | trial key, request key, stale job → INTERRUPTED | int trial key; int-cli request key + recovery; e2e reload | PASS |
| Cancellation, export/delete semantics | cancel install/job; export answers; delete cascades, drafts kept | int install cancel; int HTTP journey (export/delete) | PASS |
| No false savings / employees-replaced claims | banned-phrase copy test | unit "copy contract" | PASS |

## New risks (CLI prototype) — CBR-*

| ID | Risk | Prevention | Test | Status |
|---|---|---|---|---|
| CBR-01 | A customer/public request invokes the founder's CLI identity | env founder id + designated workspace + loopback + dev build; no web route spawns a process; controller is operator-started | int-cli gate tests; unit gate | PASS |
| CBR-02 | Host header spoofing on a publicly bound server | loopback relay check + documented `-H 127.0.0.1` binding | unit gate | PARTIAL — the Host header is client-controlled; binding to loopback is an operator step (CLI_PROTOTYPE.md) |
| CBR-03 | Inherited instructions/hooks/MCP alter a job | `--restricted --tools "" --strict-mcp-config`, empty MCP config, preflight on instruction files | int-cli isolation | PASS (fake CLI); real CLI BLOCKED |
| CBR-04 | Automatic paid fallback / account switching on quota | no fallback flag; quota → blocked | unit argv; int-cli | PASS |
| CBR-05 | Model output writes records or invents integrations | proposal schema can't add tasks; `storeBlueprint` validation; review required | unit applyProposal; int-cli malicious | PASS |
| CBR-06 | Personal data sent to the vendor | sanitised brief (emails, long numbers) | unit sanitise; int-cli text trial | PASS |
| CBR-07 | Codex flag names differ from the adapter | preflight requires every flag in `codex exec --help` | int-cli `old_version` | PASS for the check; real Codex BLOCKED |
| CBR-08 | Usage rights of founder subscriptions for this experiment | owner decision recorded as open; no customer use | — | OPEN (owner) |

## Deferred / external (not claimed)

Real Claude/Codex CLI runs (laptop), real Gmail/Sheets bindings, live payments, Pi, real Chrome exploratory QA, human
usability, customer/production release — see `REPORT.md` verdicts.
