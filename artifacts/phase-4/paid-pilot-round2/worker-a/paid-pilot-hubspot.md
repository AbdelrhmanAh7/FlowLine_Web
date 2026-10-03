Adds a bounded, schema-validated paginated contact read with fixed provider-error handling and catalog/UI/test coverage. Keeps the integration marked deferred and live-blocked until real-account certification exists.

Validation: Unit HubSpot 31, contract HubSpot 13, plus the two omitted listener-based regressions: egress 31 and redirect 1. All ran separately without skips/retries and close their ephemeral loopback servers. See [focused evidence](artifacts/phase-4/paid-pilot-round1/hubspot-focused.md).

Limits: No real HubSpot account, database integration, or browser E2E was run. Do not describe HubSpot as live-verified or ready for customer data.

Exact candidate: `d5fa51e33fe807a075138e2660074335412df723`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 13 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
