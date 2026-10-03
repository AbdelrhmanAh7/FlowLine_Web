# Flowline private-beta security review — 2026-10-03

## Scope and conclusion

Reviewed application revision **`e690de6d7197abcc4e905dad831721448e8525ec`**, branch `codex/security-review`, in `FL-wt-secreview`. This is a read-only application review; only this report was added. `AGENTS.md` and the existing credentials design were read. No product code, tests, dependencies, configuration or deployment state were changed. No `.env*` file contents were read, no database was opened, no real credentials were exercised, and no packages or images were installed. The pre-existing untracked `codex-lane.log` was left alone.

**Security acceptance for private beta is not established. Resolve the High findings before admitting users, and validate the resulting candidate independently.** No Critical issue was established. Four High findings concern persistent SSO account access, local MFA enforcement and credential disclosure. Configuration-dependent findings below do not imply that the corresponding unsafe configuration is currently deployed.

| Review severity | Count | IDs |
| --- | ---: | --- |
| Critical | 0 | None established |
| High | 4 | H1–H4 |
| Medium | 9 | M1–M9 |
| Low | 3 | L1–L3 |
| Total | 16 | Distinct remediation items |

Severity reflects the application impact and prerequisites, rather than mechanically copying advisory ratings. H1 and H2 are separate: explicit linking consent fixes H1 but does not fix the creation of a globally trusted account using an untrusted tenant IdP in H2. H3 also remains relevant after both linking fixes.

**Remediation update — 2026-10-03:** H4, M1, M2, M3, M6 and M8 are fixed locally on `codex/sec-redaction-h4`; their status lines below distinguish these changes from the original review evidence. `pnpm -s lint`, `pnpm -s typecheck` and `pnpm -s test` passed (74 unit files / 791 tests). See [regression validation](../../artifacts/phase-4/security-remediation/validation.md). No deployment, provider/DB acceptance, CI gate or historical aggregate cleanup is claimed; H1–H3 and the other findings remain open.

## Method and evidence limits

- Inspected all **109 API route files**, their authentication/authorization entry points, shared access helpers, selected downstream queries and worker execution paths. Reviewed workspace pages/layout authorization and searched application/server files for server actions; no `"use server"` declarations were found in those directories.
- Traced better-auth dispatch, global ZITADEL and custom workspace OIDC, account linking, account recovery, sessions, platform bootstrap and TOTP elevation.
- Reviewed encryption, public projections, errors/logging, webhook verification/transactions, HTTP/AI egress, Docker execution, knowledge parsing/uploads, sandbox billing and every GitHub workflow/composite action present at this revision.
- Ran `pnpm audit --prod --json` against this worktree's lockfile. It exited **1** with **one Moderate advisory**, **zero Critical/High/Low advisories**, and a reported production graph of **368 dependencies**. This was a registry audit, not an installation. See L1; the report's Low ranking is contextual and does not change the audit's Moderate rating.
- Checked the release runtime's support status against the official Node.js release/EOL pages on 2026-10-03. No container image, OS-package inventory or runtime CVE reachability scan was performed; M9 identifies the unsupported runtime selected by source.
- Worktree `node_modules` was absent. Read-only secondary inspection used the already installed sibling `../FlowLine/node_modules`, after checking relevant installed versions against this worktree's pins: better-auth **1.7.6**, Next **16.3.6**, undici **8.11.2**. This does not certify that sibling dependency bytes or its complete graph match this worktree's lockfile. Secondary library evidence is explicitly identified below.
- Ran in-memory probes against this worktree's TypeScript sources using Node's type stripping. No source/test files were generated. Egress probes resolved only existing `ipaddr.js`/undici from the sibling installation; redirect endpoints were ephemeral loopback HTTP servers using an explicitly synthetic allowlist and synthetic markers.
- **Eight crypto assertions passed:** round-trip; substitutions of row, workspace, provider and purpose rejected; unmarked legacy ciphertext rejected; distinct platform/workspace rings accepted; reused ring rejected. Keys were freshly generated in the probe process and never printed.
- **Thirteen egress policy assertions passed:** eight private/metadata/mapped addresses rejected, four unsafe URL cases rejected, public HTTPS accepted. These assertions made no external connections.
- Redirect probe: cross-origin **PUT + 302 forwarded its body and `x-goog-api-key`**, while stripping Authorization. Cross-origin **POST + 307 failed with `EGRESS_REDIRECT_REFUSED` and zero target requests**. M1 records the remaining gap, not a regression of the already fixed POST/307 case.
- Redaction probes confirmed a shallow known credential is masked, the same value survives **32 nested wrappers**, an ordinary output field survives when the known-secret list is omitted, and a synthetic credential after a newline in `params:` survives `safeErrorText`. See H4/M2/M3.
- Existing security/unit/contract/integration tests were inspected, **not run**. No lint/typecheck/full gate, database integration, browser exploit, Docker confinement test, real ZITADEL/IdP flow, live-provider request or GitHub CI run was performed. Avoiding environment-loading test wrappers preserved the no-`.env*` constraint. The findings identify tests to add; none were added in this review.

## High findings

### H1 — Workspace SSO links a signed-in global account through an unconsented GET

**Status (2026-10-03): FIXED in source.** GET callbacks only propose linking and never attach a login method or grant a new session for the proposed identity. The signed-in member must confirm the displayed issuer through exact-origin, session-bound CSRF POST with fresh password/TOTP assurance (fresh sign-in for accounts without a local credential). The initiating live session, account, membership and configuration are rechecked under transaction locks. Regression coverage includes absent consent, logout/revocation and configuration replacement; browser/provider validation remains outstanding.

**Locations:** `src/app/api/sso/start/route.ts:14`, `src/app/api/sso/start/route.ts:20`, `src/server/sso.ts:243`, `src/server/sso.ts:271`, `src/server/sso.ts:454`, `src/server/sso.ts:460`, `src/app/api/sso/callback/route.ts:22`.

