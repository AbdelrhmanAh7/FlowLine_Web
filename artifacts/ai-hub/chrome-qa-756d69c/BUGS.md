# Chrome exploratory QA findings

Agent-driven exploratory testing against local test doubles. **No live-cloud verification.**

Tested worktree HEAD: **8c4f3114d89300f7bfa1552e17e9207d68df2001** (only evidence changes after requested candidate 756d69c). Google Chrome 153.0.8010.54, 2026-09-29, http://localhost:3100. Server health reports dev, not an immutable SHA.

**Counts: P0 0 · P1 0 · P2 2 · P3 2.** No demonstrated security, tenancy, data-loss or money-movement defect. The cost issue below is a display-unit defect; stored accounting reconciles.

## CXQ-01 — Arabic provider catalog retains English-only explanatory text

**Severity: P2 — degraded Arabic-first experience; English language is the workaround.**

**Tested SHA:** 8c4f3114d89300f7bfa1552e17e9207d68df2001.

**Reproduction**
1. Sign in to a QA workspace and choose العربية from the account language menu (or use the default Arabic locale).
2. Open Settings → AI Providers.
3. Scroll to OpenAI, Anthropic and the other provider cards; inspect Free use, Training on data and Terms explanations. Repeat at 1440, 1024 and 375 px.
4. Scroll to researched/unavailable providers and inspect their explanatory paragraphs.

**Expected:** Product-authored provider summaries, eligibility explanations and notices are translated by stable provider ID; technical names/URLs and explicitly identified source quotations may remain in their original form.

**Actual:** Arabic headings surround extensive English explanatory content. For example, the OpenAI free-use description begins “No free inference tier”, its data-use explanation begins “API data is not used”, and Anthropic shows “New users receive a small amount of free credits”. Other provider restriction summaries are whole English paragraphs. These are central explanations, not just model IDs or URLs. RTL framing alone does not localize them.

**Evidence:** [Arabic initial text](01-ai-ar-empty.txt), [375 px card](screenshots/layout-ar-375-provider.png), [1440 px card](screenshots/layout-ar-1440-provider.png). Browser HTML locale was ar/rtl.

**Impact / workaround:** Arabic readers need English comprehension to assess connection limitations. Switch to English for a consistent language experience. Connection creation itself worked.

## CXQ-02 — Inspector labels currency-unit cost as costMicros

**Severity: P2 — misleading unit with a conversion workaround; stored cost is correct.**

**Tested SHA:** 8c4f3114d89300f7bfa1552e17e9207d68df2001.

**Reproduction**
1. In Usage & limits, set illustrative test-double prices for ai:openai/fake-gpt-large to USD 2 input / 8 output per million tokens.
2. Create a manual-trigger → AI Generate workflow using that model through the picker; run it.
3. Open the completed run in Run history and select the AI Generate step.
4. Compare the costMicros line with a read-only GET /api/runs/<run-id> and with Settings → Usage & limits.
5. The retained run #2 is a direct example; #8 shows the same defect with Anthropic.

**Expected:** Either show the integer micro-unit amount under costMicros, or label the converted amount as Cost (USD), with estimated/unknown status retained. The label and number must use the same unit.

**Actual:** Run #2 stores costMicros=484 but displays costMicros 0.000484. Run #8 stores 693 but displays costMicros 0.000693. Values are divided by one million without changing the label or adding currency. The two displayed unit interpretations differ by a factor of one million. Settings labels its converted amount USD correctly.

**Evidence:** [OpenAI inspector](04-openai-inspector.txt), [fallback inspector](15-fallback-used.txt), [persisted run metadata](run-evidence.json), [usage aggregate](usage-sanitized.json), [desktop screenshot](screenshots/layout-en-1440-inspector.png). Read-only source corroboration: src/app/w/[slug]/runs/inspector.tsx renders the raw metadata key but divides costMicros by 1,000,000.

**Impact / workaround:** Users cannot reliably compare the literal unit labels between inspector/API/settings. Interpret the inspector number as USD, or read integer micros through the API. There is no observed erroneous debit, changed price or ledger mismatch. Journeys 2 and 10 fail their cost-presentation check for this reason.

## CXQ-03 — Fallback origin details display as [object Object]

**Severity: P3 — diagnostic formatting defect; selected route and reason remain available.**

