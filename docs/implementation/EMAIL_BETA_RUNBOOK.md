# Private beta email

Apply `drizzle/0009_email.sql` before enabling account email. Configure `FLOWLINE_EMAIL_PROVIDER` as `resend` or `postmark`, set `FLOWLINE_EMAIL_FROM` and the matching provider credential, and set `FLOWLINE_EMAIL_ALLOWED_RECIPIENTS` to approved test addresses or domain suffixes. Do not remove the recipient sandbox until the owner approves customer email. In local development and tests, `outbox` stores messages in `email_outbox`; production refuses that adapter.

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