**Evidence:** The public GET start endpoint captures the current user and stores only `initiatorUserId`. Enabled SSO does not require membership in that workspace. Callback links an existing email-matched account whenever that stored user ID matches. There is no explicit link intent, fresh reauthentication, link-confirmation screen or callback check of the initiating session. The state cookie is HttpOnly/SameSite=Lax and validates the browser, but a top-level cross-site GET can legitimately begin this flow in that browser.

**Exploit scenario:** An invited attacker owning a workspace sets up a public HTTPS IdP they control, test-verifies it and enables it. Allowed email domains are merely supplied strings, so the attacker lists the victim's domain. The attacker persuades an already signed-in victim to navigate to `/api/sso/start?workspace=<attacker-workspace>`. Their IdP silently returns a correctly signed, nonce-bound token asserting the victim's verified email and an attacker-controlled subject. The application creates a persistent link to the victim's global account. Later the attacker signs in using that subject, gaining the victim's other workspace memberships. PKCE/state/signature checks all succeed: they authenticate the malicious IdP's response, not the victim's consent to link. This is source-established; the complete browser/database attack was not executed.

**Recommended fix:** Keep ordinary SSO sign-in separate from account linking. Require an authenticated POST with exact-origin/CSRF validation, explicit issuer/workspace consent and fresh local password/TOTP assurance to initiate a link. Store an explicit link intent and the exact initiating session hash; recheck that session, identity, membership/policy and configuration revision before persisting the link. A GET sign-in must never infer permission to add a login method from an ambient session.

**Test to add:** Two unrelated tenants and an attacker-controlled IdP; navigate cross-site as a signed-in victim and complete valid OIDC. Assert no account link or victim session is granted without an approved POST. Repeat after logout, session revocation and configuration replacement. Confirm subsequent attacker sign-in cannot access the victim's workspace.

### H2 — Tenant-controlled SSO can pre-hijack a future global account's email

**Status (2026-10-03): FIXED in source.** Tenant assertions cannot create global users, verify Flowline email or attach methods by email. Linking requires a fresh real Flowline mailbox verification tied to the exact pending proposal, followed by H1's explicit signed-in confirmation. Owner configuration tests validate OIDC without provisioning identities or sessions. Approved bindings have a distinct namespace; unproven historical bindings fail closed and password recovery removes them while preserving mailbox-approved methods. Attack regressions include undelivered invitations, pre-created historical identities, real mailbox recovery and a second tenant; live email/IdP validation remains outstanding.

**Locations:** `src/server/sso.ts:98`, `src/server/sso.ts:413`, `src/server/sso.ts:473`, `src/server/sso.ts:475`, `src/server/sso.ts:481`, `src/server/beta.ts:85`, `src/server/members.ts:39`, `src/server/members.ts:45`, `src/server/email/flows.ts:174`.

**Evidence:** Custom SSO lets a workspace owner choose allowed domains without proving control of them. A token from that owner's IdP creates a global user with `emailVerified: true` and a persistent SSO account link. The beta check accepts any pending workspace invitation for that email. An owner can create such an invitation even if email delivery is refused; the record deliberately remains. Password reset creates/replaces the local credential and deletes sessions, but retains the previously attached SSO login method.

**Exploit scenario:** Before the victim has registered, the attacker invites their email in the attacker's workspace and signs in through the attacker's IdP claiming that email. No mailbox access is necessary. When the real mailbox owner later uses password recovery to claim the account and joins a legitimate workspace, the attacker's subject remains linked. The attacker can sign in again and access the account's newly acquired memberships. This is a pre-hijacking path requiring later victim adoption of the account, not an immediate takeover of an already existing account or proof of stolen invitation tokens.

**Recommended fix:** Do not treat arbitrary tenant IdP email assertions as global mailbox verification. Require Flowline's real mailbox verification before attaching a new federated identity to a globally trusted email, or restrict federation to administratively verified domains and an explicit identity trust policy. Recovery from an unproven/pre-created federated account should quarantine its existing login methods until the mailbox owner explicitly approves them. Preserve normal recovery behavior for independently established legitimate links.

**Test to add:** Attacker owner, unregistered victim email, invitation whose delivery fails, malicious IdP assertion, then real-mailbox password reset and acceptance of a second tenant's invitation. Assert that the attacker cannot authenticate as the recovered user and that a tenant IdP alone cannot mark an unrelated global email verified.

### H3 — Federated sign-in grants sessions without enforcing enrolled local TOTP

**Locations:** `src/server/sso.ts:527`, `src/app/api/sso/callback/route.ts:25`, `src/lib/auth.ts:98`, `src/server/platform-access.ts:71`, `src/server/platform-http.ts:61`.

**Evidence:** Custom SSO directly calls `internalAdapter.createSession(user.id)` and writes the authenticated cookie. It never checks `twoFactorEnabled` or challenges the user. The installed better-auth 1.7.6 two-factor after-hook matches only `/sign-in/email`, `/sign-in/username` and `/sign-in/phone-number`, not social/OIDC callbacks (`../FlowLine/node_modules/better-auth/dist/plugins/two-factor/index.mjs:244`). Flowline adds no equivalent federated challenge or enforced IdP MFA assurance. Platform read access checks TOTP **enrollment**, verified email and session age; enrollment is not evidence that this session completed a factor.

**Exploit scenario:** An attacker obtaining a linked IdP login/session can obtain a full Flowline session despite the account's local authenticator being enabled. All permissions of that account become usable. For an existing platform administrator, admin reads also become available. **Platform mutations still require the independently checked TOTP step-up; this finding does not establish a write-step-up bypass.** An IdP might enforce MFA operationally, but no such assurance was verified or required by this code.

**Recommended fix:** After federation, use a pending authentication state rather than a usable session until the required local factor succeeds. Alternatively implement a documented, issuer-specific policy verifying appropriate signed MFA assurance and preventing weaker methods from bypassing local requirements. Require session-level MFA assurance for platform reads as well as preserving fresh TOTP step-up for writes.

