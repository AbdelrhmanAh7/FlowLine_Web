# Next action

## Current state — 2026-10-02

- Branch `codex/company-builder-continuation`, HEAD `8663b3e`.
- Stacked PRs: #2 (core, base `main`) -> #3 (UI) -> #4 (docs + evidence 1) -> #5 (evidence 2). PR #1 is closed as superseded. Merge top-down.
- `pnpm gate` PASSED on this tree: unit 725, contract 468, integration 549, Chromium 77 (fast tier). `pnpm gate:full` has NOT run on this tree; it covers all Chromium, Firefox and WebKit.
- CodeRabbit reviewed #2-#5: 41 findings; 30 fixed, 3 declined with reasons, 8 on frozen evidence tracked in issue #6.
- Google consent is configured in Testing mode. Google -> ZITADEL -> Flowline round-trip and owner TOTP/bootstrap are UNVERIFIED. Owner plans those checks tomorrow (2026-10-03); no owner action is requested today.

## Next steps

1. Complete CodeRabbit follow-ups: confirm the three documented declines and disposition the eight frozen-evidence findings in issue #6. Do not modify frozen evidence to make findings disappear.
2. Run `pnpm gate:full` on the intended merge head and retain its result against the exact SHA. Do not treat the fast-tier gate as full-tier evidence.
3. Merge the stacked PRs top-down (#2, #3, #4, #5), if they remain unmerged and approved. Confirm each resulting head before proceeding to the next PR.
4. Tomorrow, 2026-10-03, follow [OWNER_ACTIONS.md](docs/implementation/OWNER_ACTIONS.md) in Chrome: inspect the current page before continuing Google -> ZITADEL -> Flowline; complete owner admin bootstrap and TOTP; review/approve the merge if still needed; then perform any approved provider logins for live integration checks described in [BETA_EXECUTION_BRIEF.md](docs/implementation/BETA_EXECUTION_BRIEF.md).

The full tier and owner identity checks remain unverified until completed. Nothing in this plan approves production deployment or live payments.
