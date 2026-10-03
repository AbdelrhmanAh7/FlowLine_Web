# Invite-only paid pilot — product acceptance draft

Owner review draft, 2026-10-03. Candidate base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. This is a general workflow platform pilot for 3–5 customers. No price, invitation, live payment, deployment or advertised provider is approved by this document. Current verdict: **NOT READY** until every required row below has current evidence or the owner narrows the advertised offer explicitly.

## One proposed subscription

Sell one monthly **Pilot / التجربة المدفوعة** subscription, for one customer workspace. Proposed limits: **1,000 workflow and agent executions per UTC calendar month, 2 concurrent runs**. These numbers are a proposal, not installed entitlements. The owner must set a price/currency, support hours, start/end dates and verified sandbox provider price before approval. Do not advertise an unconfigured price or unlimited usage.

Use the existing `billing.plans` platform setting and existing payment adapter, not a new billing system. Configure one paid plan with `id: pilot`, its sandbox `providerPriceId`, owner-approved `displayPrice`, and `entitlements: { maxMonthlyExecutions: 1000, monthlyUsageCapMicros: null, maxConcurrentRuns: 2 }`. The required technical free/inactive fallback is not a second subscription offer: propose 25 local sample executions/month and 1 concurrent run, with the owner deciding its final allowance. Do not install these values before approval.

Each accepted workflow or agent run records one execution at enqueue, including later failure or cancellation. Deduplicated requests and recovery of that same run do not add executions; a deliberately new rerun does. The stricter workspace or plan limit applies. Calendar-month metering is not the subscription anniversary. Provider calls and retries can have their own usage events and provider charges.

**BYOK / مفاتيحك الخاصة:** the customer supplies supported API keys through Settings → AI Providers (`/w/<slug>/settings?tab=ai`) or the integration connection UI. Provider charges are separate from the Flowline subscription. Configured ledger prices are not a provider invoice; unpriced calls can understate costs, and a workspace cap cannot guarantee the provider's final bill. Customers set provider-side budgets and alerts. No individual Claude/Codex membership is sold as an API entitlement. Real-account provider validation and supported authorization remain required before listing any provider in the pilot offer.

## Five existing templates to include

All five already exist, use deterministic local nodes, have editable synthetic inputs and store results without contacting external services. They retain translated stable IDs and node labels. Existing `tests/unit/local-scenarios.test.ts` exercises default, alternate and empty inputs plus relevant boundaries; this round's evidence records the focused rerun. Selection does not imply that connected SaaS templates are verified.

| Template ID | English / العربية | Acceptance result |
| --- | --- | --- |
| `low-stock-list` | Low Stock List / قائمة المخزون المنخفض | Lists only products at or below reorder level; orders nothing |
| `quote-calculator` | Quote Calculator / حاسبة عرض السعر | Computes configured line amounts and rounding; sends no quote |
| `expense-category-summary` | Expense Category Summary / ملخص فئات المصروفات | Groups sample expenses; performs no payment |
| `weekly-task-plan` | Weekly Task Plan / خطة المهام الأسبوعية | Produces a plan from supplied dates; creates no calendar event |
| `support-backlog-summary` | Support Backlog Summary / ملخص طلبات الدعم المتراكمة | Summarizes sample tickets; sends no notification |

## First customer session

1. Owner approves the exact customer/workspace invitation separately; the customer registers and verifies email through the real endpoint.
2. Customer uses the existing workspace → goal → first flow onboarding. Begin with one of the five local templates; use synthetic input and no provider key.
3. Save an edited sample, reload to verify persistence, run it, open the inspector and compare the actual result with the expected result. Repeat once in Arabic and once in English.
4. Demonstrate an invalid configuration, its error and repair. Explain that Run again starts a new execution. For an uncertain external result, inspect the provider before authorizing any retry; do not repeatedly click Run.
5. Only after a specific provider is independently verified, connect the customer account privately, restrict connection permissions, check provider budgets, and test a bounded action with required approval. Enable automated triggers only after published-version and dedupe tests pass.
6. Walk through the displayed plan limits and separate provider charges, the support procedure and owner-approved policies. Capture explicit customer acceptance of the workflow's actual result.

Arabic onboarding summary: ابدأ بقالب محلي وبيانات تجريبية، واحفظ التغييرات ثم أعد تحميل الصفحة وشغّل القالب وافحص النتيجة. لا تربط حساب مزود قبل التحقق منه. راجع حدود الخطة ورسوم المزود المنفصلة، ولا تكرر إجراءً خارجيًا كانت نتيجته غير مؤكدة قبل فحصه لدى المزود.

## Required acceptance ledger

The owner/lead records evidence links, exact candidate SHA and date beside each row. Local tests, CI, real-provider verification and human UAT are separate evidence classes. A later documentation-only green CI run does not clear an unresolved flaky transport failure.

| Required check | Current bounded evidence / remaining action |
| --- | --- |
| Create, save, reload, manual run, results and repair in EN/AR | Existing integration/E2E coverage; candidate CI and customer session still required |
| Automated publish, schedule, signed webhook and duplicate event handling | Existing trigger tests; final candidate CI and bounded real source required |
| Safe recovery and rerun metering | This candidate binds a rerun retry to one request; focused tests verify one run and execution event. Existing uncertain-action review remains required; this does not make deliberate reruns safe for external effects |
| Consequential drafts reserve the decision for the owner | EN/AR note fixed; focused engine/fixture result is separate from a fresh API/worker field run and actual owner review |
| Five templates, both languages, default/alternate/empty cases | Existing local scenario suite, fresh focused result recorded this round; browser UAT still required |
| One plan and enforceable limits | Configuration mechanism exists; proposed limits and price need owner approval and installation |
| Checkout, renewal, cancellation, payment decline, duplicate/stale webhooks | Local fake-provider adapter/service tests are useful preparation; **real sandbox account journeys remain BLOCKED** |
| Every advertised integration and AI provider | **BLOCKED** on dedicated accounts, privately entered credentials, verified no-cost allowance and consent; mock contracts do not qualify |
| Invite-only signup, recovery, membership isolation and protected credentials | Security lane/current candidate evidence required; owner identity/MFA remains separate |
| Exact artifact deployment, alerts, off-device backup restore and rollback | Infra lane preparation and owner authorization required; local image/DB proof is insufficient |
| Customer support and policies | [Support draft](PAID_PILOT_SUPPORT_DRAFT.md) and [policy draft](PAID_PILOT_POLICIES_DRAFT.md) require owner-approved contact/hours/terms before sale |
| 3–5 customer UAT and invitation approvals | **BLOCKED** until the preceding offer/readiness checks pass and the owner approves named recipients |

Stop acceptance when an external action could have occurred twice, an invoice/meter differs from promised limits, isolation fails, secret material appears, an unresolved flaky test remains, or customer-facing copy implies a verification that was not performed. Preserve the failure evidence; repair and rerun the affected check on the final candidate.