**Tested SHA:** 8c4f3114d89300f7bfa1552e17e9207d68df2001.

**Reproduction**
1. Have active OpenAI and Anthropic test-double connections, with priced fake-gpt-large and fake-claude routes.
2. Set routing mode FALLBACK, explicitly add fake-claude on the Anthropic connection, and save.
3. Use the allowed fake control POST http://127.0.0.1:4011/__fake/openai/fault with mode 500 and times 3 to exhaust the primary retry budget.
4. Run a workflow pinned to fake-gpt-large, open its successful run inspector and select AI Generate. Retained run #8 reproduces this.
5. Inspect fallbackFrom in either locale at any target width.

**Expected:** Render the origin route/error entries as readable fields or expandable structured JSON.

**Actual:** fallbackFrom is literally [object Object]. The API has structured origin entries; the UI stringifies the array generically. provider anthropic, model fake-claude and routeReason fallback #1 after AI_PROVIDER_ERROR are correctly present, so the fallback behavior itself passed.

**Evidence:** [run #8 text](15-fallback-used.txt), [structured metadata](run-evidence.json), [English desktop](screenshots/layout-en-1440-inspector.png), [Arabic phone](screenshots/layout-ar-375-inspector.png).

**Impact / workaround:** Origin detail is lost in the inspector. Use the selected-route/reason fields or read the run API. No extra or unauthorized fallback route was observed.

## CXQ-04 — Phone usage columns have zero visual separation

**Severity: P3 — cramped table labels and adjoining values.**

**Tested SHA:** 8c4f3114d89300f7bfa1552e17e9207d68df2001.

**Reproduction**
1. Use a workspace with AI usage and an agent tool execution, so the usage table contains agent_step and AI rows.
2. Choose English, set viewport width to 375 px, and open Settings → Usage & limits.
3. Read the Events/Tokens headings and the agent_step row's Kind/Provider cells.

**Expected:** Columns keep visible spacing (or use a deliberate responsive/scrollable layout) so labels and adjacent values can be distinguished.

**Actual:** EVENTS and TOKENS visually form EVENTSTOKENS; agent_step and the provider dash touch. Measured header text ends and starts at exactly x=227.725 px; agent_step ends and the next dash starts at x=102.05 px. There is zero horizontal gutter. This is crowding, not document-level overflow or a proven geometric overlap.

**Evidence:** [phone screenshot](screenshots/25-phone-usage-collision.png), [bounding rectangles](usage-cell-geometry.json), [English phone coverage](screenshots/layout-en-375-usage.png).

**Impact / workaround:** Reduced readability on phones; widen the viewport or read the separate columns through the API. Numeric values remain present.

## Observations not counted as confirmed product bugs

- One /sign-in React hydration warning involved extra wfd-id attributes. The origin was not established, and no auth failure was observed; recorded in browser-events.json and REPORT.md without attributing it to product code.
- Intentional non-admin/outsider 404s are successful isolation checks. A workflow 404 during a premature navigation after accepting an invitation cleared after normal navigation; not counted as a tenancy defect.
- Test-double success is not cloud verification. Admin wording about configured/verified credentials is not used as proof of a real external provider.
- Phone workflow editing/Copilot creation are explicitly disabled with a reason; this is a stated product limitation, not a hidden failed action.

---

## Remediation (implementation lead): pending Codex retest in Chrome

| ID | Fix | Commit | Status |
|---|---|---|---|
| CXQ-02 | The inspector labels the converted cost with its real unit (`Cost (<workspace currency>)`, passed through the workspace context), never the raw `costMicros` key. `e2e/ai-hub.spec.ts` asserted the buggy label; it now expects `Cost (USD)` and asserts `costMicros` is absent | `083cba9` | FIXED; `ai-hub.spec` passes in Chromium |
| CXQ-03 | Structured step meta (e.g. `fallbackFrom`) is rendered as compact JSON via `src/lib/meta-text.ts`, never `[object Object]`; unit test `meta-text.test.ts` | `083cba9` | FIXED |
| CXQ-04 | Usage table cells get inline gutters (`px-2`, none on the outer edges); the table has its own horizontal-scroll container (min 28 rem) on phones, so no page-level horizontal scroll | `083cba9` | FIXED |
| CXQ-01 | Arabic translation of the provider catalogue prose, by provider id (in progress, separate branch `qa-cxq01`) | pending | IN PROGRESS |
