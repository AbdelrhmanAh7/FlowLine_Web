# Chrome AI hub retest — 22de627

Agent-driven exploratory testing, not human UAT. **TEST DOUBLES ONLY — no live cloud verification.**

**Original findings: 4 FIXED / 0 NOT FIXED. Requested regressions: 4 PASS / 0 FAIL / 0 BLOCKED. New findings: 1 (P0 0, P1 0, P2 1, P3 0).** CXQ-05 remains open; this is not a general release-acceptance claim.

## Environment

- 2026-09-29, approximately 12:50–13:08 Africa/Cairo (UTC+3), http://localhost:3100.
- Requested candidate **22de627**. Actual **git rev-parse HEAD: 98e401ae0235ce5054c6a1b029f3055786aed0b1**, unchanged. The comparison from 22de627 contains 11 gate-artifact files only; product code is identical.
- Entry and final health: revision dev, schemaVersion 20, database ok, worker ok. The dev endpoint cannot independently attest the running source SHA.
- **Google Chrome 153.0.8010.54**, CDP Browser.getVersion and installed executable ProductName/ProductVersion verified. Headed Playwright channel chrome, explicit executable C:/Program Files/Google/Chrome/Application/chrome.exe. No Chromium substitution.
- AI doubles at 127.0.0.1:4011 (OpenAI-compatible and native Anthropic); SaaS doubles at 127.0.0.1:4010. No SaaS journey exercised here.
- Fresh QA account created, verified through test outbox + UI confirmation, and signed in through UI. Workspace CXQ Retest 22de627. Credentials stayed in memory; no HAR, traces, videos or storage-state files.
- [Environment evidence](environment.json).

## Original defects

| ID | Verdict | Reproduction and result |
|---|---|---|
| CXQ-01 | **FIXED** | Repeated Settings → AI Providers, scrolling provider and unavailable-provider explanations in Arabic and English at 1440/1024/375. OpenAI free-use/data/terms and Anthropic trial-credit prose are Arabic. Remaining English consists of technical names/URLs or identified quotations accompanied by Arabic explanation. [Arabic catalog](catalog-ar.txt), [English catalog](catalog-en.txt), [Arabic phone](screenshots/catalog-ar-375-openai.png), [unavailable provider](screenshots/catalog-ar-375-opencode-zen.png). |
| CXQ-02 | **FIXED** | Configured illustrative prices through UI, built and ran two manual-trigger → AI Generate workflows, selected AI steps, compared run API. OpenAI #1: 456 micros → **Cost (USD) 0.000456**. Anthropic #2 and fallback #3: 654 micros → **Cost (USD) 0.000654**. Arabic label **التكلفة (USD)**; estimated status retained; no raw costMicros line label. Rechecked both locales/all widths. [OpenAI](run-openai.txt), [Anthropic](run-anthropic.txt), [records](runs-sanitized.json), [Arabic phone](screenshots/inspector-ar-375.png). |
| CXQ-03 | **FIXED** | Explicit Anthropic/fake-claude FALLBACK route saved; injected three OpenAI 500s and ran OpenAI-pinned workflow. #3 succeeded via Anthropic with reason fallback #1 after AI_PROVIDER_ERROR. fallbackFrom now contains JSON with original provider/model/error/connection; no [object Object] in six layouts. [Run](run-fallback.txt), [full rendered text/title](fallback-rendered-metadata.json), [phone](screenshots/inspector-en-375.png). Long metadata is still ellipsized with full JSON in its title: this closes the lost-object serialization defect, not a claim that JSON fits inline or touch-only tooltip access was tested. |
| CXQ-04 | **FIXED** | Populated AI usage and one approved agent tool execution to reproduce agent_step. English phone Events/Tokens text gap **13 px** (260.1125 → 273.1125); agent_step/provider dash gap **13 px** (102.05 → 115.05), previously zero. Internal table scroll: 305 px viewport/364 px content; horizontal mouse-wheel scrolling exposes Cost in LTR and RTL. Document width remains 375. Also checked 1024/1440 in both locales. [Geometry](usage-geometry.json), [phone](screenshots/usage-en-375.png), [scrolled cost](screenshots/usage-en-375-cost-scrolled.png), [RTL cost](screenshots/usage-ar-375-cost-scrolled.png). |

## Requested regression pass

