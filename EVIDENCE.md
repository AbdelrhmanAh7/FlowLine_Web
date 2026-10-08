# Evidence: Issue #62 (Dependabot alert #3: source-map-js ≥1.2.2)

Checked against commit `aceceb7911ae78417e9a2e29645337c3a4dad1d5` on branch `ai/62` at 2026-10-08 16:15 UTC by the AI implementer.
Requirement IDs from PRD draft `3f227121-0472-8132-9cd1-d43bb8d7ba54`.

## Requirements Verification

| Requirement ID | Description | Status | Verification Details |
| --- | --- | --- | --- |
| REQ-FL-62-1 | Update `pnpm-lock.yaml` file to version 1.2.2 or higher | VERIFIED | `source-map-js` upgraded from `1.2.1` to `1.2.2` via `pnpm-workspace.yaml` overrides |
| REQ-FL-62-2 | Create a tracked PR to reflect the `pnpm-lock.yaml` update | READY | Branch `ai/62` tracked to issue #62; implementation changes strictly scoped to ~41 lines (in `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `docs/`), with ~102 lines of unit tests and `EVIDENCE.md` totaling ~224 lines diff, well below the ~300 lines limit |
| REQ-FL-62-3 | Run the fast tier CI pipeline after updating the lockfile | VERIFIED | Local fast-tier checks passed: lint (0 errors), typecheck (0 errors), unit tests (1248/1248 passed across 98 suites), contract tests (468/468 passed across 23 suites), build validated |
| REQ-FL-62-4 | Alert #3 is closed as fixed | POST-MERGE | Dependabot closes alert #3 automatically upon merge to `main` |
| REQ-FL-62-5 | `gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open --jq length` returns 0 (or only alerts newer than this issue) | POST-MERGE | Pre-merge query returns 1 (`source-map-js`, alert #3); will return 0 after merge to default branch |
| REQ-FL-62-6 | The `pnpm-lock.yaml` file reflects the updated version 1.2.2 | VERIFIED | Verified by `tests/unit/dependency-advisories.test.ts` (`@issue-62 AC1`); lockfile contains `source-map-js@1.2.2:` and zero occurrences of `1.2.1` |

## First-Hand Command Outputs

### 1. Acceptance test: lockfile advisory check
`pnpm vitest run tests/unit/dependency-advisories.test.ts`
```
 ✓ |unit| tests/unit/dependency-advisories.test.ts (2 tests) 2ms
   ✓ dependency advisories security check (2)
     ✓ semver comparison correctly handles prereleases and stable versions 1ms
     ✓ @issue-62 AC1: lockfile resolves source-map-js >= 1.2.2 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### 2. Drizzle Tooling Prune regression check
`pnpm vitest run tests/unit/drizzle-tooling-prune.test.ts`
```
 ✓ |unit| tests/unit/drizzle-tooling-prune.test.ts (2 tests) 18ms
   ✓ Drizzle Kit unused loader removal (2)
     ✓ keeps the audited Kit version and verifies its shipped runtime never references the removed loader 16ms
     ✓ removes the vulnerable binary graph from the lockfile instead of suppressing the advisory 1ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### 3. Unit test suite
`pnpm test`
```
 Test Files  98 passed (98)
      Tests  1248 passed (1248)
   Duration  9.73s
```

### 4. Contract test suite
`pnpm test:contract`
```
 Test Files  23 passed (23)
      Tests  468 passed (468)
   Duration  17.33s
```

### 5. Static analysis
`pnpm lint && pnpm typecheck && pnpm check:evidence`
```
eslint . --cache: clean (exit 0)
tsc --noEmit: clean (exit 0)
check-evidence-secrets: 0 local secret value(s) checked across 1307 file(s); 0 hit(s)
```

### 6. Dependabot alert #3 status (pre-merge)
`gh api repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts/3 --jq '{number, state, dependency: .dependency.package.name, advisory: .security_advisory.ghsa_id, patched: .security_vulnerability.first_patched_version.identifier}'`
```json
{
  "number": 3,
  "state": "open",
  "dependency": "source-map-js",
  "advisory": "GHSA-68fv-2mgg-jv7q",
  "patched": "1.2.2"
}
```
`gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts?state=open' --jq length`
```
1
```
Post-merge verification step: after merge into `main`, rerun the command above and verify output is `0`.
