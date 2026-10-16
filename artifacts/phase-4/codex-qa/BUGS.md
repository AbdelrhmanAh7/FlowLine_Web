# Phase 4 Chrome exploratory QA findings

Tested staging revision: **fdb1cb00a2326303e3923478254afd5a5f1e0567** on **2026-09-28**, Google Chrome **153.0.8010.54**. Agent-driven exploratory browser test in Chrome; not human UAT.

**Counts: P0 0 · P1 0 · P2 2 · P3 0.** Both findings are open. No product code was changed or committed.

## P0

None observed. Browser tenancy checks returned not-found pages; no data loss or cross-workspace exposure was observed within tested coverage.

## P1

None observed. Missing live integrations and billing are expected configuration blockers, not verified journeys.

## P2

### CX4Q-01 — Arabic product content remains English in templates and integrations

**Area:** Arabic-first localization; reproduced at desktop and mobile widths.

**Steps:**

1. Sign in and select Arabic through the user menu.
2. Open Templates. Inspect the built-in Lead Qualifier, Support Ticket Router and Order Totals cards and their node chains.
3. Open Integrations. Inspect provider categories and descriptive copy.
4. Search GitHub and click Connect/ربط.

**Expected:** Product-supplied step labels, explanations, categories and credential field labels are localized. Provider brand names and technical code may remain unchanged; user-authored names are outside this finding.

**Actual:** Arabic pages retain English step labels such as `Normalise lead`, `Hot lead`, `50+ employees?`, `New ticket`, `Score urgency`, and `Flag for review`. Created template flow names also remain English. Integration categories/descriptions such as `Developer tools` and `Read pull requests and comment on issues in GitHub repositories` remain English; the Arabic GitHub dialog labels its credential field `PERSONAL ACCESS TOKEN`. This affects understanding for Arabic-first users, rather than being solely cosmetic.

**Workaround:** Read the English content or use the English language option. No garbled text or document-level overflow was observed.

**Evidence:** [Arabic templates](screenshots/50-ar-template-labels.png), [mobile templates](screenshots/54-layout-templates-ar-375.png), [Arabic integration catalog](screenshots/54-layout-integrations-ar-1440.png), [Arabic/mobile GitHub dialog](screenshots/58-ar-github-dialog-mobile.png), [dialog text](evidence/58-ar-github-dialog-mobile.json), [template execution labels](evidence/51-invited-editor-run.json).

**Retest:** Check the same supplied content in Arabic at 1440/1024/375 px, verify English remains correct, and preserve LTR presentation for credential values, emails, URLs and code.

### CX4Q-02 — Interrupted AI run exposes raw SQL and incorrect configuration advice

**Area:** Service interruption diagnostics; Journey 10.

**Steps:**

1. Create/publish a local manual-trigger → AI Generate flow using Ollama/qwen2.5:7b.
2. Start a run and observe the AI step running.
3. Pause `flowline-staging-db-1` once for about 20 seconds, then unpause it.
4. Allow the UI to recover without reloading; open the failed step in the run inspector.

**Expected:** Clearly identify the database interruption and give appropriate recovery advice. An interrupted run may fail honestly; exposing internal SQL does not help a user recover.

**Actual:** The degraded banner appeared by the 10-second sample and cleared automatically afterward. Run **#8** failed with:

```text
Failed query: update "usage_event" set "status" = $1, "cost_micros" = $2,
"settled_at" = $3 where ("usage_event"."idempotency_key" = $4
and "usage_event"."status" = $5) params: [omitted]
```

The canvas and inspector display this raw SQL. The inspector uses `NODE_ERROR` and suggests “Check the node configuration, then re-run from this step,” despite a deliberately unavailable database. Parameter values were omitted; no credential disclosure was observed.

**Workaround verified:** After database recovery, explicitly re-run from the failed AI step. Run **#9** succeeded in about 4.1 seconds, reused the manual trigger, and showed one AI attempt. Run #8 showed one trigger and one AI step with one attempt; no duplicate run was observed. No browser reload was needed for recovery.

**Evidence:** [Run before outage](evidence/60-outage-run-started.json), [degraded UI at 10 s](screenshots/61-outage-10s.png), [at 20 s](screenshots/61-outage-20s.png), [recovered canvas](screenshots/62-outage-recovered.png), [error inspector](screenshots/64-outage-step-error.png), [full error text](evidence/64-outage-step-error.json), [successful explicit rerun](evidence/67-recovery-rerun.json), [health and no-reload evidence](evidence/environment.json).

**Retest:** On a new staging revision, repeat one authorized interruption and check user-facing database error classification, truthful recovery guidance, no raw SQL, automatic banner recovery, and inspector step/attempt uniqueness. This report does not claim provider-side exactly-once proof.

## P3

None confirmed. An initial signup-page console resource 404 had no captured resource URL or demonstrated visible defect; it is retained in the report's error inventory rather than assigned an invented root cause.

## Expected blockers, not additional bugs

- Google Sheets, Gmail and Slack: OAuth not configured, Connect disabled with reasons.
- GitHub: credential dialog requires a token; no credential provided.
- Billing/Paddle: not configured, no checkout available.
- Prescribed PostgreSQL host `db`: rejected as a private/reserved address at connection creation. Journey 9 used the expressly permitted alternative HTTP failure instead.

See [REPORT.md](REPORT.md) for full coverage, journey results, console/network inventory, and evidence limits.
