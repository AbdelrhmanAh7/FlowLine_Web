Avoids automatically repeating non-idempotent writes after a provider 5xx that may follow a successful side effect. Provider verification runs first where supported; otherwise the action enters outcome review. A reviewer retry requires verified non-application, while a reviewer marking the action done resumes without resending. Read-only/idempotent actions retain automatic retries.

Validation: Twenty-eight integration tests and 27 unit tests passed; full TypeScript and targeted ESLint passed with no skips. Tests use local fakes and a synthetic commit-then-500 fault. See [safe-retry evidence](artifacts/phase-4/paid-pilot-round1/safe-retry/README.md).

Limits: The main port's source patch equivalence is recorded, but the final candidate still needs exact-head review and required CI. No real provider, payment, email, browser, or deployed side effect was exercised.

Exact candidate: `b854d2c94ce31ec2503c58f6d883dcfd117edcb1`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 17 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