| Journey | Result | Observed evidence |
|---|---|---|
| 1 — Connect, masked key, storage | **PASS** | Added OpenAI and Anthropic using Arabic name/key/check-and-save UI, discovered models, searched large and saved default. Masked suffixes and contract-tested/not-live-verified status shown. Full keys absent from scanned DOM, URLs, cookies, localStorage, sessionStorage, actual IndexedDB records (one store), and captured application API response bodies. [Connections](connections-ar.txt), [search](screenshots/model-search.png), [scan](key-storage-scan.json), [fake key-hash checks](fake-request-checks.json). |
| 2 — Two workflows/two models/cost | **PASS** | Two UI-built workflows pinned fake-gpt-large and fake-claude through pickers. #1/#2 succeeded with distinct invoice summaries, provider/protocol/model, 188 input + 10 output tokens each, estimated cost and correct currency labels. No Output nodes were added, so run-level output is {}; generated text is in AI step output. [OpenAI](run-openai.txt), [Anthropic](run-anthropic.txt), [records](runs-sanitized.json). |
| 7 — Allowed fallback/origin | **PASS** | Saved explicit route; authorized mode=500/times=3 exhausted primary retries. #3 succeeded via Anthropic with structured origin/reason. [Policy](fallback-policy.txt), [run](run-fallback.txt), [controls/log checks](fake-request-checks.json). |
| 10 — Usage on phone | **PASS** | Separated columns and reachable costs in both locales. Aggregate arithmetic: OpenAI 1043×2 + 57×8 = 2542 micros; Anthropic 376×3 + 20×9 = 1308 micros. Total **3850 micros = USD 0.003850**; UI rounds rows to USD 0.0025 and USD 0.0013. Six AI events; non-AI unpriced rows flagged. [Usage API](usage-sanitized.json), [English](usage-en.txt), [Arabic](usage-ar.txt), [scroll proof](usage-scroll-proof.json). |

Prices are illustrative workspace estimates for doubles: OpenAI 2/8 and Anthropic 3/9 USD per million input/output tokens, not verified provider prices/invoices. Additional usage comes from two agent model calls and its child workflow; the approved tool execution was added to reproduce the original agent_step row.

## NEW CXQ-05 — Model picker retains old workspace prices after a successful save

**P2 — stale configuration display; full reload is a workaround.**

Tested SHA: **98e401ae0235ce5054c6a1b029f3055786aed0b1** (product identical to 22de627). Real Chrome, English, desktop 1440 px.

1. Connect OpenAI, discover fake-gpt-large, configure workspace input/output prices 2/8, and open AI Providers so its model picker loads these prices.
2. Without reloading, select Usage & limits. Change ai:openai/fake-gpt-large input price from 2 to 4; leave output 8.
3. Click Save limits and wait for saved status.
4. Select AI Providers in the same SPA session; inspect fake-gpt-large in the default picker.
5. Compare read-only GET /api/workspaces/<workspace-id>/ai/models. Reload settings and reopen AI Providers.

**Expected:** Picker reflects the saved workspace price.

**Actual:** Picker still says **2 in / 8 out per 1M tokens**, including a later read. API returns inputPerMTokMicros=4000000 and outputPerMTokMicros=8000000, source=workspace_price_table. Reload makes the picker show **4 in / 8 out**. Initial fresh-account testing similarly showed price unknown after prices were saved; the repeated 2→4 test is the decisive reproduction.

**Impact/workaround:** Model selection displays an obsolete price despite successful save. Reload and reopen AI Providers. No run was dispatched while price was 4; no execution mischarge is claimed. Input price restored to 2 through UI afterward.

Evidence: [before/after/reload](cxq-05-price-stale.txt), [stale screenshot](screenshots/cxq-05-stale-price.png), [after reload](screenshots/cxq-05-price-after-reload.png), [read-only model response](cxq-05-model-response.json).

## Coverage and event inventory

- **18 surface/locale/width combinations**: catalog, inspector, usage × Arabic/English × 1440/1024/375, height 900. Catalog screenshots include OpenAI, Anthropic and unavailable OpenCode Zen at each combination. [Coverage](coverage.json).
- Full creation/execution was desktop; responsive presentation repeated at all widths. This does not claim every journey was repeated end-to-end at every width, physical phone testing, or live providers.
- Completing session: **0 page exceptions, 0 console warnings, 1 console error** (generic resource 404; no uniquely matched URL); **0 captured page-response 4xx/5xx**. No hydration warning. Provider-injected 500s are server-to-fake, not browser HTTP failures. [Events](browser-events.json).
- An initial driver timeout closed the first sequential Chrome session; the completed session used a fresh identity. Early event stream was lost on runtime reset. Locator/case/navigation wait adjustments are driver issues, not product findings. Never more than one active browser session.

## Controls, constraints and remaining state

- Controls: test outbox GET + UI verification; one POST :4011/__fake/openai/fault with mode 500/times 3; read-only OpenAI/native-hub request logs; authenticated read-only run/usage/model APIs. All product mutations used UI.
- No product-code edits, commits, server/container starts/stops/rebuilds or deployment. Tester-authored files confined to this retest folder. Existing codex-stdout.md left intact.
- The running stack log grew and docs/ai/MIGRATION.md became modified externally during testing; neither was edited by this tester. HEAD unchanged.
- Retained QA state: two active owner-only connections, two workflows (OpenAI published for agent tool), four workflow runs, one completed agent run, FALLBACK policy. Prices restored to 2/8 and 3/9.
- No live provider/payment activity. Generated evidence scanned for in-memory password/key canaries: [artifact audit](artifact-audit.json). Screenshots taken after secret-entry forms closed, with password fields masked by helper.
