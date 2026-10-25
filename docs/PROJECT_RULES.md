## FlowLine Project Rules & Setup Guide

### 📌 Overview
This document consolidates governance, documentation, and security protocols for FlowLine. All changes must adhere to these rules.

### 🧩 GitHub Workflow
- **Issues & PRs:** Every task has an issue with milestone, `type:`/`priority:` labels, and area on the [FlowLine — Delivery](https://github.com/users/AbdelrhmanAh7/projects/21) board. PRs link to their issue via `Closes #N` or `Refs #N`.
- **CodeRabbit:** PRs require CodeRabbit reviews; threads resolve only after confirmation.
- **Merges:** Never merge draft PRs. Use `Ready for Review` state before merging.

### 📝 Documentation Mandates
- **Docs are code:** Update Markdown docs in the same commit/PR as code changes. Key areas:
  - `docs/<area>/`, `README.md`, `docs/DEVELOPER_GUIDE.md`
  - `docs/implementation/` for phase progress
  - `NEXT_ACTION.md` for mid-task updates
  - `SCOPE_MATRIX.md`/`AGENTS.md` for scope changes
- **CI Check:** `.github/workflows/docs.yml` enforces docs updates. Waiver: `Docs not needed because: <reason>` in PR body.

### 🔐 Security Posture
- **PR Template:** All PRs must fill `## Security posture` section:
  - Dependency changes
  - Secret management
  - Permission/workflow token changes
- **Secrets:** Never record secret values. Track in `docs/implementation/OWNER_ACTIONS.md`.

### 🧪 E2E Testing
- **Gate Requirements:** All PRs add `e2e-army/*.e2e.ts` tests tagged `feat:<id>` for feature coverage.
- **Test Structure:**
  - Per-feature suite: `e2e-army/features/` (tags `feat:`/`shard:`/`lvl:`)
  - Smoke tests: `e2e-army/<issue>-<flow>.e2e.ts`
- **Run Command:** `pnpm e2e:army` (or `--shard-id core-api`)

### 🌐 Localization & Design
- **Arabic-First:** Arabic (RTL) is default. Use `src/i18n` for translations in `messages/ar.json` (source of truth) and `messages/en.json`.
- **Design:** Tokens in `src/app/globals.css` `@theme`. No generic dashboard styling; motion ≤300ms with `prefers-reduced-motion` honored.

### ⚙️ Environment Configs
- **Test/Staging/Prod:** Isolated with strict sandboxing (test ports, sandbox billing). `FLOWLINE_ENV=test|staging` for DB outboxes.
- **Private Beta:** Invitation-only via `FLOWLINE_BETA_MODE=invite_only` in `src/server/beta.ts`.

### 📦 Dependency & CI
- **Security Settings:** Secret scanning, push protection, Dependabot alerts managed by owner in `docs/implementation/OWNER_ACTIONS.md`.
- **CI Gates:** `gate` (Gate combiner) and `docs` checks required for main. Full tier runs only on `workflow_dispatch` with `tier=full`.

### 📜 Additional Notes
- **Docs Not Needed:** Use `Docs not needed because: <reason>` in PR body (valid only with real reason).
- **File Limits:** PRs with ≥3000 files need docs or waiver.

*Last Updated: 2026-10-25*