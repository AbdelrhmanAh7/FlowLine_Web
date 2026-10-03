Adds non-blocking Lighthouse CI collection with separate Arabic and English report outputs. Removes additive collection behavior that could mix a prior locale's report into the next locale. Reports performance evidence without turning score thresholds into merge blockers.

Validation: `node --check lighthouserc.cjs` and whitespace check passed. Lighthouse CI/browser collection was not run locally; the lane's guide marks it CI-only. See [focused evidence](artifacts/phase-4/paid-pilot-round1/lighthouse-focused.md).

Limits: No GitHub CI run, browser run, production performance guarantee, or real-provider check is claimed.

Exact candidate: `d4eae152b1931f08e1bc1c434eef3ca1f90bbde5`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 4 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