**Test to add:** Enrolled ordinary user and active admin, each using custom workspace SSO and global social/ZITADEL callbacks with single-factor IdP tokens. Assert no usable authenticated session before the required challenge, admin GETs are unavailable without session assurance, and admin writes still require session-bound fresh step-up.

### H4 — Aggregate run output bypasses known-secret redaction and encryption

**Status:** Fixed locally on `codex/sec-redaction-h4`: aggregate output is redacted with the complete runtime secret set before persistence. Raw execution values and their secret snapshot remain in existing context-bound encrypted step data; approval resumes and reused reruns restore that snapshot without resolving credentials for public projections. Legacy encrypted steps without a snapshot fall back to their public copy. Four worker/engine/projection regressions failed on the old code, then passed (ordinary detail, v1, logs, encrypted resume and reuse). No schema change or raw aggregate column is needed. Historical aggregates still require controlled remediation; DB/provider/CI acceptance remains pending.

**Locations:** `worker/handlers.ts:314`, `worker/runner.ts:205`, `worker/runner.ts:208`, `worker/runner.ts:238`, `src/engine/execute.ts:145`, `src/server/runs.ts:394`, `src/app/api/v1/runs/[rid]/route.ts:22`.

**Evidence:** Runtime credentials populate `hctx.secrets`; step input/output/log/error/meta are redacted using that list, and raw resume data is encrypted separately. However, the final `run.output` is persisted directly as `result.output`. Output nodes copy their raw result into that aggregate before `onStepDone` persists a redacted copy. Run detail applies `redact(publicRun)` without the credential list; API v1 returns that projection. Generic secrets in ordinary strings/keys do not match token patterns, as the synthetic probe confirmed.

**Exploit scenario:** A permitted integration/provider response echoes a credential in an ordinary text/data field, and a flow output maps that value. The step inspector masks it, but the aggregate JSON stores it in plaintext and exposes it to run viewers or a `runs:read` API key. This crosses the intended write-only credential boundary without decrypt access. A provider echo and an output mapping are prerequisites; a real provider leak was not exercised.

**Recommended fix:** Redact the aggregate with the complete runtime secret set before plaintext persistence or projection. Store any necessary raw aggregate in a separate context-bound encrypted column. Cover resumed/reused steps, whose secret set may need reconstructing or whose public output should remain redacted; do not decrypt credentials solely to render a response. Audit existing aggregates through a controlled remediation process.

**Test to add:** A credential-bearing fake integration returns the credential in a generic nested string and a flow output forwards it. Check `run.output`, ordinary run detail, v1 output and logs for absence of the marker, while encrypted resume still works. Include approval resume and rerun/reused outputs.

## Medium findings

### M1 — Cross-origin redirects still forward some bodies and credential headers

**Status:** Fixed locally on `codex/sec-redaction-h4`: redirected method/body are computed first, all cross-origin body-retaining hops are refused, and permitted cross-origin hops drop every supplied header. Seven regressions failed on the old code; all eleven mocked redirect tests passed after the fix, preserving POST 307/308 refusal and same-origin behavior. CI/independent acceptance remains pending.

**Locations:** `src/server/egress.ts:138`, `src/server/egress.ts:189`, `src/server/egress.ts:194`, `src/server/egress.ts:196`, `worker/handlers.ts:142`, `src/integrations/http.ts:51`.

**Evidence/exploit:** `keepsBody` recognizes only 307/308, although PUT/PATCH preserve their bodies on 301/302. The credential-header denylist omits `x-goog-api-key` and other custom secret headers. A redirecting public endpoint can send a credential-bearing HTTP-node request to another public origin. A local synthetic PUT/302 probe received both the body marker and `x-goog-api-key`; Authorization was removed. This is credential forwarding, not a demonstrated private-address SSRF bypass. The AI hub and email/ZITADEL transports use zero redirects and are not exposed through this specific path.

**Recommended fix:** Compute the resulting method/body before deciding whether a cross-origin hop is safe, and refuse every cross-origin redirect retaining a body. Prefer an explicit credential/origin policy or reject cross-origin redirects for authenticated requests; an expanding header denylist alone cannot identify arbitrary secret headers.

**Test to add:** PUT/PATCH 301/302, GET with provider/custom credential headers, POST 307/308, same-origin redirects and redirect-to-private-host cases. Assert zero requests to the second origin when sensitive data would be forwarded. Extend the existing POST/307 regression rather than weakening it.

### M2 — Redaction fails open beyond depth 30

**Status:** Fixed locally on `codex/sec-redaction-h4`: depth overflow replaces the entire unexamined subtree with `[REDACTED_LIMIT]`. Depth 29–33 object/array and cyclic-input regressions failed on the old code (5 failures), then passed. CI/independent candidate acceptance remains pending.

**Locations:** `src/server/redact.ts:43`, `src/server/redact.ts:44`, `src/engine/expression.ts:85`, `worker/runner.ts:205`.

**Evidence/exploit:** At depth greater than 30, `redact` returns the original subtree unchanged. Value normalization limits serialized size, not JSON nesting. A provider-controlled or user-produced nested object can place a sensitive key/known credential beyond the cutoff, causing plaintext step storage and projection even when the correct secret list was passed. The 32-wrapper synthetic probe reproduced this independently of H4.

**Recommended fix:** Fail closed at traversal limits by replacing the subtree with a fixed marker or rejecting it before persistence. Consider an iterative traversal with explicit depth/node/byte budgets and cycle handling. Never return unexamined data from a redaction limit.

**Test to add:** Known credentials, password/token keys and arrays at depths 29–33, nested output under the value-size cap, and cyclic input. Every budget-exceeded case must remain secret-free.

### M3 — Multiline database error parameters can escape log scrubbing

**Status:** Fixed locally on `codex/sec-redaction-h4`: the shared scrubber omits the complete parameter tail, including LF/CRLF and nested causes. Three new regressions (including captured API logging) failed on the old code, then passed. Auth and worker use the same scrubber; no application server was started. CI/independent acceptance remains pending.

