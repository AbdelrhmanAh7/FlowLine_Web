## Objective
- Summarize conversation history for resumption by another agent

## Requirements
- Exclude setup instructions, environment details, repository conventions
- Use single-line bullets with exact file paths/commands/identifiers

## Decisions
- Leverage provided tools/functions for summary generation
- Strictly follow user's formatting/content-filtering rules

## Work State
### Completed
- None
### Active
- None
### Blocked
- None

## Next Move
1. Generate structured summary as instructed

## Relevant Files
- `AGENTS.md`: Project rules/agent behavior guidelines
- `FlowLine_Web-164/AGENTS.md`: Project-specific agent config
- `docs/GITHUB_WORKFLOW.md`: Exception recording workflow
- `docs/implementation/PHASE4_BETA_REPORT.md`: Private beta status
- `next.config.ts`: Next.js API/file structure rules
- `src/server/beta.ts`: Beta mode invitation config
- `src/i18n/`: Arabic/English i18n setup
- `src/engine/`: Shared web/worker code
- `scripts/ci/docs-check.mjs`: PR doc validation
- `scripts/test-stack.cjs`: E2E test env config
- `docs/DEVELOPER_GUIDE.md`: Setup/command references
- `design-reference/`: Design assets/styling guidelines
- `docs/implementation/OWNER_ACTIONS.md`: Owner-only actions tracking
- `docs/implementation/NEXT_ACTION.md`: Task resumption guidance
- `docs/implementation/SCOPE_MATRIX.md`: Scope/phase boundaries
- `docs/implementation/PR_TEMPLATE.md`: PR requirements
- `e2e-army/`: Feature-specific E2E tests
- `artifacts/gates/`: CI gate reports

## Important Context
- Review-before-merge mandate with green checks
- E2E tests require `e2e-army` status/feature-specific shards
- Security posture documentation for dependency changes
- Beta mode: invitation-only with email verification/sandbox billing
- Mandatory doc updates in same commit/PR as code changes