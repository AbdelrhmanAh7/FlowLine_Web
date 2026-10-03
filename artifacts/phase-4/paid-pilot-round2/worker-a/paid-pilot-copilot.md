Adds a reusable benchmark runner and scoring helpers for workspace Copilot. The runner enforces an aggregate cap, rejects unknown-priced real calls, makes one bounded provider attempt, and writes sanitized reports. Existing fake-provider artifacts stay explicitly identified as fake/local evidence.

Validation: Three scorer unit tests passed. Source review checked cap/preflight and fake-versus-hosted separation. The benchmark runner itself was not executed. See [focused evidence](artifacts/phase-4/paid-pilot-round1/copilot-focused.md).

Limits: No database integration, hosted-model quality, Arabic/English quality, cost/limit verification, provider failure proof, or live call is included. The full 20-provider launch validation remains required.

Exact candidate: `0c58c4d39a353957973b12036fa6e0ae415799f1`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 12 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
