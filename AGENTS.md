<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Flowline — project rules (all agents)

- **Scope:** Phases 1–3 are delivered; Phase 4 (private beta) status is in `SCOPE_MATRIX.md` and `docs/implementation/PHASE4_BETA_REPORT.md`. New work needs its own prompt. **Production deployment, live payments and release-scope changes need explicit owner approval.** Unverified integrations must never be presented as production-verified.
- **Design source:** `design-reference/` (slide renders + `DESIGN-REFERENCE.md`). Tokens live only in `src/app/globals.css` `@theme`. No generic dashboard styling, no hover lifts, and motion ≤300ms with `prefers-reduced-motion` honoured.
- **Arabic-first:** Arabic is the default language (RTL), English secondary. Every user-facing string goes through `src/i18n` (`useT`/`getT`), with identical keys in `messages/ar.json` (source of truth) and `messages/en.json`. Product-supplied content (templates, catalog text) is translated by stable id in the UI layer. Use logical CSS (`ms/me/start/end`); keep emails, URLs, code and credentials LTR. E2E runs in English (`EN_STATE`), and `e2e/arabic.spec.ts` covers Arabic/RTL.
- **Private beta:** sign-up is invitation-only when `FLOWLINE_BETA_MODE=invite_only` (`src/server/beta.ts`, enforced in the better-auth hook for every sign-up path). Email verification is required; tests and release scripts verify users through the real endpoint (the test outbox, or the staging DB outbox). The DB email outbox is allowed only with `FLOWLINE_ENV=test|staging`. Billing is sandbox-only; live keys are refused without explicit owner approval.
- **Honesty in UI:** no fake success, metrics, pricing, connections, or model names. Anything not built must show its real state, or a disabled control with a reason (`Button disabledReason`).
- **Data:** flows, versions, runs and steps live in Postgres. Every server access goes through `src/server/access.ts` (non-members get 404). Schema changes need a drizzle migration (`pnpm db:generate`).
- **Engine:** `src/engine` is shared by web and worker. Connection rules exist once (`checkConnection`).
- **Test-only code** (fault injection, relaxed rate limits) must stay behind `FLOWLINE_ENV=test`. Tests use `flowline_test` (or `flowline_test_<suffix>` for gate shards and isolated stacks) and port 3100 (or the stack ports from `scripts/test-stack.cjs`), never the dev DB.
- **Gates before commit (owner decision 2026-10-01, two tiers):** every commit passes `pnpm gate` (≈3–4 min: lint, typecheck, evidence secrets, unit, contract, integration sharded over its own test databases, and Chromium's `@critical`/`@cross-browser` specs split over isolated test stacks). Before merging to main, run `pnpm gate:full` (adds every Chromium spec, Firefox and WebKit). Both are `scripts/gate.mjs`; logs and `summary.json` go to `artifacts/gates/` (git-ignored; copy a run under `artifacts/<area>/` to keep it as evidence). The individual commands (`pnpm lint`, `pnpm test:integration`, `pnpm test:e2e`, `bash e2e/tools/browser-docker.sh <project>`) still work for focused runs. Integration tests refuse to run while a test-stack worker is up on their database (`pnpm stop:test`). Never delete an assertion or change a baseline to hide a bug; skipped or flaky tests are failures.
- **Helper agents** (Kimi, Codex, OpenCode/Command Code on free models, local Ollama): at most 3 at once (prefer 1–2, the laptop is resource-limited). Helpers don't commit, and there is never more than one agent per browser session. Use Ollama local models one at a time (`qwen3-vl:8b`, `qwen2.5:7b`).
- **Keyboard:** shortcuts must not fire while typing (`isTypingTarget`). Ctrl stands in for ⌘ on Windows/Linux.
- **Evidence:** test reports, screenshots and reviews go under `artifacts/phase-N/`, tied to the tested SHA. No secrets or customer data in evidence.