**Locations:** `src/server/redact.ts:20`, `src/server/redact.ts:24`, `src/server/http.ts:118`, `src/lib/auth.ts:93`, `worker/index.ts:39`.

**Evidence/exploit:** The `params:` scrubber uses `.*` without dot-all behavior. It removes only the first parameter line; subsequent lines and unshaped credentials survive. A synthetic `Failed query` error containing `params: first-value\n<marker>` reproduced the leak. Bound workflow text can contain newlines, and a later bound value can include a session token or generic credential. Application/auth/worker logging all use this helper. An actual failing database query was not induced.

**Recommended fix:** Log structured, allowlisted database error metadata rather than query/parameter strings. If text remains, remove the entire parameter tail, including multiline content and nested causes; do not rely on recognizing every credential shape. Keep useful bounded codes/correlation IDs.

**Test to add:** Multiline Drizzle errors with a generic session/credential marker after a newline and in nested causes, plus ordinary safe errors. Capture each logging entry point and assert no parameter marker survives.

### M4 — Unauthenticated JSON/auth parsing has no streaming request-size budget

**Locations:** `src/server/http.ts:56`, `src/app/api/email/route.ts:17`, `src/app/api/beta/check/route.ts:15`, `src/server/auth-dispatch.ts:168`, `src/server/auth-dispatch.ts:194`, `deploy/beta/Caddyfile:30`.

**Evidence/exploit:** Shared `parseBody` calls `req.json()` before validation. Public email/beta checks parse before their email/IP limits, and auth dispatch clones and buffers JSON/form callback bodies before downstream authentication/rate handling. The checked beta proxy has no request-body limit. Large/chunked requests can consume web memory and parsing time before rejection; cloning increases buffering. Small schema field limits do not cap the incoming byte stream. This was established by control flow; no resource-exhaustion attack was run.

**Recommended fix:** Add route-appropriate streaming byte caps before JSON/form parsing and cloning, including all auth paths. Apply a trusted-proxy IP admission limit before expensive parsing. Configure a compatible proxy ceiling and read timeout; retain the tighter existing platform/webhook limits and the larger explicit upload limit.

**Test to add:** Oversized public email/beta/social/callback requests with missing, false and chunked Content-Length; assert bounded reads and 413 before parsing/DB/provider work. Valid ordinary requests must still succeed.

### M5 — Upload/storage and knowledge parsing lack aggregate resource controls

**Locations:** `src/app/api/workspaces/[wid]/files/route.ts:25`, `src/app/api/workspaces/[wid]/files/route.ts:39`, `src/server/knowledge.ts:66`, `src/server/knowledge.ts:170`, `src/server/knowledge.ts:199`, `src/server/knowledge.ts:201`.

**Evidence/exploit:** Each upload is capped at 5 MB, but neither upload path reserves an aggregate workspace storage budget or applies a shared upload rate/concurrency limit. File bytes live in shared Postgres. Knowledge CSV/JSON parsing executes in the main worker and materializes all parsed rows/pieces before the 2,000-chunk limit is checked. An invited editor/owner can repeatedly upload valid files to fill shared storage or queue parser-heavy files that disproportionately stall the worker. A small CSV with many tiny rows can far exceed the chunk count while remaining under the byte cap. No disk-filling or stress test was run.

**Recommended fix:** Atomically reserve per-workspace and installation storage/source quotas and enforce distributed upload/queue limits. Stream/abort CSV parsing as soon as row/chunk limits are reached, cap JSON nesting/output expansion, and isolate all untrusted parsing behind worker memory/time budgets. Account for deleted-source retention and release reservations correctly.

**Test to add:** Concurrent uploads crossing a storage quota cannot overshoot it; one tenant's burst cannot starve another. CSV above the row limit and deeply nested JSON must stop with bounded CPU/memory before full materialization. Deletion/retry must not evade accounting.

### M6 — Missing or malformed beta mode silently opens registration

**Status:** Fixed locally on `codex/sec-redaction-h4`: only the two exact enum values are accepted; missing/invalid configuration defaults to `invite_only` and emits a configuration error without echoing environment values. Beta/production shared-gate and password/social create-hook regressions failed on the old code, then passed; custom SSO uses the same `allowSignUp` gate. Explicit development/test open mode and test-only cookie isolation remain covered. CI/independent acceptance remains pending.

**Locations:** `src/server/beta.ts:23`, `src/server/beta.ts:28`, `src/server/beta.ts:82`, `src/lib/auth.ts:81`, `deploy/beta/docker-compose.beta.yml:11`.

**Evidence/exploit:** Any mode other than the exact string `invite_only`, including an unset/typo value, becomes `open` even with `FLOWLINE_ENV=beta`. The deployment manifest fixes the environment to beta but does not itself require the invitation mode. If an operator omits/mistypes the setting, an external visitor can register without an invitation through the normal signup hook. Current deployed values were deliberately not read; this is a fail-open configuration finding.

**Recommended fix:** Validate the enum at startup and require the approved invitation policy for beta; reject invalid/missing settings rather than interpreting them as an authorized scope change. Keep explicit development/test open-mode support. Enforce the beta policy before public traffic is admitted, not solely in a post-launch verification script.

**Test to add:** Beta/production with absent, empty and misspelled mode fail closed for password, social and custom SSO signup; explicitly approved open development/test mode remains supported; test-mode cookie overrides never affect beta.

### M7 — Global ZITADEL account bindings omit issuer identity

**Status (2026-10-03): FIXED in source.** Account IDs now encode the validated `(issuer, subject)` pair. Bare legacy subjects fail closed and require explicit signed-in relinking; no issuer is guessed from current settings. Pending callbacks additionally fence issuer, setting revision and client ID. Unit and DB-adapter integration regressions added; real-provider validation remains outstanding.

**Locations:** `src/server/zitadel-auth.ts:18`, `src/server/zitadel-auth.ts:52`, `src/server/zitadel-config.ts:35`, `src/server/platform-setting-schemas.ts:39`, `src/server/sso.ts:292`.

