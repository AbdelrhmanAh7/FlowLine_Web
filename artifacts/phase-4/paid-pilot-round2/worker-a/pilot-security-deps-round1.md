Removes the unused `@esbuild-kit/esm-loader` from the exact Drizzle Kit version's dependency graph using a version-scoped PNPM rule. It does not upgrade transitive majors, suppress advisories, alter auth APIs, or change repository migrations.

Validation: Isolated offline/frozen install reused 531 packages with zero downloads. Seven unit tests and three auth/SSO integration files (31 tests) passed; full typecheck, schema snapshot check for 73 tables, targeted ESLint, and production audit with zero advisories passed. See [dependency-prune evidence](artifacts/phase-4/paid-pilot-round1/security-dependency-prune.md).

Limits: No full Next production build, Node 22 runtime run, browser suite, or final combined CI was performed. Audit output is not a native-binary/container vulnerability scan. Prior advisory evidence and limits remain in [advisory check](artifacts/phase-4/paid-pilot-round1/security-dependencies.md).

Exact candidate: `dd840db6bf6f9329f61007152b3bb500b4d66b75`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 5 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
