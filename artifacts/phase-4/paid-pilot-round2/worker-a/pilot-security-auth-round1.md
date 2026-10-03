Requires mailbox-approved SSO linking and binds callback authority to the initiating, verified user and expected configuration/member/account state. Revoked or stale authority fails closed instead of silently provisioning or linking an identity.

Validation: Final lane record: 19 unit tests and 33 integration tests passed, with typecheck/targeted lint; no skips. Local fixtures and synthetic outbox cover email/IdP boundaries. See [auth evidence](artifacts/phase-4/paid-pilot-round1/security-auth.md).

Limits: H3/federated MFA is a separate stacked candidate. Live email, ZITADEL/GitHub IdP, actual tenant-provider acceptance, browser UX, and final CI remain unverified.

Exact candidate: `08355ae423aa91c7d2b6f106878603d3c2f98ecb`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 29 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