**Evidence/exploit:** Global federation always persists provider ID `zitadel` and account ID equal to `sub`. Better-auth locates account owners by that pair, not issuer (`../FlowLine/node_modules/better-auth/dist/oauth2/link-account.mjs:80`). Environment attempt identity/cache keys include issuer/client identity, but persistent account bindings do not. Unlike the custom SSO namespace, replacing the trusted global issuer can therefore reuse an old subject-to-user mapping. A different/new issuer asserting the same subject can authenticate as the old user even when implicit email linking is disabled. This requires an operator/admin issuer migration or replacement; it is not a tenant-controlled configuration bypass. No actual ZITADEL subject collision was observed.

**Recommended fix:** Bind persistent federation identity to the validated issuer and provider subject, with an explicit migration policy for existing accounts. Refuse old-issuer links after a change until the account holder approves relinking. Separately fence pending DB-backed attempts against issuer-setting revisions as well as credential revisions.

**Test to add:** Issuers A and B return the same subject and verified email; a user linked under A must not receive a session under B merely because the operator changed settings. Test both environment and DB configuration, and callbacks pending during an issuer change.

### M8 — Failed billing event processing is acknowledged as successful delivery

**Status:** Fixed locally on `codex/sec-redaction-h4`: failed synchronous processing returns HTTP 503 with `received: false` and Retry-After, after the failed-event transaction commits. Signed cancellation/payment-failure regressions failed on the old route, then passed through recovery and successful duplicate delivery with one final audit/application. Existing DB integration assertions were strengthened but not run (owner prohibited servers/environment files). CI/independent acceptance remains pending.

**Locations:** `src/billing/service.ts:275`, `src/billing/service.ts:305`, `src/billing/service.ts:313`, `src/app/api/billing/webhook/route.ts:23`, `src/server/company-builder/entitlement.ts:31`.

**Evidence/exploit:** Same-timestamp event ambiguity triggers a provider canonical-state fetch. If that fails, the transaction records `outcome: "failed"`, but the webhook route still returns HTTP 200 with `received: true`. Failed events can be retried on redelivery, yet no automatic failed-event processing worker was found. A cancellation/payment-failure coinciding with a provider outage can leave a previously active entitlement in place until a manual reconciliation or another event. This is billing-state integrity/availability in the **sandbox** scope, not a demonstrated live-payment exploit.

**Recommended fix:** Persist a durable processing queue with bounded retries and acknowledge only after queueing, or return a retryable failure when synchronous application fails. Distinguish retryable transport failure from permanently invalid signed events. Preserve event idempotency, lock ordering and the failed-event retry carve-out, and alert on persistent failures.

