# Flowline Phase 3 — focused Codex browser retest 2

**Test type:** independent agent-driven exploratory browser test, not human UAT. Tested 2026-09-28 against staging `http://localhost:3200`. The read-only [health response](evidence/health.json) reported revision `ce08d9fa5ed81fd0bdc7f29919b07b5be9947bdd`, schema 8, `db: ok`, and `worker: ok`; running web and worker containers used `flowline:ce08d9f`. No product code, commits, or server/container state were changed.

## Environment and account

- One headless Chromium `153.0.8010.12` browser controlled by Playwright `1.63.0`; two pages in one authenticated browser context. The [UI script](scripts/browser-repl.cjs) and [structured observations](evidence/checks.json) are in this artifact. Flow/agent creation, Copilot proposals, approvals, and manual runs used UI controls. The only direct HTTP request was the read-only health check.
- Fresh owner account created through sign-up: `codex-owner-202609280320@flowline-qa.test`, workspace `codex-retest-two`. No password, cookie, token, or API key value is recorded. The server UI named `ollama` with default model `qwen2.5:7b`; Copilot proposals identified `qwen2.5:7b`.
- The [browser event log](evidence/browser-events.json) recorded no console errors, page errors, or HTTP responses of 400 or higher during the sampled journey.

## Focused results

| ID | Result | Observation |
| --- | --- | --- |
| CX3R-01 | **PASS** | A published local Lead Qualifier flow was exposed to an agent with `Ask (human approval)`. The agent requested `run_workflow` once. Its pending request was observed at `03:26:29.683Z`; approval began at `03:29:51.799Z`, **202.116 seconds** later. The Flows dashboard still showed attention and **Review →** opened that exact selected agent run. Approve changed it to Running, then Answered. Run history showed exactly one Lead Qualifier child run, **#3 SUCCESS, 4/4**. [pending](screenshots/01-ask-pending.png), [dashboard after wait](screenshots/07-dashboard-review-after-174s.png), [decision enabled](screenshots/08-delayed-approval-active.png), [answer](screenshots/09-delayed-agent-answered.png), [one child run](screenshots/10-one-child-run-history.png). |
| CX3R-02 | **PARTIAL** | The trigger-only/no-action proposal was invalid with the new “doesn't produce anything” reason. All three approvable local drafts showed a preview on their sample input. The failed lead preview and `phone:null` preview gave explicit warnings; the Slack proposal explained that its external action was not previewed. The preview made wrong drafts inspectable, but **0/3 approved and run drafts met their requested result**. Two malformed outputs had a “succeeded” preview status without a semantic mismatch warning. Case evidence and counts follow. |

### Copilot cases

The first four rows are the two repeated CX3R-02 requests plus two new realistic requests. The next three are focused guard/preview probes. A separate Salesforce refusal was part of the regression sweep and is excluded from these counts.

