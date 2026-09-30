# Company Builder — defects (run 20260930)

Reviewer for the source review: a **separate Claude subagent** (read-only; its own session and context, same model
family as the implementer). **Not Codex**: Codex is not installed in the cloud container and its docs are blocked, so the
"Codex BUGS.md / real Chrome exploratory QA" requirement is **BLOCKED** and still needed. Tested revision: `51f1473`
(review input); fixes on the following commits (see `REPORT.md`). Retest of the fixes was run by the implementer's
automated tests, **not** by an independent re-tester. That retest is still open.

Severity: P0 blocker · P1 must fix before any owner trial · P2 should fix · P3 minor.

| ID | Sev | Finding (reproduction → expected / actual) | Source | Status | Fix / evidence |
|---|---|---|---|---|---|
| CB-BUG-01 | P1 | Prototype host gate trusted client `Host`/`X-Forwarded-For`; dev/start bind 0.0.0.0 → a LAN client holding the founder cookie could spoof loopback. | reviewer P1-1 | FIXED (partial by nature) | Gate now also requires `FLOWLINE_CB_BOUND` set only by `scripts/company-builder/start-private.mjs` (binds `-H 127.0.0.1` or one approved RFC1918 address). Unit: "is disabled by default…", "approved private host…". Residual: an operator who sets the marker by hand defeats it (documented CBR-02). |
| CB-BUG-02 | P1 | Isolation preflight only checked instruction files; Codex `--sandbox read-only` still loads MCP and can read `~/.codex/auth.json` into output. | reviewer P1-2 | FIXED (fail closed) | Codex now refused unless `FLOWLINE_CB_CODEX_ISOLATION_VERIFIED=1` and no `[mcp_servers` in config.toml; Claude refuses managed settings with hooks/plugins/MCP/apiKeyHelper (user/project settings are ignored by `--restricted`); secret-looking output → `SECRET_IN_OUTPUT`, never stored. int-cli: "Codex stays fail-closed…", "secret-looking output is rejected". Real-CLI verification BLOCKED. |
| CB-BUG-03 | P1 | Activation published the current draft (any trigger) and could publish an edit made after approval (TOCTOU); not bound to the trial-verified revision. | reviewer P1-3 | FIXED | Binding includes the trial-verified graph hash; schedule/webhook triggers refused; after publish the version hash is re-checked and the flow unpublished on mismatch. int: "P1-3: activation requires…". |
| CB-BUG-04 | P1 | Task couldn't be re-activated after pause/reject/expiry (unique index across all statuses returned the old item). | reviewer P1-4 | FIXED | Migration `0021` partial unique index on pending items; `openItem` retires expired items. int: "P1-4…". |
| CB-BUG-05 | P1 | Entitlement reconciliation ran only when the page was viewed. | reviewer P1-5 | FIXED | Worker tick every 60 s (`reconcileActiveEntitlements`). int: "P1-5…". |
| CB-BUG-06 | P1 | "Arrived damaged, paid full price, want a refund" → drafted a pricing reply instead of a hand-off. | reviewer P1-6 (verified) | FIXED | Complaint checked first; new frozen pack fixture `cust-complaint-with-price`; int: "P1-6…". |
| CB-BUG-07 | P2 | Trial dedupe race (two runs for one key). | reviewer P2-1 | NOT REPRODUCIBLE | `enqueueRunEx` dedupes on `triggerRef` under the flow row lock; int "P2-1 (verified not reproducible)" asserts one run for 3 concurrent calls. |
| CB-BUG-08 | P2 | CLI jobs duplicated by double click (fresh key per click, buttons not disabled). | reviewer P2-2 | FIXED | Stable key per intended job until created; buttons disabled while pending. (UI; covered by server dedupe test in int-cli.) |
| CB-BUG-09 | P2 | Review item stuck in `approved` if execution threw; verify re-executed without recomputing the binding. | reviewer P2-3 | FIXED | Definite failures → `invalidated` (+ activation `failed`); verify recomputes the binding before any retry. |
| CB-BUG-10 | P2 | Rejected/invalidated re-request downgraded an ACTIVE task's state while the flow stayed published. | reviewer P2-4 | FIXED | `setActivation` never downgrades `active` except by activate/pause. |
| CB-BUG-11 | P2 | A newer plan version (e.g. CLI proposal) hid installed/active tasks. | reviewer P2-5 | FIXED | Overview falls back to the latest installed installation of the interview. int "P2-5/P2-6…". |
| CB-BUG-12 | P2 | Deleting an interview left activated flows published and unmanageable. | reviewer P2-6 | FIXED | Delete unpublishes active drafts first; drafts themselves stay. int "P2-5/P2-6…". |
| CB-BUG-13 | P2 | A CLI proposal could rewrite the owner's approved information; diff showed only task ids. | reviewer P2-7 | FIXED | Proposal can't touch `approvedInfo`; currencies only narrowed to confirmed ones; model text shown as "Model note (not verified)"; field-level diff. int-cli "can't rewrite…". |
| CB-BUG-14 | P2 | Sample trial ran an edited draft (possibly with HTTP/AI/integration steps) while labelled "didn't connect to your accounts". | reviewer P2-8 | FIXED | Trials refused when the draft has nodes outside the pack's local set. int "P2-8…". |
| CB-BUG-15 | P2 | Import/cancel races (unlocked status checks). | reviewer P2-9 | FIXED | Conditional `UPDATE … WHERE status=…` transitions; controller never overwrites `cancelled`; failed import → `failed`. |
| CB-BUG-16 | P2 | Question cap counted corrections/re-answers. | reviewer P2-10 | FIXED | Cap counts distinct questions (`path`). unit "the question cap…". |
| CB-BUG-17 | P2 | False "unsupported tool" blocker ("excellent" → excel; "relationship" → ship). | reviewer P2-11 (verified) | FIXED | Whole-word Latin matching; ambiguous short keywords removed; re-answering the description clears its old inferences. unit "Latin keywords match whole words…". |
| CB-BUG-18 | P3 | Malformed ids → 500. | reviewer P3 | FIXED | UUID guards; int "P3: malformed ids…". |
| CB-BUG-19 | P3 | Activate/Pause buttons gated on the wrong capability. | reviewer P3 | FIXED | `flow.publish` in UI (server already enforced it). |
| CB-BUG-20 | P3 | Invoice without `stated_total` not flagged; evaluate failed for a single-object `documents`. | reviewer P3 | FIXED | `stated_total` required; evaluate wraps single objects. |
| CB-BUG-21 | P3 | Negative `FLOWLINE_CB_TIMEOUT_MS` accepted; job root ownership/mode unchecked. | reviewer P3 | FIXED | Clamp ≥5 s; job root must be owned by the user with no group/other bits. |
| CB-BUG-22 | P3 | Envelope used inferred departments, planner confirmed ones. | reviewer P3 | FIXED | Envelope uses confirmed departments. |
| CB-BUG-23 | P3 | Self-approval allowed for non-owner reviewer roles; requester membership not in the binding. | reviewer P3 | PARTIAL | Removed requester → item invalidated at decision. Self-approval remains allowed (owner-run prototype; one person is often requester and reviewer) — OPEN for the commercial path. |
| CB-BUG-24 | P3 | Unknown situation defaults to "improve" in the plan. | reviewer P3 | ACCEPTED | `situation` can't be "don't know" (it's required before anything else); default only reachable in malformed data. |
| CB-BUG-25 | P3 | Preflight flag detection is substring-based. | reviewer P3 | OPEN | Acceptable for the owner prototype; tighten once real `--help` outputs are captured on the laptop. |
| CB-E2E-01 | P2 | E2E attempt 1 (Chromium): after Back + re-answer, the question card remounted (cached stale render vs fresh fetch) and lost the checkbox selection → Save stayed disabled. | e2e | FIXED | Card keyed by question + fact version. Failed attempt preserved: `browser/chromium-cb-attempt1-FAILED.txt`; pass: `chromium-cb-attempt2-after-fix.txt`. |

Keyboard / mobile / Arabic forms / deceptive status wording: covered by the automated E2E and copy tests listed in
`ACCEPTANCE_MATRIX.md`; a human or real-Chrome exploratory pass is still **NOT RUN**.
