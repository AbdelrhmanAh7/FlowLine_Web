# Private beta email

**In the app:** a platform admin opens `/admin` → **Email delivery**, enters the sender and the Resend or Postmark key on the matching card (**Save**, then **Test**), selects it under **Platform settings → Email provider in use**, and sets the **Email recipient allowlist** to approved test addresses or domain suffixes. Changes apply to the next email, with no restart. Before the first admin exists, the bootstrap setup page configures email first (see `PRIVATE_BETA_RUNBOOK.md` §2a). The old `FLOWLINE_EMAIL_*` variables are no longer read at runtime; use **Import from environment** once, then remove them. Apply `drizzle/0009_email.sql` before enabling account email. Do not remove the recipient sandbox until the owner approves customer email. In local development and tests, `outbox` stores messages in `email_outbox`; production refuses that adapter. On a `FLOWLINE_ENV=test` stack only, `FLOWLINE_TEST_AUTO_VERIFY=1` (or the per-context `fl_test_auto_verify=1` cookie) creates e-mail sign-ups already verified and sends them no verification email, for automated testers that cannot read the outbox (#124); any other `FLOWLINE_ENV` ignores both opt-ins — a stray `FLOWLINE_TEST_AUTO_VERIFY` var logs one warning at the first sign-up attempt, the cookie is ignored silently.

An operator can inspect a test message in the **test database only**:

```sql
select recipient, subject, plain_text, created_at
from email_outbox
where recipient = 'qa@example.com'
order by created_at desc
limit 5;
```

Outbox messages contain live confirmation links. Keep them out of logs, screenshots, and shared reports. Clear them according to beta test data retention rules. Provider errors expose a generic delivery error and never log message bodies or credentials.

The reverse proxy must overwrite `X-Real-IP` or `X-Forwarded-For` before requests reach Flowline. The PostgreSQL per-IP limiter uses that trusted header; requests without it still have the per-email limit.

Account link lifetimes: verification 24 hours; password reset and account deletion 30 minutes; invitations 7 days. A token is consumed once. A request to resend verification within 60 seconds gives the same generic response without another email. Forgotten password and verification resend responses do not reveal whether an account exists. Each action has PostgreSQL limits per recipient and per client IP.
