# Visual review: implementation vs design reference (Phase 1)

**Method.** Screens were captured by `e2e/responsive.spec.ts` at 1440×900, 1024×768, and 375×812 (plus the
767/768/1279/1280 boundary assertions) against the test stack, using real data created through the app.
Each capture was compared with the **application area** inside the matching slide mock (`design-reference/slides`),
ignoring slide titles and frames. Two reviewers took part:

1. Claude (lead) did a side-by-side review. Findings are below, and fixes were verified by re-capturing.
2. A local Ollama `qwen3-vl:8b` model gave an advisory review (`ollama-qwen3-vl.md`). It ran one model at a time, and the model was unloaded afterwards.
   Its output was checked point by point. Many points are **hallucinated or misread**. For example, it claims the
   dashboard "omits the stats cards entirely", but they are present, and it misreads "Runs Ctrl+J" as "Ctrl+R".
   Only verified points were acted on.

Codex's exploratory run also sampled tokens in the browser: app background `rgb(9,9,11)`, sidebar `rgb(17,17,19)`,
Inter Variable, 240px sidebar, and 360px drawer all matched (`../codex-review/REPORT.md`).

## Differences found and fixed

| # | Screen | Difference vs design | Fix | Evidence |
|---|---|---|---|---|
| V1 | Builder | The save badge showed **"● Unsaved"** immediately on open (the design shows it only after edits). Root cause: Postgres jsonb key reordering made the draft look dirty and triggered a needless autosave. | Canonical key-sorted serialization (`use-persistence.ts`) plus an E2E regression test ("opening and selecting does not mark the flow dirty") | `builder-selected-1440.png` now shows "Saved" |
| V2 | Builder | Zoom controls were hidden under the open drawer (the design shows them visible bottom-right) | Controls shift left of the drawer while it is open | e2e: canvas "select, duplicate…" (Zoom in clickable with the drawer open) |
| V3 | Builder | The minimap was oversized and covered nodes (the design's is small, bottom-left) | 160×96 minimap | `builder-selected-1440.png` |
| V4 | Run inspector | A failed step opened on the **Output** tab showing "step failed" (the design opens on **Error** with the suggested fix) | Automatic tab selection: Error for failed steps | `run-inspector-failed-1440.png` |
| V5 | Dashboard | KPI values were in JetBrains Mono (the design uses Inter semibold for KPI numbers; mono is for IDs and payloads) | Inter + tabular numerals | `dashboard-populated-1440.png` |
| V6 | Dashboard | The per-flow **Success** column always showed "—" (Codex CR-02) | SQL fix, plus an integration regression test | `dashboard-populated-*` |
| V7 | All | The Next.js dev indicator overlapped the sidebar user row | `devIndicators: false` | all captures |
| V8 | 404 | The default white Next.js 404 page broke the dark identity | Branded `not-found.tsx` / `error.tsx` | — |
| V9 | Dashboard 375 | KPI notes truncated ("Not metered in th…") | Notes wrap | `dashboard-populated-375.png` |

## Intentional differences (documented, not defects)

See `DESIGN_DECISIONS.md` D1–D16. In short:
- **No sample figures.** Credits show "— Not metered", billing is unconfigured, and there are no plan prices.
- **Integrations are not live yet.** Integrations shows 0 connected; integration templates are disabled with a reason.
- **Phase 1 has no LLM nodes.** Node cards show local node types and durations instead of model/cost, and the badge text avoids the "GPT-5" claim.
- **Flow statuses come from real runs.** They are Draft, Running, Healthy, and Failed, not the deck's Active/Expired, which need Phase 2 triggers and connections.
- **The desktop drawer overlays the canvas** (D1 arithmetic). The desktop builder also keeps the sidebar, as slide 14 specifies.

## VLM points reviewed and rejected (examples)

| VLM claim | Verdict |
|---|---|
| Dashboard "omits the four stats cards" | False: the four KPI cards are present |
| Recent activity "empty" | False: two runs are listed |
| Builder "uses dashed lines between Normalise and Condition" | False: the edges are solid. Dashed styling is reserved for flowing/skipped edges, as in slide 8 |
| "Runs (Ctrl+R)" button | Misread: the button is "Runs Ctrl+J" |
| Missing browser URL bar | Presentation frame, not app UI |
| Status colour coding differs | Expected: the statuses differ by design (D8); the colours follow the token semantics (success/danger/info) |

## Remaining visual gaps (tracked)

- ~~Tablet drawer swipe-to-dismiss~~ has since been implemented and tested (P1-29).
- Light mode is deferred to Phase 3 (D11).
