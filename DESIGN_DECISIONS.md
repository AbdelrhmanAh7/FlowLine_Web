# Design & engineering decisions — Flowline

Status: Phase 1. Each decision lists the source it came from, and whether it is a
DESIGN requirement, a deliberate deviation, or an EXTENSION.

## 1. Foundation: build on the suggested stack, not on Sim

The project directory contained only the design deck, so there was no existing codebase to build on.

**Sim was evaluated as a reuse candidate (bounded check, 2026-09-27):**

| Item | Finding |
|---|---|
| Repo | `github.com/simstudioai/sim`, default branch `main` |
| Pinned SHA evaluated | `e105e0793530b5beecb7422e0342d0c8f1247528` |
| Licence | Apache-2.0, compatible |
| Size | ~690 MB repo; `apps/sim` has 223 runtime dependencies |
| Runtime | Bun monorepo; Next 16; better-auth; Drizzle; `@xyflow/react`; trigger.dev; socket.io |
| External-service coupling | Stripe (`@better-auth/stripe`), trigger.dev background jobs, OpenAI/Anthropic SDKs, Google auth, Cal.com, Turnstile, SSO plugins |
| Visual identity | Its own design system, which would need a full re-skin to match the Flowline reference |

**Decision:** don't fork Sim. Phase 1 needs a small, fully local execution path and
the Flowline visual identity. Stripping Sim's external-service features and re-skinning it would cost more
than building on the suggested fallback stack, and it would mean running two automation
engines side by side. Sim stays a reference for Phase 2 connector patterns (licence permitting).

**Stack (pinned in `package.json` and `pnpm-lock.yaml`):** Next.js 16.3.6 (App Router,
Turbopack), React 19.3, TypeScript 6.0.3, `@xyflow/react` 12.12.0 (React Flow),
PostgreSQL 17.6 (Docker), Drizzle ORM 0.45.3 and drizzle-kit 0.31.11, better-auth 1.7.6,
TanStack Query 5, JSONata 2.2.2, Zod 4, Tailwind CSS 4.3, Vitest 5, Playwright 1.63,
and ESLint 9.39.5. ESLint 10 is incompatible with `eslint-plugin-react`, which
`eslint-config-next` pulls in. TypeScript 7 is excluded because typescript-eslint supports only versions below 6.1.

