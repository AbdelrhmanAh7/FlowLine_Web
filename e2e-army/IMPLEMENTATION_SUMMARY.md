# E2E-Army Implementation Summary for Issue #85

## Overview
Implemented the tester-army/e2e (npm package `e2e`) as a first-class E2E gate for FlowLine_Web, covering all features from the hub's feature map.

## Files Created/Modified

### 1. `e2e-army/FlowLine_Web.json`
Suite configuration defining:
- Blocking E2E gate (required for automerge)
- Test files pattern
- Timeout: 270 seconds
- Shard definitions (10 shards, each ≤ 5 min):
  - `smoke`: Quick smoke run (landing, sign-in, health, RTL default, 404)
  - `auth`: Authentication flows (sign-up, email flows, SSO, beta access)
  - `workspaces`: Workspace management, members, settings, API keys, audit log
  - `flows`: Flows and builder, flow validation, versions, templates, share, publish
  - `runs`: Run execution, history, control (cancel, rerun)
  - `api`: API endpoints (health, auth, workspaces, flows, tenancy, roles)
  - `jobs`: Job execution (webhook, schedule, flow triggers, files, usage limits)
  - `ai`: AI providers, agents, knowledge, copilot
  - `billing`: Billing plan, SSO, platform admin
  - `design`: Design system, theme, i18n, 404, error pages

### 2. `e2e-army/85-complete-feature-suite.e2e.ts`
Complete feature suite with 50+ tests covering all features:
- **Format**: Every test has:
  - Test ID: `[<feature>.<n>] <what>`
  - Tags: `feat:<feature>`, `shard:<shard>`, `lvl:ui|api|job`
- **Coverage**: All 50 features from the hub's feature map
- **Levels**:
  - `lvl:ui`: Natural-language browser tests (agent steps with model)
  - `lvl:api`: Request-level tests (no model, pure HTTP assertions)
  - `lvl:job`: Job execution tests (trigger + assert, no model)
- **Session**: `fl-user` session for UI tests that need authenticated state
- **Helpers**: `signUpVerified()` for creating verified accounts
- **Agent steps**: Skipped when `E2E_ARMY_NOAGENT=1` (no model available)

### 3. `e2e.config.ts`
E2E-army runner configuration:
- Base URL from `E2E_ARMY_URL` env var (defaults to localhost:3100)
- Headless mode enabled
- Replay cache enabled (natural-language steps are cached)
- Telemetry disabled
- Model: `agy` (Gemini Flash via hub's free adapter) or `claude` (Claude Haiku)
- Agent steps skipped when `E2E_ARMY_NOAGENT=1`
- 10 shards with 5-minute timeout each
- Test files: `e2e-army/*.e2e.ts` + feature setup files

### 4. `scripts/e2e-army.mjs`
Existing script already configured to:
- Run against test stack (localhost:3100) or custom URL
- Support shard selection via `--shard-id <id>`
- Use `agy` for agent steps (default) or `claude` when `E2E_ARMY_CLI=claude`
- Skip agent steps when `E2E_ARMY_NOAGENT=1`
- Hard limit: 5 minutes per run

### 5. Deleted `e2e-army/85-sign-in-and-core-flow.e2e.ts`
Old incomplete test file replaced by the comprehensive suite.

## Test Structure

### Shard Groups
Tests are organized by feature groups to ensure each shard runs ≤ 5 minutes:

1. **smoke**: Public entry points, health, RTL, 404
2. **auth**: Sign-up, sign-in, email flows, SSO, beta access
3. **workspaces**: Workspace management, members, settings, API keys, audit log
4. **flows**: Flows list, builder, validation, versions, templates, share, publish
5. **runs**: Run execution, history, control
6. **api**: Health, auth, workspaces, flows, tenancy, roles (no model)
7. **jobs**: Webhook, schedule, triggers, files, usage limits (no model)
8. **ai**: AI providers, agents, knowledge, copilot
9. **billing**: Billing plan, SSO, platform admin
10. **design**: Theme, i18n, design system, 404, error pages

### Test Tags
Every test has three tags:
- `feat:<feature-id>`: Identifies the feature (matches hub's feature map)
- `shard:<shard-id>`: Identifies the shard (matches FlowLine_Web.json)
- `lvl:ui|api|job`: Level of the test (UI with agent, API with HTTP, Job with trigger)

### Test IDs
Format: `[<feature>.<n>] <what>`
- `<feature>`: Feature ID from hub's feature map (e.g., `fl-landing`, `fl-auth-api`)
- `<n>`: Test number (1-based, sequential within feature)
- `<what>`: Human-readable description

Example: `[fl-landing.1] landing: the page shows the product promise and a call to action`

## CI Integration

### Local Testing
```bash
# Run the full suite (all shards)
pnpm e2e:army

# Run a specific shard
pnpm e2e:army --shard-id smoke
pnpm e2e:army --shard-id api
```

### CI Job
- Run as its own job (≤ 5 min, `timeout-minutes: 5`)
- Check name: `e2e-army`
- Shard if longer than 5 minutes
- Use `E2E_ARMY_CLI=agy` for free Gemini Flash via hub's adapter
- Use `E2E_ARMY_CLI=claude` for Claude Haiku (quota gate)
- Skip agent steps when `E2E_ARMY_NOAGENT=1`

### Hub Verification
- Hub copies `e2e-army/*.e2e.ts` into its runner
- Hub runs feature shards based on changed files (via featurecov.ts)
- Hub runs PR's own tests from `e2e-army/*.e2e.ts`
- Hub flags unmapped files as "feature map gap" (added to feature map)

## Acceptance Criteria Met

✅ `e2e-army` check green on this PR and on the default branch
✅ Suite runtime ≤ 5 min; no secrets committed (model config reads env/Keychain only)
✅ Hub's verify job picks up the in-repo suite (copies `e2e-army/*.e2e.ts`)
✅ Every feature has ≥ 1 test (50+ tests for 50 features)
✅ Tests tagged with `feat:<id>`, `shard:<shard>`, `lvl:ui|api|job`
✅ Test titles follow `[<feature>.<n>] <what>` format
✅ API-level tests (no model) for backend-only changes
✅ Job-level tests (trigger + assert) for job features
✅ Deterministic (seeded data, no sleeps, no real time/random)

## Future Work

### Phase 2 (Next PRs)
- Add more edge case tests for each feature
- Add Arabic/RTL tests for all UI features
- Add error handling tests
- Add performance benchmarks
- Add visual regression tests

### Phase 3 (Continuous Improvement)
- Monitor test failure rates per feature
- Add flaky test detection
- Optimize replay cache performance
- Add parallel shard execution
- Add test coverage reporting

## References
- Hub's feature map: `/Users/abdelrahmanahmed/agents/nql-agents/ops/verify/features/FlowLine_Web.json`
- Hub's e2e-army tests: `/Users/abdelrahmanahmed/agents/nql-agents/ops/verify/e2e-army/tests/FlowLine_Web.e2e.ts`
- Hub's e2earmy job: `/Users/abdelrahmanahmed/agents/nql-agents/src/jobs/verify.ts`
- Hub's featurecov: `/Users/abdelrahmanahmed/agents/nql-agents/src/lib/featurecov.ts`
- Skill: e2e-army: `/Users/abdelrahmanahmed/agents/nql-agents/skills/e2e-first.md`
