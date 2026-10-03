Applies the documented H4/M1/M2/M3/M6/M8 redaction and fail-closed fixes with synthetic local evidence while keeping historic findings and separate controlled operations visible.

Validation: Six unit files passed (34 tests), full TypeScript check and whitespace check passed. See [focused evidence](artifacts/phase-4/paid-pilot-round1/security-redaction.md).

Limits: Plaintext aggregate remediation is a separate controlled operation. Actual DB billing retry/provider behavior, browser suites, full gate, and live provider behavior were not freshly certified.

Exact candidate: `09be0b3641a139409fad242e9617eec9b0db1975`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 15 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
