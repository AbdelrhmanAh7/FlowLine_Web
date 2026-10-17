# H1/H2/H3/M7 remediation evidence

The reviewed vulnerable base is `ee70336` (application revision `e690de6`).
`verify-regressions.mjs` restores one vulnerable source file at a time, runs the
corresponding real-database attack test, requires an attack assertion to fail,
and restores the current file byte-for-byte in `finally`. The five `red-*.log`
files establish consent bypass, email pre-hijacking, workspace/global factor
bypass, and cross-issuer account inheritance on that base.

`requested-checks.log` records the required lint/typecheck/unit command; all
72 unit files and 765 tests passed. `focused-integration.log` records 29 passing
tests across seven files, using real auth handlers, signed OIDC tokens, sessions,
email verification/recovery, CSRF, and a dedicated `flowline_test_secauth` database.
All test identities and credentials are synthetic. The runner never loads an
environment file; it uses an already running local Postgres instance and mocks
IdP HTTP transport in memory. It starts no application server or browser.

The final validation manifest is named for the tested commit SHA. The security
report describes source fixes, not deployed acceptance. Existing browser suites
and integration suites which start HTTP fixtures were not run under the owner's
no-local-servers restriction. Live IdP, real email delivery and browser validation
remain outstanding. No schema migration was needed; existing verification and
account tables hold the purpose-separated, expiring state and qualified bindings.
