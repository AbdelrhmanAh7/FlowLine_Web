# Restricted Resend sending-key probe correction

Helper execution, 2026-09-30. Primary granted this bounded source scope and the focused test window. No provider request, account/browser operation, email send, raw-secret access, permission widening, commit or publication. This helper's checks are not independent Claude review.

## Trigger and outcome

Before: protected `/admin` Test calls Resend `GET /domains`; every 401/403 marks the credential rejected. A legitimate sending-only key cannot list domains. Current official [Resend errors](https://resend.com/docs/api-reference/errors) distinguish a 401 `restricted_api_key` + `This API key is restricted to only send emails.` from a 403 with the same error name indicating inactive key.

After: only that exact documented name/message with HTTP 401 and only for the Resend probe returns `insufficient_permissions`. It does not PASS, mark verified, broaden key permissions, send mail or expose/store the provider body. Every HTTP 403, unknown/unreadable 401, inactive/suspended key and wrong name/message still rejects. Other providers retain their previous behavior.

The additive result leaves credential status and verification metadata unchanged through the existing `probePlatformSecret` transition, records a bounded `lastProbeResult`, and audits `unverified`. Existing successful-delivery verification of the exact credential revision remains intact. Admin toast is a warning with matching Arabic/English copy telling the operator to retain sending-only permissions and verify a real email flow to an approved test inbox. No automatic delivery is introduced.

No DB migration: `last_probe_result` is an unconstrained text column (`src/db/schema.ts`, `drizzle/0014_credentials.sql`). Audit already permits `unverified`; only bounded result is persisted.

## Validation

Executed once in primary-granted low-memory window:

`pnpm exec vitest run --project unit --maxWorkers=1 tests/unit/platform-probes.test.ts`

Result: exit 0; 1 file, **14 tests passed**, duration 205 ms; runner start 19:45:38 local time. Mocked network only; no database, external traffic or credentials. Tests cover exact sending-only 401, inactive/suspended 403, same payload at 403, wrong names/messages, null/unreadable body, Postmark isolation, quota/server/network failures and successful read-only authentication. Request assertion verifies one bounded GET only, no email-send endpoint.

Scoped `git diff --check` passed (CRLF normalization notices only). No lint/typecheck, integration/browser suite, build or runtime retest was run in this helper lane. Primary must freeze the combined updated candidate, rerun appropriate gates and rebuild before using updated behavior as runtime evidence. Current cp21 runtime predates this source change; retained cp21 browser evidence does not certify new copy/probe behavior.

## Scope and preservation

Exact tracked source diff relative to cp21 plus newly added test: [RESEND_PROBE_CHANGE.patch](RESEND_PROBE_CHANGE.patch). Comparison confirms these related files contain only the new narrowly scoped hunks beyond cp21:

- `src/server/platform-probes.ts`
- `src/server/platform-secrets.ts`
- `src/app/admin/panel.tsx`
- `src/i18n/messages/ar.ts`
- `src/i18n/messages/en.ts`
- `tests/unit/platform-probes.test.ts` (new)

Inherited panel and translation edits remain intact. Setup inventory: [EMAIL_BILLING_INFRA_CREDENTIALS.md](EMAIL_BILLING_INFRA_CREDENTIALS.md). MERGED: NO. PUBLIC PRODUCTION APPROVED: NO. Spend: $0. No invitations.
