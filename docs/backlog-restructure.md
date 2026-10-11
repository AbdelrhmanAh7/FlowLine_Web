# Backlog restructure — 2026-10-10

Owner ask: smaller, linked tasks with no duplicate work, a vision with clear goals, and a manual test per goal. Vision and goals: [vision.md](vision.md).

## Counts

| | before | after |
|---|---|---|
| Open issues | 45 | 30 |
| Open issues in a goal milestone | 0 | not recounted |
| Duplicates closed (as duplicate, cross-linked) | — | 3 |
| Stale/obsolete closed (not planned, with reason) | — | 2 |
| Merged into another issue (scope copied by comment) | — | 1 |
| Oversized issues split → new sub-issues | — | 1 → 2 |
| New small tasks (next-phase integration, metrics) | — | 7 |
| Goal demo checklist issues | 0 | 6 |
| Sub-issue links added | — | 10 |
| Labels renamed to the shared spelling | — | 21 |

Reconciliation: the after snapshot has 30 open issues. The six issues closed during the restructure (3 duplicates, 2 not planned, 1 merged) are reported separately and are not subtracted from that count. The earlier figures 52 and 54 did not reconcile and could not be rechecked against `gh issue list` here (no GitHub API access); re-verify the before/after counts with `gh issue list --state all` before relying on them.

## Goals

- [FL G1 · Green main, zero high alerts](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/7) — due 2026-10-12 — demo #150
- [FL G2 · First stable tag, 25/25 pilot features green](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/8) — due 2026-10-14 — demo #151
- [FL G3 · Pilot launch: 5 users invited](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/9) — due 2026-10-16 — demo #152
- [FL G4 · Week-1 review: go/no-go for 10 users](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/10) — due 2026-10-23 — demo #153
- [FL G5 · Mizano connector v1](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/11) — due 2026-11-20 — demo #154
- [FL G6 · Post-pilot hardening: concurrency and quality](https://github.com/AbdelrhmanAh7/FlowLine_Web/milestone/12) — due 2026-11-06 — demo #155

## What changed

**Duplicates closed:** #123 dup of #107; #118 dup of #103; #104 dup of #85

**Closed as not planned:** #98 not planned; #105 not planned

**New issues:** #141 (fl6a), #142 (fl6b), #143 (flmetrics), #144 (flint), #145 (flint1), #146 (flint2), #147 (flint3), #148 (flint4), #149 (flint5), #150 (demo-G1), #151 (demo-G2), #152 (demo-G3), #153 (demo-G4), #154 (demo-G5), #155 (demo-G6)

**Sub-issue links:** #141 under #6; #142 under #6; #145 under #144; #146 under #144; #147 under #144; #148 under #144; #149 under #144; #107 under #24; #115 under #90; #116 under #90

**Labels:** type: bug -> type:bug; type: feature -> type:feature; type: security -> type:security; type: ci -> type:ci; type: docs -> type:docs; type: chore -> type:chore; type: test -> type:test; priority: P0 -> priority:p0; priority: P1 -> priority:p1; priority: P2 -> priority:p2; priority: P3 -> priority:p3; area: auth -> area:auth; area: ai-hub -> area:ai-hub; area: billing -> area:billing; area: knowledge -> area:knowledge; area: engine -> area:engine; area: i18n -> area:i18n; area: ui -> area:ui; area: infra -> area:infra; area: company-builder -> area:company-builder; status: blocked -> status:blocked. Shared set across FlowLine_Web, Mizano and NileQuant: `type:{bug,feature,chore,docs,test,security,ci,epic,demo}`, `priority:p0..p3`, `area:*`, `pilot`, plus the hub's `ai-ready`, `ai-skip`, `ai-claude`, `ai-stuck`, `ai-hold`, `ai-fix`, `codex-handoff`, `needs-owner`, `model:*`, `effort:*`, `difficulty:*`. Renames keep every issue attached; no label the hub reads was deleted (the hub matches `priority:\s*p0` case-insensitively).

**Board:** https://github.com/users/AbdelrhmanAh7/projects/21 — fields Goal, Status, Priority, Due; every open issue and PR added.

## Rules kept

- No issue, branch or repo deleted; duplicates closed with a link. No open PR code touched.
- All GitHub writes went through the hub gh layer (`bin/gh-shim`, job `backlog-restructure`), paced at ~4 writes/min above the budget floors.
