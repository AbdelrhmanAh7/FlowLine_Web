# Flowline private beta — known limitations

The honest list of what the private beta does **not** do or hasn't proven yet. Shared with beta users (a summary is in
the user guide) and kept current. "Blocked" means it's waiting on an external account or credential, not code.

## Access and scale
- **Invitation-only:** a workspace invitation, a beta access code, or an admin allowlist entry. There's no public
  sign-up.
- **One host, one web instance, one worker.** A host outage is a full outage. Nothing here is a capacity or SLA claim.
  Load checks are small and local (see the beta report).
- Planned maintenance may interrupt service briefly. Runs in progress resume after restart (lease recovery).

## Integrations
- **Live-certified for the beta:** Google Sheets, Gmail, Slack, GitHub. Each is certified only once its live
  certification passes (`artifacts/phase-4/live-certification/`); until then it's **Blocked (credentials)**.
  PostgreSQL was live-verified in Phase 2.
- **Available but not live-verified during the beta:** HubSpot, Zendesk, Airtable, Snowflake, Stripe (as a workflow
  integration), Notion, Linear. They're labelled so in the catalog. They're implemented and contract-tested against
  provider test doubles.

## AI
- **Copilot is experimental.**
  - Proposals are validated, dry-run when possible, and saved as drafts only on approval.
  - Quality is measured with a fixed 12-request benchmark: local `qwen2.5:7b` 5/12. A hosted-model result is pending
    an API key.
  - "Ran without errors" in a preview doesn't mean the result matches the request.
- Agents and AI steps depend on the configured AI provider. Its outages show as step errors, not silent failures.

## Billing
- **Sandbox/test mode only.** No real payments are collected. The billing provider (Paddle) is integrated against its
  sandbox. Live payments need separate owner approval and Paddle account approval.

## Email
- Delivery goes through the configured provider (Resend/Postmark). During the beta, email is sent only to allow-listed
  test recipients (`FLOWLINE_EMAIL_ALLOWED_RECIPIENTS`) until the owner approves customer email.
- There's no "change email address" action yet (the notice template exists).

## Product
- **Arabic-first UI**, with English available.
- Editing workflows needs a tablet or desktop; mobile is monitor-first.
- Not built:
  - real-time presence on the canvas;
  - light theme;
  - SSO against a real identity provider (only tested against a test IdP), so it isn't offered in the beta.
- Google/GitHub sign-in: **Blocked** until real OAuth apps are configured.

## Operations and compliance
- Backups are nightly with a proven restore procedure. **Off-host copies must be configured by the owner.**
- Data retention: runs 90 days, webhook deliveries 30 days, telemetry 180 days, audit 1 year (configurable).
- No compliance certification (SOC 2, ISO 27001, GDPR certification, etc.) is claimed. Privacy and safety documents
  are drafts pending qualified review.