| Request | Approvable? | Preview before approval | Approved draft run |
| --- | --- | --- | --- |
| **Support intake repeat:** manual input `customer_email` and `message`, return both through an actual Output step | **Yes** | Local preview **succeeded**, but returned both fields as nested objects containing the whole input, instead of their string values. The graph had two Output steps. [proposal and preview](screenshots/02-support-proposal-preview.png) | **Incorrect:** run #1 succeeded 4/4 and returned the same nested shape. [run](screenshots/03-support-run-wrong-shape.png) |
| **Lead cleanup repeat:** lowercase an email, keep company, return `normalizedLead` through Output | **Yes** | Local preview **failed**, warning “Attempted to invoke a non-function (at character 18).” [proposal and preview](screenshots/04-lead-proposal-preview-failed.png) | **Incorrect:** run #2 failed at `Lowercase Email`; Output was skipped. [run](screenshots/05-lead-run-failed.png) |
| **New order total:** multiply item prices by quantities, sum to 48, return `total` through Output | **No** | Invalid JSONata expression with a syntax error at `;`; no approvable draft or preview. [invalid proposal](screenshots/06-order-total-invalid.png) | Not approved. |
| **New incident handoff:** return `{incident:{service:"checkout",severity:"high"}}` through Output | **Yes** | Local preview **succeeded** but returned `{incident:{incident:{...}}}`. [proposal and preview](screenshots/11-incident-preview-nested.png) | **Incorrect:** run #4 succeeded 3/3 with the same extra `incident` layer. [run](screenshots/12-incident-run-nested.png) |
| **No-output guard probe:** Manual trigger and no action or Output | **No** | Invalid: “This workflow doesn't produce anything: it has no Output step and no action.” It also identified a self-connection. [invalid proposal](screenshots/13-no-output-rejected.png) | Not approved. |
| **External preview probe:** post an incident alert to Slack and return an ID | **Yes** | Warned that Slack was not connected and said `Not previewed: "Post message to Slack" (integration.action) runs outside Flowline`. [proposal](screenshots/16-external-not-previewed.png) | Rejected; no external action attempted. |
| **Null-result guard probe:** extract absent `customer.phone` from `{ticket_id:"T-42"}` | **Yes** | Local preview showed `{ "phone": null }` and warned it returns no data. [proposal and preview](screenshots/17-null-preview-warning.png) | Rejected. |

**Counts:** among the four requested scenarios, **3/4 approvable**; across all seven CX3R-02 proposals, **5/7 approvable**. Three drafts were approved and manually run; **0/3 returned the requested result**. The three approvals created exactly three draft flows. Invalid/rejected proposals created none: the workspace went from one base flow to four total flows. [final flow count](screenshots/18-four-flows-no-empty-draft.png).

## Quick CX3Q regression checks

| Prior ID | Focused observation |
| --- | --- |
| CX3Q-01 | **PASS for sampled path.** Flows dashboard **Review →** opened the pending agent run after more than 120 seconds, and the owner approved there. The child flow ran once. [dashboard](screenshots/07-dashboard-review-after-174s.png), [history](screenshots/10-one-child-run-history.png). Viewer permissions and the zero-prior-run case were not repeated. |
| CX3Q-02 | **PARTIAL, model quality remains.** The four main Copilot requests yielded 3/4 approvable proposals and 0/3 correct approved runs. Invalid drafts explained their errors. |
| CX3Q-03 | **PASS for one sampled unsupported app.** Salesforce was refused as unavailable without substituting another integration. [refusal](screenshots/15-salesforce-refusal.png). Workday was not repeated. |
| CX3Q-04 | **PASS.** At 375 px, Create with Copilot and New flow both had `aria-disabled="true"` and a visible mobile reason; document scroll width was 375 px. [mobile Flows](screenshots/14-mobile-buttons.png). Templates were not revisited. |
| CX3Q-05 | **PASS.** The no-output and order-total invalid proposals, and the rejected Slack/null proposals, created no flow; three explicit approvals added only their three drafts. [count](screenshots/18-four-flows-no-empty-draft.png). |

## New finding

| ID | Severity | Observation |
| --- | --- | --- |
| CX3S-01 | **minor / review clarity** | “Preview ... succeeded” reports that the local graph executed, even when the shown output plainly conflicts with the request. Support intake and incident handoff both showed extra nested objects and were still approvable. This does not violate the stated preview visibility change, but the success label alone can be mistaken for semantic correctness. [support preview](screenshots/02-support-proposal-preview.png), [incident preview](screenshots/11-incident-preview-nested.png). |

## Limits

- The real local model is nondeterministic; these seven proposals are a sample, not a stable rate estimate. Correctness was checked against each stated input and expected output, not merely the workflow run status.
- Slack was deliberately rejected because no connection was configured; external execution, credential setup, and preview behavior for a connected integration were not tested. The null-result example deliberately referenced an absent field to test the warning.
- This focused retest used one Chromium version and a 375 px mobile spot check. It did not repeat the earlier viewer, invite, knowledge, API key, tenancy, or full responsive journeys, and it is not human UAT or production verification.
