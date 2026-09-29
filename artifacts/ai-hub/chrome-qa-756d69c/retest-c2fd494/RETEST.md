# Chrome AI hub retest — c2fd494

**CXQ-05: FIXED. All requested regression spot-checks PASS. One newly attributed P3 finding: CXQ-06 (favicon 404).**

Agent-driven exploratory testing in real Google Chrome. **TEST DOUBLES ONLY — no live cloud verification or general release-acceptance claim.**

## Environment and revision

- Date: **2026-09-29**, approximately **13:57–14:08 Africa/Cairo (UTC+3)**; target `http://localhost:3100`.
- **Google Chrome 153.0.8010.54**, verified using installed executable ProductName/ProductVersion and CDP `Browser.getVersion`. Playwright `channel: "chrome"`, headless; one browser, context and page. [CDP evidence](chrome-version.json).
- Initial `git rev-parse HEAD`: **50682c88e33b35097a7706c018dc4cab6d2a7595**. Final HEAD: **80d9b7aa534b753540630aefdf787ed0e731b4f1**. HEAD advanced externally; the intervening changes are docs/artifacts only. No commits were made by this tester.
- **`git diff c2fd494 HEAD -- src worker drizzle` was empty at entry and completion**. Final `git diff HEAD -- src worker drizzle` was also empty. Tested product code therefore matches the requested candidate.
- `GET /api/health` checked before the browser work and again at completion: `revision: "dev"`, `schemaVersion: 20`, `db: "ok"`, `worker: "ok"`. The endpoint cannot independently attest the running source SHA. The production `next start` build and `FLOWLINE_ENV=test` configuration are supplied by the brief; no server was rebuilt or manipulated. [Environment](environment.txt).
- AI double: `127.0.0.1:4011`; SaaS doubles: `127.0.0.1:4010` (no SaaS journey tested). UI explicitly identifies the local test environment and contract-tested, not live-verified connection.
- Fresh `@flowline-qa.test` account created through the Arabic UI, verified using the test-outbox link and UI confirmation, then signed in through the UI. Workspace **CXQ Retest c2fd494**. Generated password and fake key stayed in memory; no HAR, trace, video or storage-state export.

## CXQ-05 — FIXED

Connected OpenAI through the name/key/check-and-save dialog and discovered `fake-gpt-large`. All price mutations used the UI.

For each locale/width below:

1. In **Usage & limits**, set `ai:openai/fake-gpt-large` input/output prices to **2/8**, save successfully, and open **AI Providers** so its default-model picker loads those prices.
2. Without reloading, return to **Usage & limits**, change input to **4**, leave output at **8**, and save. Wait for the workspace PATCH to succeed.
3. Return to **AI Providers** in the same SPA document. The picker now displays **4/8**.
4. Compare read-only `GET /api/workspaces/da4f0f2d-2a2c-4350-8d65-52334b036bd3/ai/models`: `inputPerMTokMicros: 4000000`, `outputPerMTokMicros: 8000000`, `currency: "USD"`, `source: "workspace_price_table"`.

| Locale / viewport | Before → after | Result | Screenshots |
|---|---|---|---|
| English, 1440 × 900 | `2 in / 8 out` → `4 in / 8 out per 1M tokens` | PASS | [Before](screenshots/cxq-05-en-1440-before.png), [after](screenshots/cxq-05-en-1440-after.png), [clear later view](screenshots/cxq-05-en-1440-after-clear.png) |
| Arabic RTL, 1440 × 900 | `2 مُدخلات / 8 مُخرجات` → `4 مُدخلات / 8 مُخرجات لكل مليون رمز` | PASS | [Before](screenshots/cxq-05-ar-1440-before.png), [after](screenshots/cxq-05-ar-1440-after.png), [clear later view](screenshots/cxq-05-ar-1440-after-clear.png) |
| Arabic RTL, 375 × 900 | 2/8 → 4/8, Arabic price text | PASS | [Before](screenshots/cxq-05-ar-375-before.png), [after](screenshots/cxq-05-ar-375-after.png), [clear later view](screenshots/cxq-05-ar-375-after-clear.png) |
| English, 375 × 900 | 2/8 → 4/8, English price text | PASS | [Before](screenshots/cxq-05-en-375-before.png), [after](screenshots/cxq-05-en-375-after.png), [clear later view](screenshots/cxq-05-en-375-after-clear.png) |

For every individual 2→4 test, `performance.timeOrigin` stayed identical, the navigation entry count stayed **1**, and a document-local canary survived. No `goto` or reload occurred within any price-change sequence. A normal navigation to the workflow occurred between the Arabic phone and extra English phone test; it does not form part of either sequence. [Exact rendered text, document continuity and API comparisons](cxq-05-price-checks.json).