**Test to add:** Signed same-timestamp cancellation/payment failure plus an unavailable canonical fetch. Assert retryable HTTP failure or a durable scheduled retry, recovery to canonical inactive state, one final application/audit, and normal 200 responses for successful duplicates. Official provider delivery guidance treats a successful response as acknowledgment: [Stripe webhooks](https://docs.stripe.com/webhooks), [Paddle delivery handling](https://developer.paddle.com/webhooks/about/respond-to-webhooks/).

### M9 — Release image selects end-of-life Node.js 25

**Locations:** `Dockerfile:8`, `Dockerfile:23`, `.github/actions/setup-gate/action.yml:22`, `package.json:7`.

**Evidence/exploit:** Both build and release runtime inherit `node:25-bookworm-slim`. The official release table lists Node.js 25 as EOL, while 22 and 24 remain LTS; EOL releases stop receiving security fixes. An application exposed to a subsequently disclosed runtime vulnerability can remain unpatched even if its npm audit is clean. CI uses Node.js 22, so a successful CI run also does not validate the release's selected major. This establishes an unsupported runtime choice, not a demonstrated reachable runtime exploit or the deployed image's exact bytes. [Node.js release status](https://nodejs.org/en/about/previous-releases), [Node.js EOL policy](https://nodejs.org/en/about/eol).

**Recommended fix:** Select a currently supported LTS release compatible with the pinned dependencies, align CI/build/runtime majors, and pin the reviewed image digest with a documented update process. `engines.node: >=22` permits EOL majors and should not be the only support-policy check.

**Test to add:** Assert the release/CI major is approved and supported; run build, auth, worker, migration and sandbox integration checks on that runtime. Record image digest, runtime version and OS/runtime vulnerability assessment for the actual beta candidate.

## Low findings

### L1 — Production dependency graph includes vulnerable esbuild 0.18.20

**Locations:** `pnpm-lock.yaml:2457`, `pnpm-lock.yaml:4167`, `pnpm-lock.yaml:5896`, `package.json:51`, `Dockerfile:27`.

**Evidence/exploit:** `pnpm audit --prod --json` reported **GHSA-67mh-4wv8-2f99**, rated Moderate/CVSS 5.3, through `better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`. The affected server's permissive CORS can let a malicious website read files/results from a running esbuild development server. No application use exposing that server was found, so the beta application impact is ranked Low. The release image copies the installed dependency tree, so development tooling in that graph is still relevant. [Maintainer advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).

**Recommended fix:** Upgrade/remove the vulnerable transitive tooling via a compatible, reviewed dependency change; esbuild's advisory identifies 0.25.0 as the patched version. Prune unnecessary runtime tooling where worker/migration requirements permit. Do not apply an untested major transitive override solely to silence the audit.

**Test to add:** Re-run production audit and verify the vulnerable version is absent; validate auth initialization, migrations, worker startup and a production build after the dependency change. Confirm no dev server becomes reachable from the beta surface.

### L2 — Container image inputs are mutable tags rather than immutable digests

**Locations:** `Dockerfile:8`, `src/server/code-sandbox.ts:12`, `.github/actions/setup-gate/action.yml:42`, `.github/actions/setup-gate/action.yml:66`, `deploy/beta/docker-compose.beta.yml:24`, `deploy/beta/docker-compose.beta.yml:39`.

**Evidence/exploit:** GitHub actions are SHA-pinned, but build, sandbox, CI database and beta infrastructure images use mutable tags. Re-running a nominally identical build can select different image bytes without a source revision change. A registry/tag compromise or unexpected upstream change alters reviewed inputs. No compromised image was observed.

**Recommended fix:** Pin approved image digests, update them through a reviewed process, and record resolved digests with the release evidence. Keep timely security updates rather than permanently freezing an old image.

**Test to add:** Static enforcement of digest pins for release/security-sensitive image inputs, with an explicit update mechanism; deployment evidence must show the approved resolved digests.

### L3 — PDF/expression process isolation inherits worker authority

**Locations:** `src/engine/sandbox.ts:17`, `src/engine/sandbox-child.mjs:52`, `src/engine/sandbox-child.mjs:55`, `deploy/beta/docker-compose.beta.yml:10`.

**Evidence/exploit:** The JSONata/PDF child is a forked process with heap and wall-clock limits, but no explicit cleaned environment, filesystem restriction, network denial or separate OS identity. It inherits the worker's environment and permissions. Thus a future parser/evaluator code-execution flaw would have access to worker secrets/files/network. This is defense-in-depth: **no current parser RCE or JSONata escape was established**, and user JavaScript code uses the distinct Docker sandbox below.

**Recommended fix:** Run untrusted parsing/evaluation with a minimal environment, restricted filesystem and no network in a dedicated low-authority container/process boundary, while retaining input/output/page/time/memory limits. Avoid a direct shared Docker-daemon socket as the isolation solution.

**Test to add:** A confinement fixture verifies that synthetic worker environment markers, files and loopback network endpoints are inaccessible, with timeout/heap-limit and valid PDF/JSONata behavior preserved.

## Verified OK

“Verified OK” means the stated control was found in this revision, with local synthetic execution only where explicitly mentioned. It does **not** mean deployed configuration, a live provider, a Docker daemon or the complete application passed acceptance tests. Findings above qualify any broader guarantee.

| Area | Verified control and source | Boundary/qualification |
| --- | --- | --- |
| Tenant access and 404s | `src/server/access.ts:58` joins user/workspace membership before returning the workspace; `:80`, `:94`, `:114`, `:125`, `:137`, `:148` apply resource membership/capabilities and conceal non-members with 404. Workspace layout uses `requireWorkspaceBySlug` at `src/app/w/[slug]/layout.tsx:15`. | No ordinary cookie-route cross-tenant return was found. This was source review, not an executed tenant matrix. |
| API route coverage | Tenant CRUD/run/agent/approval/AI/knowledge/billing/OAuth-app routes resolve a user plus the appropriate access helper; Company Builder dispatch centralizes checks at `src/server/company-builder/api.ts:231` and `:243`. | Public auth/health/callbacks/webhooks intentionally use different guards; route classes are listed below. |
| API keys | `src/server/apikeys.ts:40`, `:88`, `:108` use random hashed keys, expiry/revocation/scopes and current creator membership/capability. v1 queries/checks tie resources to the key workspace, e.g. `src/app/api/v1/flows/[fid]/runs/route.ts:25`, `src/app/api/v1/runs/[rid]/route.ts:15`. | v1 implements workspace authorization outside `access.ts` rather than literally using its principal helpers. No bypass was found, but centralize this policy to meet the project rule and prevent divergence. |
| Membership/invites | `src/server/members.ts:37`, `:99`, `:104` use random hashed invitation tokens, locked single-use expiry/revocation checks and matching account email; role mutations protect last-owner state. | H2 limits confidence in the email identity furnished by custom SSO; possession of an invitation alone is not otherwise treated as account identity. |
| Password sessions/recovery | `src/lib/auth.ts:38`, `:43`, `:61` set password limits, required email verification, seven-day DB sessions and daily renewal. `src/server/email/flows.ts:125`, `:178`, `:179` atomically consume hashed reset tokens, create/update hashed local passwords and revoke existing sessions. | Local MFA on password login is provided by better-auth; federation gaps are H1–H3. Recovery does not currently revoke SSO links, relevant to H2. |
| Platform authorization | `src/server/platform-access.ts:60` rechecks active administrator status, verified email, TOTP enrollment, 24-hour age and rejects bearer/API-key requests. `src/server/platform-http.ts:74` enforces step-up for mutations. | Enrollment is not session MFA assurance (H3); no write-step-up bypass established. Workspace ownership/beta allowlist does not grant platform administration. |
| TOTP elevation/bootstrap | `src/server/platform-access.ts:95`, `:165` bind short elevation to the exact session and atomically consume a monotonic TOTP step; rate limits constrain attempts. `src/server/platform-setup.ts:42`, `:62`, `:146` use an operator-issued hashed, email-bound, expiring one-use bootstrap challenge and atomic admin creation. | No live enrollment or setup redemption attempted. |
| Mutation CSRF | `src/server/http.ts:77` checks origin/fetch metadata for unsafe cookie requests. `src/server/platform-http.ts:36`, `:41`, `:76` add exact configured Origin, session-HMAC CSRF header, JSON and 16 KB streamed cap. `src/server/platform-setup-http.ts:18`, `:30` use exact Origin and 8 KB cap. | Cookie-less signed webhooks/bearer calls have separate authentication. State-changing SSO linking through GET is H1. |
| Connection OAuth | `src/server/connections.ts:433`, `:439`, `:501`, `:509`, `:527` use PKCE where supported, hashed state, encrypted verifier, user/session binding, expiry/single-use locking and callback access rechecks. Credential refresh/storage rechecks revocation and app identity under locks/CAS. | No real provider callback/rotation race was executed. |
| ZITADEL OIDC validation | `src/server/zitadel-auth.ts:23`, `:26`, `:32`, `:43`, `:48`, `:51` require verified ID token, PKCE, credentialed zero-redirect exchanges and matching userinfo/ID-token subject with verified email. Generic-OAuth/callback source in the sibling 1.7.6 installation contains JWKS issuer/audience/nonce verification and fails closed when metadata is unusable. | Secondary dependency inspection, not live ZITADEL proof; persistent issuer binding is M7. |
| Auth dispatch fencing | `src/server/auth-dispatch.ts:105`, `:115`, `:190`, `:202` fence callbacks by stored app identity/revision/expiry, refuse form social/link requests and caller-supplied ZITADEL ID tokens, and set sensitive callback no-store/no-referrer. `src/server/zitadel-env.ts:28` suppresses DB fallback for partial/invalid environment configuration. | M7 calls out issuer migration/persistent identity; body buffering is M4. Intentional Google/GitHub implicit-link policy at `src/lib/auth.ts:60` was reviewed and not represented as universally disabled. |
| Custom OIDC cryptography | `src/server/sso.ts:258`, `:321` generate state/nonce/S256 PKCE, encrypt verifier and consume state once under lock. `src/server/oidc.ts:107`, `:123`, `:127`, `:132`, `:134`, `:137` enforce RS256 signature, issuer/audience, expiry, nonce and verified-domain email claims. `src/server/sso.ts:292` namespaces established links by workspace/issuer/client. | Correct token verification cannot establish mailbox ownership or linking consent for an attacker-controlled IdP (H1/H2), or enforce local MFA (H3). |
| Encryption at rest | `src/server/crypto.ts:58`, `:165`, `:195`, `:268`, `:334` implement AES-256-GCM envelope encryption, random data keys/nonces, context/revision binding, strict envelope parsing, separate platform/workspace rings and explicit legacy gating. Eight synthetic assertions passed as described above. | Actual key entropy/storage/rotation and deployed DB envelopes were not inspected. |
| Platform secret handling | `src/server/platform-secrets.ts:87`, `:149`, `:247`, `:356` expose whitelisted metadata/hints, use revision-CAS/encryption and audited revocation, and decrypt only for purpose services. `src/server/platform-http.ts:86` strips submitted values from secret-validation responses. `src/ai/hub/credentials.ts:39` rejects revoked/unreadable keys with bounded errors. | No plaintext/ciphertext platform-secret projection was found. This does not negate run-output/log redaction findings. |
| Social tokens | `src/server/auth-token-adapter.ts:43`, `:52` wrap new OAuth token writes with row/user/provider/field-bound encryption and turn failed envelope authentication into null. | Legacy plaintext remains accepted by `:59`; migration completion and backup contents were not verified. Require metadata-only rewrap evidence before claiming all historical tokens encrypted. |
| Workflow webhooks | `src/server/publish.ts:184`, `:193` authenticate raw bodies with constant-time HMAC; custom signatures bind timestamp/event ID/body and enforce freshness. `src/app/api/hooks/[token]/route.ts:31`, `:84`, `:90`, `:109`, `:118` cap bodies, deduplicate transactionally, reject conflicting payloads and atomically enqueue. `src/db/schema.ts:459` makes GitHub signatures unique per endpoint to prevent replay under another unsigned delivery ID. | GitHub does not sign timestamps; signature dedupe supplies that replay control. No provider delivery was sent. |
| HTTP SSRF | `src/server/egress.ts:79`, `:108`, `:122`, `:188`, `:207` reject URL credentials/unsafe schemes/private and metadata addresses, validate all DNS answers at socket lookup, recheck redirect destinations and cap/time out responses. Thirteen policy assertions and POST/307 refusal passed. | Public HTTPS is generally allowed for HTTP nodes; the exact host:port list grants exceptions to private/plain-HTTP restrictions, rather than restricting all public destinations. Deployed exception entries were not read; M1 qualifies redirect secrecy. |
| AI egress | `src/ai/hub/transport.ts:41`, `:95`, `:150`, `:162` validate anchored provider settings, exact registry HTTPS hosts, reject IP/custom endpoints and follow zero redirects. Keys are headers, not query strings. Test override is ignored outside `FLOWLINE_ENV=test` (`:23`). | No real AI endpoint/key was exercised. |
| Database-node egress | `src/integrations/providers/postgres.ts:29`, `:44`, `:53` connect to the validated IP through explicit fields and enforce server-side read-only query sessions/time limits. | No database connection/query was attempted. |
| JavaScript code sandbox | `src/server/code-sandbox.ts:42`, `:47`–`:61`, `:68`, `:73`, `:78` fail closed without Docker/image and run with no network, read-only root, bounded tmpfs, 128 MB memory/swap, 0.5 CPU, 64 PIDs, dropped capabilities, no-new-privileges, UID/GID 65534, cleaned CLI environment, timeout/forced removal and bounded output. No host volumes/secrets are passed; input/code use stdin. | Confinement not run. The shipped Dockerfile/worker compose configuration does not supply Docker CLI/daemon access; verify honest unavailable behavior or an approved executor design. Never infer sandbox readiness from source flags alone. Image reproducibility is L2. |
| Upload/retrieval isolation | `src/app/api/workspaces/[wid]/knowledge/route.ts:20`, `:23`, `src/app/api/workspaces/[wid]/files/route.ts:27`, `:29` check capability before capped multipart parsing. Knowledge accepts a restricted type set; PDF magic is checked. `src/server/knowledge.ts:86`, `:251` scope sources/chunks to workspace, deletion/readiness and current generation. Bytes use DB objects, not user-derived filesystem paths. | Per-file cap does not solve aggregate/parser limits (M5); PDF fork authority is L3. MIME/content validation is not malware certification. |
| Rate limits/budgets | `src/server/rate-limit.ts:14` uses shared PostgreSQL sliding counters/advisory locking. Email/IP limits at `src/server/email/flows.ts:33` are atomic; platform writes/TOTP/bootstrap and manual/API/agent starts have bounded limits. `src/server/runs.ts:172` checks execution quotas. Beta Caddy overwrites `X-Real-IP` (`deploy/beta/Caddyfile:33`). | Better-auth limits are configured but process-local by default; this is not certification of multi-instance brute-force protection. Limits do not precede all parsing (M4) or cover uploads (M5). |
| Sandbox billing authenticity | `src/billing/stripe.ts:45`, `:143`, `src/billing/paddle.ts:64`, `:179`, `src/billing/service.ts:47` reject inappropriate live keys/mode, authenticate raw signatures with constant-time comparison and ±300 s freshness. `src/billing/service.ts:269`, `:288`, `:293` deduplicate event IDs, bind provider customers to locked local accounts and ignore stale events. | No live payments/provider verification; M8 concerns failed processing acknowledgment. Sandbox event handling does not establish production billing readiness. |
| Test-only facilities/email | `src/server/faults.ts:15` and `/api/test/*` guards require exact test environment. Beta proxy blocks test/debug/ops paths (`deploy/beta/Caddyfile:6`). `src/server/email/index.ts:36` rejects outbox outside test/staging in production builds; provider overrides require test mode and credentialed email follows zero redirects (`:71`). | Actual environment values not read. The outbox check also depends on NODE_ENV=production; the release Dockerfile sets that explicitly. |
| Logging/build hygiene | `src/server/telemetry.ts:21` allowlists scalar property keys; unhandled API responses are generic. `deploy/beta/Caddyfile:23`, `:42` protect/redact sensitive callback/bearer URLs. `.dockerignore:5` excludes `.env`/`.env.*` from build context; Docker runtime uses non-root user (`Dockerfile:34`). | H4/M2/M3 prevent any blanket “no secrets in logs/projections” assertion. No environment/build image was inspected. |
| GitHub Actions privilege | The sole workflow uses `pull_request`, push-to-main and dispatch, with `contents: read` (`.github/workflows/gate.yml:3`, `:16`). No `pull_request_target`, secret references, privileged deploy job or write permission was found. Checkouts use `persist-credentials: false`; jobs use hosted runners and timeouts. | Reviewed workflow source, not repository/org settings or an actual run. PR code still executes as intended in its isolated test runner. |
| GitHub Actions supply chain/secrets | All external `uses:` entries are full 40-hex commit pins across gate/setup/report. Setup uses frozen lockfile, disposable generated/masked test credentials and no production secrets (`.github/actions/setup-gate/action.yml:52`, `:75`). Report upload lists test artifacts and 14-day retention (`.github/actions/gate-report/action.yml:54`). | Mutable Docker images are L2. GitHub log masking does not scrub uploaded artifact bytes; generated reports/screenshots should receive a final secret scan. No credential or live artifact content was read here. |

## Route authorization inventory and acceptance follow-up

The 109 route files were classified by their actual entry guards, including checks delegated to services. The catch-all Company Builder route adds several logical endpoints beyond that file count.

| Route class | Entry policy inspected |
| --- | --- |
| `/api/workspaces` and `/api/me`, `/api/onboarding` | Current authenticated user; workspace list/user settings scoped to that user; workspace creation establishes ownership. |
| `/api/workspaces/[wid]/**` | User plus workspace membership/capability; resource IDs additionally scoped in downstream services/queries. Includes flows, members, invites, runs, approvals, audit, usage, files, knowledge, AI, integrations, OAuth apps, SSO, billing and Company Builder. SSO PUT delegates to `saveSsoConfig`'s `sso.manage` check. |
| `/api/flows/[fid]/**`, `/api/runs/[rid]/**`, `/api/connections/[cid]` | `requireFlow`/`requireRun`/`requireConnection` with capabilities; version/share/proposal identifiers checked against the authorized parent. Sharing checks source and target workspace capabilities. |
| `/api/agents/[aid]/**`, `/api/agent-runs/[rid]/**`, `/api/approvals/[aid]/decide` | Resource access helpers and explicit edit/run/decision capability. |
| `/api/v1/**` | Bearer API-key authentication, scope and current creator authority; resource workspace predicate/comparison; non-matching resources return 404. |
| `/api/platform/**` excluding setup | Platform read/write wrappers; step-up endpoint intentionally skips prior elevation so it can perform TOTP, while retaining admin/CSRF/origin/rate checks. |
| `/api/platform/setup/**` | Operator bootstrap challenge/session; exact-origin capped mutation helpers; identity verification and TOTP at completion; no public general admin grant. |
| `/api/oauth/start`, `/api/oauth/callback` | Authenticated session, integration management and same-user/session pending-state completion; membership rechecked at callback. |
| `/api/sso/start`, `/api/sso/callback` | Public federation state/browser/token controls; linking and new-global-identity issues H1–H3 apply. |
| `/api/invites/[token]` | Authenticated user and a valid unexpired bearer invitation; matching email on acceptance. |
| `/api/auth/[...all]`, `/api/auth-config`, `/api/beta/check`, `/api/email` | Public authentication/availability/signup advisory/recovery, with better-auth or purpose-token controls rather than tenant membership. Email deletion requires current user and matching deletion token. M4/M6 apply. |
| `/api/hooks/[token]`, `/api/billing/webhook` | Raw-body signature authentication, streamed cap and transactional dedupe; no cookie membership requirement. |
| `/api/identity/zitadel/{discovery,jwks}` | Public non-secret OIDC metadata proxy, validated configured metadata/guarded fetches; no platform credential projection. |
| `/api/integrations/catalog`, `/api/ai/providers` | Signed-in user; optional workspace catalog context requires membership. |
| `/api/health`, `/api/ops/status`, `/api/test/{beta,faults,outbox}` | Public bounded health; ops constant-time configured bearer check and proxy block; test endpoints require exact test environment and are proxy-blocked. |

Before acceptance, use two unrelated tenants, viewer/editor/owner principals and revoked/expired sessions/keys to exercise every route method and nested identifier substitution. Verify 404 and no returned tenant data, callback-session revocation, admin read assurance/write elevation, and concurrency/replay cases recommended in the findings. Fixes require their own implementation scope and the appropriate CI tier on the actual candidate. Real provider and Docker tests remain separate evidence requirements; neither this documentation commit nor historical gates certify them.
