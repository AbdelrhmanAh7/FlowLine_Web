# Chrome exploratory QA report

Agent-driven exploratory testing, not human UAT. **TEST DOUBLES ONLY — no live cloud verification.**

## Result

**9 PASS / 2 FAIL / 0 BLOCKED. Findings: P0 0, P1 0, P2 2, P3 2.**

All 11 journeys were exercised. The two FAIL results concern incorrect cost-unit labels in the run inspector (CXQ-02); execution and stored accounting succeeded. Cross-cutting Arabic and phone presentation defects are detailed in BUGS.md. This is not an acceptance claim for untested integrations or live providers.

## Environment and revision

- Date: 2026-09-29, approximately 11:35–12:06 Africa/Cairo (UTC+3).
- Target: http://localhost:3100; health checked before browser work and at completion: revision dev, schemaVersion 20, database ok, worker ok.
- Actual worktree HEAD throughout: **8c4f3114d89300f7bfa1552e17e9207d68df2001**. Requested candidate: 756d69c. Git diff from 756d69c to HEAD contains only gate artifacts; product code is identical. The dev health endpoint does not attest the running source SHA, so source identity is based on the worktree and comparison, not an immutable server build stamp.
- **Google Chrome 153.0.8010.54**, verified by executable version and CDP Browser.getVersion. Playwright channel chrome with explicit installed executable C:/Program Files/Google/Chrome/Application/chrome.exe. No Chromium substitution.
- OpenAI-compatible and Anthropic native-protocol fakes on :4011; SaaS doubles on :4010. The AI Providers test-double notice was visible in both languages.
- Accounts used UI signup, UI email confirmation via the permitted test outbox, and UI sign-in. Credentials, setup code, invitation token and TOTP secret stayed in memory. Password/API-key fields were masked in screenshots; no traces, HAR, videos or storage-state files were created.

## Journeys