Initial screenshots include transient save notifications; the separately named clear views were captured later after notifications disappeared. Prices are illustrative workspace estimates for the fake model, not provider prices.

## Regression spot-checks

| Requested check | Result | Observed evidence |
|---|---|---|
| CXQ-02/03 — inspector currency label, no raw `costMicros` | **PASS** | Built a manual-trigger → AI Generate flow using palette drags and a mouse-drawn connection; selected `fake-gpt-large`, saved and ran it. Run #1 succeeded. English label **Cost (USD)** and Arabic **التكلفة (USD)** both show **0.000896**, with `estimated` cost source and no raw `costMicros` in the rendered step panel. API metadata has 896 micros; arithmetic is `198 × 4 + 13 × 8 = 896`. [English text](inspector-en.txt), [Arabic text](inspector-ar.txt), [English screenshot](screenshots/inspector-en-1440.png), [Arabic screenshot](screenshots/inspector-ar-1440.png), [run API](run-response.json). |
| CXQ-04 — usage table horizontal scrolling at 375 px | **PASS** | Populated AI and execution rows. In both locales, container width **315 px**, content width **364 px**. Real horizontal mouse-wheel input moved `scrollLeft` **0→49** in English and **0→−49** in Arabic, exposing the cost column. Document and body width remained **375 px**. [Geometry and scroll proof](usage-scroll-proof.json), [English scrolled](screenshots/usage-en-375-scrolled.png), [Arabic scrolled](screenshots/usage-ar-375-scrolled.png). |
| CXQ-01 — Arabic provider prose | **PASS** | OpenAI and Anthropic free-use, data-training and terms explanations appear in Arabic on AI Providers, with technical names retained. [Rendered prose](catalog-ar.txt), [screenshot](screenshots/catalog-ar-1440.png). |

The CXQ-02/03 row covers the brief's currency-label spot-check. The earlier structured fallback-origin defect was **not** re-exercised with fault injection. The usage check covers scrolling and page overflow; it does not repeat the earlier agent-step journey. Workflow creation/execution was desktop; phone checks used a resized Chrome viewport, not a physical phone. No Output node was added, so run-level output is `{}` while the AI step contains generated text.

## Console, network and key exposure

- **0 page exceptions, 0 console warnings, 0 captured page-response HTTP errors, 0 failed-request events.** One console error identifies `/favicon.ico` returning 404; a separate read-only HTTP request confirmed it (CXQ-06). Chrome's automatic favicon request was not emitted through the page-response listener, so it is reported separately rather than omitted. [Browser events](browser-events.json).
- The raw fake key was absent from scanned page HTML, current URLs, all captured request URLs, console messages, captured application API response bodies, localStorage, sessionStorage, document cookies and context cookies. Scanned AI Providers in both languages, Usage, and the inspector. IndexedDB enumeration found **0 databases**, with no scan errors. No browser-storage dump was written. [Scan counts/results](key-storage-scan.json).
- Evidence files were checked against the in-memory password and key canaries. Screenshots were taken after the connection dialog closed, with password inputs masked by the screenshot helper. [Artifact audit](artifact-audit.json).
- Driver-only corrections involved locator roles/scoping and case-sensitive `SUCCESS` versus DOM text `Success`; they did not represent product failures or require a second browser session.

## CXQ-06 — Missing favicon generates a console/network error

**P3 — cosmetic missing asset / console noise. Newly attributed, not proven newly introduced.** The previous report already mentioned an unattributed resource 404.

Reproduction on this stack/product revision:

1. Open `http://localhost:3100/sign-up` in a fresh real Chrome session.
2. Inspect the browser console after page load. Chrome reports `Failed to load resource: the server responded with a status of 404 (Not Found)` at `http://localhost:3100/favicon.ico`.
3. Request `GET http://localhost:3100/favicon.ico`; it returns **404**, content type `text/html; charset=utf-8`. The inspected app document has no `link[rel*=icon]` elements.

Expected: the app supplies a valid favicon without a missing-resource console error. Actual: the default icon request fails. No functional AI-hub impact was observed. [Console location and independent HTTP confirmation](cxq-06-favicon.json).

## Controls and retained state

- Tester-authored files are confined to this retest directory. No product, test-suite or documentation edits outside it; no commits; no server/container/Docker starts, stops or rebuilds. The only browser closed was the browser launched for this test.
- All application mutations used UI. Supporting HTTP requests were read-only outbox, models, run, health and favicon checks.
- Retained QA state: verified QA account/workspace, one owner-only OpenAI connection, one unpublished two-node workflow, one successful workflow run, final prices **4/8**. No default model or fallback policy was saved; the AI node has an explicit model selection.
- Existing/external repository changes were left alone. See the initial/final HEAD and worktree evidence above. This retest does not certify live providers, SaaS integrations, payments, deployment or the broader release.
