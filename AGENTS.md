<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Flowline — project rules (all agents)

- **Scope:** phases are gated. Phase 1 = interface and foundation (see `SCOPE_MATRIX.md`, `docs/implementation/`). Don't start Phase 2/3 work without its own prompt.
- **Design source:** `design-reference/` (slide renders + `DESIGN-REFERENCE.md`). Tokens live only in `src/app/globals.css` `@theme`. No generic dashboard styling, no hover lifts, and motion ≤300ms with `prefers-reduced-motion` honoured.
- **Honesty in UI:** no fake success, metrics, pricing, connections, or model names. Anything not built must show its real state, or a disabled control with a reason (`Button disabledReason`).
- **Data:** flows, versions, runs and steps live in Postgres. Every server access goes through `src/server/access.ts` (non-members get 404). Schema changes need a drizzle migration (`pnpm db:generate`).
- **Engine:** `src/engine` is shared by web and worker. Connection rules exist once (`checkConnection`).
- **Test-only code** (fault injection, relaxed rate limits) must stay behind `FLOWLINE_ENV=test`. Tests use `flowline_test` and port 3100, never the dev DB.
- **Gates before commit:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`, plus `pnpm test:e2e` for UI changes. Never delete an assertion or change a baseline to hide a bug; skipped or flaky tests are failures.
- **Helper agents** (Kimi, Codex, OpenCode/Command Code on free models, local Ollama): at most 3 at once (prefer 1–2, the laptop is resource-limited). Helpers don't commit, and there is never more than one agent per browser session. Use Ollama local models one at a time (`qwen3-vl:8b`, `qwen2.5:7b`).
- **Keyboard:** shortcuts must not fire while typing (`isTypingTarget`). Ctrl stands in for ⌘ on Windows/Linux.
- **Evidence:** test reports, screenshots and reviews go under `artifacts/phase-N/`, tied to the tested SHA. No secrets or customer data in evidence.