| # | Journey | Result | Observed result and evidence |
|---|---|---|---|
| 1 | Connect, discover, search, confidentiality | PASS | Arabic OpenAI name/key/check-and-save returned five models and a masked hint; Anthropic also connected. Search filtered the model list. DOM, API response bodies, URLs, localStorage, sessionStorage and actual IndexedDB records were scanned for full canaries: no matches (one IndexedDB store). 02-connect-en.txt, 24-model-search screenshot, key-request-checks.json. Arabic catalog defect CXQ-01 remains. |
| 2 | Two workflows, two models | **FAIL** | UI-built OpenAI fake-gpt-large run #2 and Anthropic fake-claude run #3 succeeded, with actual step outputs and distinct protocols. Token counts and estimated costs were present. However the inspector converts micros to currency while retaining the label costMicros, so cost units are incorrect (CXQ-02). 04-openai-inspector.txt, 05-anthropic-inspector.txt, run-evidence.json. |
| 3 | Agent with ASK tool | PASS | Agent pinned fake-gpt-large and an ASK published-workflow tool. It paused before dispatch; owner approved; workflow run count increased exactly 2 to 3 and the answer contained the tool output. Persisted run remains accessible from the agent Runs tab. 06-agent-ask.txt, 07-agent-approved.txt, controls-and-checks.json, agent-usage.json. |
| 4 | Copilot | PASS | Requested Monday KPI workflow; reviewed proposal, setup warnings and five-node/four-edge diff; approved draft creation. Read-only verification: publishedVersionId null and zero workflow runs. Wording says experimental, review every change, nothing runs; it does not claim semantic correctness. 08-copilot-preview.txt, 09-copilot-draft.txt, controls-and-checks.json. |
| 5 | Invalid key | PASS | Explicit fake 401 injection. Run #5 failed with OpenAI rejected the API key (401), directing rotation. Exactly one fake request, using only the original key hash; no fallback or success. 10-invalid-key.txt, key-request-checks.json. |
| 6 | Rotation / revocation | PASS | Affected-items preview listed workspace default, pinned/published workflow, draft using default, agent and Copilot before replacement. Run #6 succeeded with the replacement key hash. Disconnect preview shown; run #10 then failed clearly with connection disconnected. 11-rotation-impact.txt, 12-rotated-run.txt, 17-disconnect-impact.txt, 18-disconnected-run.txt. |
| 7 | Allowed fallback | PASS | Saved FALLBACK with Anthropic as the explicit second connection. One 500 retried successfully on primary (#7). Three further 500s exhausted retries; #8 used Anthropic fake-claude, with policy FALLBACK and routeReason fallback #1 after AI_PROVIDER_ERROR. Origin-detail rendering is defective (CXQ-03), but selected route and reason are readable. 13-fallback-policy.txt, 14-retry-inspector.txt, 15-fallback-used.txt, run-evidence.json. |
| 8 | FREE_ONLY | PASS | Paid routes refused before dispatch, with explicit nonzero-price reasons and Nothing was sent. Fake request count remained 42 before/after run #9. 16-free-only-refusal.txt, controls-and-checks.json. |
| 9 | Workspace isolation and use rights | PASS | Before invitation acceptance, second-workspace owner saw no first-workspace connections; connection/model GETs returned 404. After accepting an editor invitation, the same account saw no usable models and an explicit permission message in the existing Anthropic workflow picker. No forged mutation calls were made. 20-outsider-empty.txt, 22-editor-denied.txt, controls-and-checks.json. |
| 10 | Usage history / consistency | **FAIL** | Durable aggregate tokens and costs reconcile arithmetically with configured prices; values appear in settings and inspector. Inspector unit label is wrong (CXQ-02), preventing a clean presentation-consistency pass. Phone columns also have no separation (CXQ-04). 19-usage.txt, usage-sanitized.json, run-evidence.json, agent-usage.json. |
| 11 | Platform admin credentials | PASS | Authorized bootstrap CLI needed --grant because first-admin setup was already complete. Redeemed code in /admin/setup, enrolled TOTP using e2e/tools/totp.ts, completed setup, stepped up and saved GitHub integration credential. Reload showed Configured — not verified and only a masked suffix. Secret scans passed. Test credential revoked afterward. Non-admin /admin returned 404. 21-non-admin-404.txt, 23-admin-write-only.txt, controls-and-checks.json, key-request-checks.json. |

## Accounting evidence

Prices were deliberately configured through Usage & limits for the doubles: OpenAI 2 input / 8 output USD per million tokens; Anthropic 3 / 9. These are illustrative workspace estimates, not provider invoices or verified list prices.

| Provider/model | Events | Input tokens | Output tokens | Stored micros | Settings display |
|---|---:|---:|---:|---:|---|
| openai/fake-gpt-large | 7 | 5171 | 425 | 13742 | USD 0.0137 |
| anthropic/fake-claude | 2 | 406 | 32 | 1506 | USD 0.0015 |

Totals: 9 AI events, 6034 tokens, 15248 micros = USD 0.015248. The configured-price arithmetic matches both aggregates exactly. Anthropic runs #3 and #8 contribute 813 + 693 = 1506 micros. Four OpenAI workflow calls contribute 1916 micros; two agent model calls contribute 1836 micros. The remaining 9990 micros belong to the one remaining OpenAI event by subtraction (the Copilot proposal); this residual is an inference, not an independently exposed per-proposal ledger record. Non-AI execution/agent-step rows remain flagged unpriced. Inspector run #8 displays costMicros 0.000693 although its API stores 693: CXQ-02.

## Coverage

- Arabic default/RTL signup, verification and connection flow. English functional workflow, agent, Copilot, fault, rotation, isolation and admin journeys.
- **1440, 1024 and 375 CSS pixels in both Arabic and English**, height 900 for layout captures (initial desktop journey height 1000).
- All six combinations covered AI settings, provider cards, connection dialog, canvas/node drawer, agent Runs, run inspector, usage and platform admin. Copilot opens at desktop/tablet widths; at 375 it is honestly disabled with the phone-editing explanation. Phone canvas likewise states editing is disabled; viewing/running remain available.
- 42 core viewport measurements in coverage.json and additional usage/Copilot screenshots. No document-level horizontal overflow in measured surfaces. This does not imply no internal clipping: CXQ-04 records phone table crowding.
- Screenshots under screenshots/layout-{ar|en}-{width}-*.png. Final core screenshots disable animation only while capturing, to avoid recording transition opacity. API key inputs are solid-masked, including empty fields.
- UI clicks, typing, selections, scrolling, node addition, mouse edge connections, publish, run, approve, invite, disconnect and credential changes were exercised. All product mutations were through UI, except the explicitly authorized operator bootstrap. Direct application API requests were read-only. No API-seeded workflows or accounts.
- Scope limits: no live provider calls; no other AI providers beyond OpenAI/Anthropic; no real payment; no provider invoice reconciliation; no forged cross-tenant write request (forbidden by brief); no assertion that every journey was repeated end-to-end at every viewport. Responsive checks complement the full desktop journeys.

## Test controls and operator operations

- GET /api/test/outbox for the two QA identities, followed by opening links and confirming through the UI.
- POST :4011/__fake/openai/fault: 401 times=1; 500 times=1; 500 times=3. The latter exhausted the primary retry budget to reach fallback. No timeout/429/hub faults were used.
- GET :4011/__fake/openai/requests for key-hash comparisons, retry sequence and no-dispatch verification. Evidence retains only safe booleans/counts, not key values.
- Operator command: node scripts/with-env.mjs .env.test npx tsx scripts/admin/bootstrap.mts --email <QA owner>; first-admin path rejected as already initialized; repeated with --grant. Output was captured in memory only. TOTP generated with the repository helper; step-up used a fresh adjacent time-step code accepted by the authenticator window.

## Console / network inventory

See browser-events.json for sanitized exact messages.

- 0 page exceptions, 0 console warnings, 5 console-error messages: four generic resource-404 messages and one React hydration-attribute mismatch.
- Browser response listener captured 3 HTTP 404s: /admin for the non-admin (expected); owner workflow URL immediately after clicking Accept invitation before its async completion (tester navigation race; subsequent normal visit succeeded); /api/platform/setup around setup lifecycle (setup completed successfully).
- Two additional intentional read-only isolation probes returned 404: first workspace ai/connections and ai/models. APIRequestContext calls are documented separately because they do not traverse the page response listener.
- One generic 404 console message has no uniquely matched recorded page response; do not invent an endpoint for it.
- Hydration warning occurred on /sign-in and named extra wfd-id attributes on email/password/SSO inputs. No user-visible auth failure resulted. This is consistent with external form instrumentation, but origin was not proved; it is an unattributed environment warning, not a confirmed product defect.
- No browser-observed HTTP 5xx. Injected provider 401/500 responses occurred between worker/server and fake, and appear as run failures/retry metadata rather than browser network failures.
- An initial driver timeout closed the first Chrome session; a new sequential session completed testing. Locator/case/timing retries are test-driver adjustments, not product failures.

## Constraint audit and remaining state

No product-code edits, commits, server/container starts, stops or rebuilds. Authored files are confined to this artifact folder. The existing modified artifacts/ai-hub/gate-e1a479b/stack-after-restart.log was present before work and grew as the already-running server logged requests; it was not edited by the tester. HEAD remained unchanged.

QA records are retained in the test database: owner/admin account, outsider/editor account, QA workspaces, two AI workflows, one Copilot draft, an agent and its runs. OpenAI is disconnected; Anthropic remains owner-only; routing is MANUAL with the disconnected default visibly flagged. The platform GitHub test credential was revoked after testing. No cleanup outside the permitted artifact directory was performed.

Final files were scanned for all generated secret canaries; none were found. Existing BRIEF.md is input, not generated evidence. Screenshots never include the setup code or TOTP secret.
