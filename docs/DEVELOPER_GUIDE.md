# Implementing features in Flowline

This guide applies to developers and AI agents. Start with [AGENTS.md](../AGENTS.md), the feature request, and the nearest existing implementation. Read the relevant installed guide under `node_modules/next/dist/docs/` before changing Next.js code. Preserve working behavior and stay within the authorized scope.

## Feature workflow

1. Identify the route, server API, permissions, persistence and UI states affected. Inspect existing patterns before adding abstractions.
2. Define real loading, empty, error and success behavior. A successful HTTP request must be checked before displaying success. Unbuilt actions use a disabled control with a translated reason.
3. Add Arabic and English copy together, including field labels, validation, tooltips, accessible names and metadata.
4. Use shared controls and semantic design tokens. Provide keyboard operation, visible focus and narrow-screen layouts.
5. Enforce server validation, authorization and the existing mutation/CSRF guards. Client validation is only feedback.
6. Add meaningful tests for changed behavior, run the required gates and record exact evidence and remaining external checks.

## Localization

The complete canonical catalogues are `src/i18n/messages/ar.json` and `src/i18n/messages/en.json`. Arabic defines the key shape; English must match. Preserve placeholders and plural categories. Use nested JSON objects rather than dotted literal keys. Use `useT()` from `@/i18n/client` in client components and `await getT()` from `@/i18n/server` in server components. Keys remain dotted paths in code, for example `t("account.email")`.

Use `t.plural()` for count messages and the translator's `number`, `date`, `relative`, `duration` and `percent` helpers for localized formatting. Translate product catalogue content by stable ID. Never concatenate translated sentence fragments. Review wording in context rather than only checking key parity.

Arabic and light are the defaults. English and dark remain selectable. Use logical CSS (`ms`, `me`, `start`, `end`) and keep emails, URLs, code and credentials LTR. The owner copy editor at `/admin/copy` provides protected draft/preview/publish overrides; developer JSON remains the base catalogue.

## Components and design

Import shared primitives from `@/components/ui`. [FORMS.md](design-system/FORMS.md) describes schema forms and [CUSTOMIZE.md](design-system/CUSTOMIZE.md) describes the token pipeline. Change `fields.tsx` for shared input presentation and `button.tsx` for shared button presentation rather than copying their classes into pages.

The existing token pipeline starts at `src/design/tokens.ts`, generates CSS with `pnpm tokens`, and is consumed through `src/app/globals.css` and Tailwind v4 `@theme`. Do not introduce a second palette or hand-edit generated outputs. Use semantic utilities such as `bg-card`, `text-hi`, `border-line` and `bg-accent`.

Use meaningful existing Lucide icons; preserve textual accessible names. Motion must be at most 300 ms, honor reduced motion, and never lift cards on hover. Backgrounds are decorative and must not intercept clicks or obscure text. Section navigation uses query parameters, never URL fragments.

## Server, data and security

Use the relevant `src/server/access.ts` helper (`requireWorkspace`, `requireFlow`, `requireRun`, etc.) before accessing workspace resources. Authentication alone is insufficient: enforce the requested role/capability and preserve non-member 404 behavior. Follow existing route wrappers for mutation validation and CSRF; App Router does not automatically protect arbitrary route handlers.

Persist flows, versions, runs and steps in Postgres. Change `src/db/schema.ts` and run `pnpm db:generate` for schema changes; retain the generated migration and metadata. Engine connection rules belong in shared `checkConnection`.

Provider credentials use uncontrolled `SecretInput` plus `takeSecret`; never store them in controlled form state, drafts, URLs, query caches or evidence. Follow `docs/security/CREDENTIALS_DESIGN.md`. Account login/recovery forms have their existing dedicated handling; do not generalize that exception to provider secrets.

Preserve invitation-only signup when configured, verification requirements and test-only environment boundaries. Flowline's owner configures platform authentication through the complete server-only `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET` environment tuple; never expose it to customers. Workspace SSO has its own configuration and callback path. Test-double success does not establish live tenant readiness. Billing remains sandbox-only.

## Verification and handoff

Run focused local checks such as `pnpm lint`, `pnpm typecheck`, and `pnpm test`; stop the test stack with `pnpm stop:test` before integration tests. UI changes require browser coverage through CI. The GitHub Actions workflow `.github/workflows/gate.yml` uses the fast tier for PRs not targeting main (stacked PRs) and pushes to main; PRs targeting main run the full tier; workflow_dispatch selects fast or full. The workflow runs parallel jobs (`static`, `integration`, `chromium`, and `firefox`/`webkit` on the full tier only); the final `gate` job is the single required check and its summary lists every job's result. Open the PR's **Checks** tab and select a job (or **Gate**) to see its step summary; each job uploads its own `flowline-gate-<job>-*` artifact with per-step logs and `summary.json`. To rerun the full tier, use **Actions → Gate → Run workflow**, choose the branch, set **tier** to `full`, and start the run. The `fast` dispatch option is available for a targeted rerun. Run `pnpm gate` locally only when explicitly needed. Respect any feature flags required by the feature under test.

The separate `.github/workflows/lighthouse.yml` workflow runs only on pull requests targeting `main` and on manual dispatch. It reuses `.github/actions/setup-gate` to prepare dependencies, PostgreSQL and CI Chromium, then starts one isolated production test stack. Lighthouse CI (`@lhci/cli@0.15.1`) audits the landing page and sign-in in Arabic and English. The category thresholds (performance 0.80, accessibility 0.95, best practices 0.90, SEO 0.90) are configured at assertion level `warn`, so low scores are reported without blocking merges. Review the workflow step summary for scores and download the `flowline-lighthouse-*` artifact for HTML/JSON reports and the test-stack log. Run it from **Actions → Lighthouse CI → Run workflow** for a manual report. This workflow is CI-only; do not run Lighthouse or its server locally as part of this check.

Tests use port 3100 and isolated test databases, never the development database. English suites use `EN_STATE`; Arabic/RTL needs explicit coverage. No deleted assertions, hidden failures, retries presented as clean passes, or skipped acceptance checks.

Store evidence under `artifacts/phase-N/` with tested SHA and, for uncommitted work, a source fingerprint. Report exact checks and external blockers. No secrets or customer data in artifacts. Production deployment, live payments and release-scope changes require explicit owner approval.

For a handoff, describe the concrete changed behavior, files/configuration, validation, and material limitations. Do not claim every route or integration was manually verified when coverage was partial.
