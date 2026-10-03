Adds shared JSON and auth-request byte ceilings, trusted-IP admission before expensive parsing, a bounded beta-proxy request ceiling, and early-stop limits for knowledge CSV/JSON/text extraction. It preserves stable localized errors and existing multipart/malformed-input behavior.

Validation: Six unit files passed (54 tests), the knowledge persistence integration passed (4 tests), and typecheck/targeted ESLint passed. See [resource evidence](artifacts/phase-4/paid-pilot-round1/security-resource.md).

Limits: M4 is partial until approved-proxy isolation, body deadlines, and deployed routing are verified. M5 is partial until aggregate storage, queue/concurrency, parser CPU/heap, and retention limits are complete. L3 remains **OPEN**: PDF/JSONata execution retains worker environment/filesystem/network/OS authority. No reviewer or fix is claimed for a new L3 task.

Exact candidate: `a9f7597c90b98128a1cebf46a949810e0586c31d`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 20 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
