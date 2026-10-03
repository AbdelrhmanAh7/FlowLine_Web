# Paid-pilot AI tool usage journal

Date: 2026-10-03. Worktree base: `9641ad1e684cad7b84bd2385751ea19b0a9d4060`. No repository tests were run for this documentation/review slice. No `.env*` file was read. Credential values, account identifiers, and auth profile paths are intentionally omitted.

| Tool / model | Attempt | Result and headroom | Decision |
|---|---|---|---|
| Command Code / intended `poolside/laguna-s-2.1-free` (not selected or invoked) | `command-code -p "/usage" --no-session` (bounded usage check; no model selected and no document content submitted) | First response: insufficient credits. Numeric remaining balance was not exposed. | Stopped immediately; no model call, retry, purchase, or fallback through this tool. |
| OpenCode / `opencode/mimo-v2.6-flash-free` | Listed model/auth provider labels only; no generation | The model is advertised free, but current console routing is pay-as-you-go and may send an auxiliary title request. No safe zero-cost route/headroom proof. | BLOCKED; no model call. |
| Antigravity `agy` / Gemini 3.8 Flash | `agy auth status` returned exit 2 with no status; `agy models` showed model names only | No positive subscription-authentication or quota proof; no provider/API route could be distinguished safely. | BLOCKED; no generation. |
| Claude Haiku / `haiku` | `claude --model haiku --max-turns 1 --output-format text -p <short sanitized review>` then one bounded retry with `--max-turns 3` | Both exited 1 with `Reached max turns`; no review returned and no quota/credit warning appeared. Active subscription authentication was positively reported by the CLI, but numeric remaining quota was unavailable. | Stopped after the two bounded failures; no further retry. |
| Claude Fable / `fable` | `claude -p --model fable --tools "" --max-turns 1 --output-format text <short sanitized readiness decision>` | Exit 0; short readiness decision returned. Active subscription authentication was positively reported; numeric remaining quota was unavailable, with no warning encountered. | Completed one review; no further call. |

## Fable result

**NOT READY.** Decisive gaps: no owner-approved price/terms/support details or verified sandbox checkout lifecycle; deployment/rollback/backup-restore proof and fresh CI are pending; provider/account verification, customer UAT, and invitations remain blocked. This is a draft-readiness review, not CI, provider, deployment, billing, or customer proof.

## Independent acceptance/support/policy review

The acceptance draft correctly separates local evidence, CI, real-provider proof, and human UAT, and keeps price, provider advertising, invitations, payment, and deployment owner-gated. Keep that boundary intact. The existing beta user guide's “certified for the beta” connector wording conflicts with the limitations draft, which conditions certification on per-integration artifacts; align the support/acceptance text to say availability is not live verification. The absolute “not used to train models” user-guide claim also needs explicit scope: FlowLine's policy says its own handling excludes training, while AI provider features transmit submitted text and provider terms are not established here. Support's Request ID instruction is useful, but a real contact, staffed hours, and response target remain intentionally unapproved.

## Scope and worktree

The referenced owner brief exists only in the primary checkout and is untracked there; it is absent from the clean main worktree at the base SHA. It was read from its exact path without changing it. This journal is the only file created in this worktree. One external Claude Fable subscription generation was made; no FlowLine provider/API call, commit, push, account/scope change, or paid route was made.