**Open-source building blocks reused (per the user's request):** React Flow (MIT) for the
canvas; better-auth (MIT) for email auth, sessions, and optional OAuth; JSONata (MIT) as the
sandboxed transform/condition language; TanStack Query (MIT) for retries and backoff;
Fontsource Inter and JetBrains Mono (OFL) as self-hosted fonts, so they work offline; and Drizzle (Apache-2.0).
Helper agents: Kimi Code (integration tests), Codex CLI (independent exploratory testing), and
local Ollama models (visual/copy review).

## 2. Architecture

- **Web** (`src/app`): the Next.js app, with API route handlers under `src/app/api`. All data access goes
  through `src/server/*`, which enforces workspace membership (`src/server/access.ts`).
- **Worker** (`worker/`): a separate Node process. It claims runs with
  `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`, is woken by `LISTEN/NOTIFY` with a 2s
  poll fallback, heartbeats every 5s, and re-queues stale runs (failing them after 3 attempts).
- **Engine** (`src/engine/`): pure TypeScript, shared by the worker (execution) and the editor
  (validation). Connection rules exist once (`checkConnection`), so the canvas and server agree.
- **Persistence**: `flow` holds the working draft plus a monotonic `revision` for optimistic concurrency.
  `flow_version` holds immutable snapshots (`save` = Ctrl/⌘+S, `run` = pinned for each run,
  `overwrite` = the server copy kept before an explicit offline overwrite). Only `save`, `overwrite` and `publish`
  snapshots take a public version number (one sequence per flow); a `run` snapshot has `version = NULL`, so running a
  flow never changes the number its next publication gets (#117). `run` and `run_step`
  store per-step status, input, output, error, skip reason, and timings.
- **Tenancy**: every query is scoped by a workspace the user belongs to. Non-members get
  **404, not 403**, so the existence of other workspaces is not revealed. Roles: owner > editor > viewer.

## 3. Execution semantics (local nodes)

| Node | Behaviour |
|---|---|
| Manual trigger | Emits the run input (the sample payload JSON). One per flow. |
| JSON transform | JSONata expression evaluated on the upstream output. |
| Condition | JSONata expression; truthy → `true` handle, otherwise `false`. Data passes through unchanged; the branch not taken is **skipped**. |
| Output | Stores the value (or the input) under `key` in the run output. |

JSONata runs in a sandbox with a 1s wall clock, a recursion depth of 200, a 4,000-character expression limit, and a 256 KB result limit, enforced through JSONata's
`jsonata.__evaluate_entry/exit` hooks (found in the 2.x source; the documented string names
never fire). Each non-trigger node accepts exactly one input edge, and cycles are rejected.
**Re-run from step** reuses the outputs of steps upstream of the chosen node (`reused`) and
re-executes that node and its dependents using the **latest saved** flow, so a config fix
can be applied without re-running everything.

## 4. Design conflicts and deviations

| # | Source | Conflict | Decision |
|---|---|---|---|
| D1 | Slide 14 | Desktop ≥1280 requires sidebar 240 + canvas ≥840 + drawer 360 = **1440px**, so between 1280 and 1439px the three can't sit side by side. | The drawer **overlays** the canvas at every desktop width (slide 8: "drawer slides … over canvas"). At 1440 the visible canvas is exactly 840px. Nothing is hidden with `overflow`. |
| D2 | Slide 14 | Tablet: "Sidebar collapses to 48px icon rail; drawer overlay + scrim, swipe to dismiss". | Implemented. Swipe the drawer header right (the bottom sheet swipes down) more than 80px to dismiss; tapping the scrim, ✕, or Esc also closes it. Tap-to-place: palette items insert at the viewport centre. |
| D3 | Slide 14 | Mobile: "drawer → bottom sheet (92vh)", "Run monitor primary". | Implemented. The canvas is read-only (pan/zoom only), and the run dock fills the rest of the screen. **Running is allowed on mobile** because it isn't editing. |
| D4 | Slide 5 | "✦ Now with GPT-5 nodes" | Not true in Phase 1, and the deck isn't approval for model names, so it reads "✦ Preview · local nodes, real runs". |
| D5 | Slide 6 | "Free forever for 500 credits/month" | Pricing isn't approved and isn't shown. The copy reads "Build and run flows on local nodes — no card required." |
| D6 | Slides 7, 12 | KPI "Credits used $38.40 / $150", plan prices, "Growth plan" | No sample figures are published. The Credits KPI shows "— Not metered in this preview", and the Billing tab says billing isn't configured. |
| D7 | Slide 10 | "Catalog · 120+", connected Sheets/Gmail/HubSpot | Connectors are Phase 2. The page shows **0 connected** and a "Planned catalog" of 12 with disabled Connect buttons that explain why. There are no fake connections. |
| D8 | Slide 7 | Flow statuses Active/Running/Expired/Draft | Phase 1 has no scheduled or webhook triggers, so "Active/Expired" would be fake. Statuses are derived from real runs: Draft (never run), Running, Healthy (last run succeeded), Failed. |
| D9 | Slide 7 | Sidebar "Canvas" item | Opens the most recently edited flow, or the dashboard when there are none. |
| D10 | Slide 15 | ⌘ shortcuts | On Windows/Linux, Ctrl stands in for ⌘. Ctrl/⌘+D, J, and 0 override browser defaults only while the builder is focused and not typing. |
| D11 | Slide 3 | "Light mode is a token remap" | Deferred to Phase 3 (release polish). Tokens are centralised in `src/app/globals.css` `@theme`, so the remap stays a token-only change. |
| D12 | Slide 8 | Node cards show model, cost, tokens | Local nodes have no cost, so cards show type, duration, and ✓/✗. Cost and token display arrives with the Phase 2 LLM nodes. |
| D13 | Slide 13 | "Save failures queue silent retries" | Autosave retries silently after 1s, 2s, and 4s, and the badge shows "Failed to save — retrying". After that it shows "Failed to save" with a **Retry** button, and the local draft is kept throughout. |
| D14 | Slide 6 | "OAuth-first" | The OAuth buttons stay first but are disabled with an explanation unless `GOOGLE_*`/`GITHUB_*` env vars are set (`/api/auth-config`). Email is the working fallback. |
| D15 | — | Email verification | Not enforced in Phase 1 because there is no email delivery (Phase 3). Passwords are 8–128 characters; better-auth hashes them (scrypt) and rate-limits sign-in and sign-up (10/min) outside the test env. |
| D16 | Slide 12 | Members invite / role change | Shown read-only with real members. Invite is disabled with a reason (Phase 3 collaboration). |

## 5. Extensions (not in the deck)

- **Undo/redo** (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z or Ctrl+Y, plus ↶ ↷ header buttons): a 100-step history, with rapid typing and nudges coalesced into one step.
- **Ctrl/⌘+S** saves a named version (`flow_version.reason = "save"`).
- **Worker-offline degraded banner**: when the worker heartbeat is older than 15s, runs queue and editing keeps working.
- **Offline conflict banner** ("Keep my version" / "Use saved version"): the server copy is always preserved as a version.
- **Test tab "Preview expression"**: evaluates the current expression against the last run's input in the browser. It is labelled as a preview and is not recorded as a run.
- Branded 404 and error pages.

## 6. Test-only features

`FLOWLINE_ENV=test` enables `POST /api/test/faults` (save/load/run fault injection) and
disables auth rate limits. In any other environment the route returns 404 and
`consumeFault()` does nothing. E2E and integration tests run against the separate `flowline_test`
database and the `.next-test` build directory on port 3100. No demo data is seeded into dev.

## 7. Phase 2 decisions

Phase 2 supersedes D6/D7/D8/D12: the Credits KPI now reads the real usage ledger (priced only from the workspace's own price table), Integrations shows the 12 real adapters with honest verification levels, flow statuses include Active / Paused / Expired from published triggers and connection health, and AI step cards show provider, model and tokens.

| ID | Topic | Decision |
|---|---|---|
| D17 | Slide 8 node "Test" | The Test tab shows the node's latest input/output and previews expressions in the browser (no side effects, not recorded). Nodes with external effects or cost (HTTP, AI, app actions) are not "test-fired" in isolation — that would repeat side effects or bill silently; instead "Re-run from this step" executes the step with its stored upstream input after a preview that lists side-effect risk. |
| D18 | Provider boundary | Deterministic suites double only the provider boundary (fake SaaS on :4010, fake Ollama on :4011, test env only via `FLOWLINE_PROVIDER_OVERRIDE`). Live checks are a separate suite (`pnpm test:live`) that uses real local Ollama and a real PostgreSQL server; SaaS live checks need owner-provided sandbox credentials and are reported BLOCKED without them — never faked. |
| D19 | Embedded instructions in documents | Framing alone did not stop the local model (6/9 poisoned). Lines that address the AI or try to override its task are quarantined before the model sees them, and the step records how many. It is a heuristic layer: AI output stays data, action targets come from flow configuration, and sensitive actions need approval. |
| D20 | Lost responses | A non-idempotent action whose outcome is unknown is verified with the provider where possible; otherwise a human decides (done / retry once / fail). This applies to app actions, non-idempotent HTTP requests, and interrupted subflows/loops with side-effecting children. |
| D21 | Resume with redacted data | Users see redacted step data; resume and re-run use an encrypted copy of the real values, so downstream arguments and approval bindings don't change after redaction. |
| D22 | Approvals and non-deterministic inputs | Approval binds exact arguments, so gated steps can't use `$now()`/`$millis()`/`$random()` in their input (validation + runtime). Compute such values in an earlier step. |
| D23 | Code node | Runs only in a locked-down Docker container; without Docker the node is shown as unavailable. It never runs in the web or worker process. |
| D24 | Catalog size | The deck's "120+" is not claimed: the count is computed from the registry (12). |
