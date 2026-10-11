# Issue #175 questions

- The brief names `routeToProvider` and `routeToHub`, but neither exists in the repo. The exports of `src/ai/hub/routing.ts` are `resolveRoute`, `routeFor`, `deferFor`, `routeSnapshot`, `isRouteRef`, `planRoutes`, `privacyAllows`, `capabilityProblem` and `mayFallback`. The PR tests the real exports (`deferFor`, `isRouteRef`, `routeSnapshot`, `resolveRoute` error paths). Please confirm the intended functions or rewrite the brief.
- The acceptance command `npm test -- --listTests` does not fit this repo: it uses pnpm and Vitest, where test selection goes through `pnpm exec vitest list --project unit`. The file `tests/unit/routing.spec.test.ts` matches the unit glob `tests/unit/**/*.test.ts`.
- No e2e test: this change only adds unit tests. The PR body carries `E2E: not needed — test-only change`.
