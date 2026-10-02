# Company Builder — architecture

A business layer over Flowline's existing engine. It adds **no** second engine, no per-business application and no
generated executable code. Everything it creates is an ordinary `flow` / `agent` / `knowledge_source` row that opens in
the existing editor and runs through the existing worker.

Feature flag: `FLOWLINE_COMPANY_BUILDER=on` (off by default → every page and API route is 404 and the nav entry is
hidden). Plan: `PLAN.md`. CLI boundary: `CLI_PROTOTYPE.md`. Requirements: `SCOPE_MATRIX.md` → CB-*.

## Modes

| Mode | Who | What runs | Where |
|---|---|---|---|
| `DETERMINISTIC_TEST` (default) | any owner/editor of a workspace with the flag on | reviewed question bank + rules + tested packs; no model | web + shared worker |
| `OWNER_CLI_PROTOTYPE` | the founder only (env user id), in one designated workspace, on loopback | bounded Claude/Codex CLI jobs that *propose*; Flowline validates | operator-started controller on the founder's machine |
| `CUSTOMER_CLOUD` | — | not enabled by this work (existing Provider Hub stays the commercial path) | — |

## Layers

```
src/company-builder/            pure domain (no DB): unit-tested
  model.ts                      zod schemas: facts, blueprint, task plan, states, provenance
  questions.ts                  reviewed question bank v1 (id, target, condition, reason, schema, sensitivity, stage)
  interview.ts                  answer parsing, free-text inference (inferred only), contradictions, next question, stop rule
  planner.ts                    facts → CompanyBlueprint (confirmed departments only; blockers for every gap)
  packs/                        3 versioned task packs → graphs of registered LOCAL nodes + business checks + fixtures
  validate.ts                   blueprint + compiled-graph validation (types, refs, packs, permissions, providers, cycles, expressions)
  lifecycle.ts                  per-task state machine (plan draft … failed)
  cli/envelope.ts               typed job envelope, sanitisation, proposal schema, applyProposal
  cli/adapter.ts                fixed argv, preflight, job dirs, bounded spawn, error classes (controller-side only)
src/server/company-builder/     services (DB), all behind src/server/access.ts membership checks
  gate.ts                       feature gate + founder/workspace/loopback prototype gate
  api.ts                        router for /api/workspaces/[wid]/company-builder/[...path]
  sessions.ts blueprints.ts install.ts trials.ts reviews.ts entitlement.ts cli-jobs.ts cli-controller.ts overview.ts
src/app/w/[slug]/company/       pages (landing, session); components in src/components/company-builder/
scripts/company-builder/        cli-controller.mts (operator), laptop-generate.mts (export/import path)
drizzle/0020_company_builder.sql
```

## Data (migration 0020)

| Table | Brief object | Notes |
|---|---|---|
| `cb_session` | InterviewSession | `state` = facts (value, status, source, question, version, conflict) + answer history + path; optimistic `revision` |
| `cb_profile` | BusinessProfile | immutable snapshot per version; unchanged facts reuse the last version |
| `cb_blueprint` | CompanyBlueprint (+ DigitalRole, TaskPlan, TemplateVersion = pack id@version) | only validated bodies; `diff` vs previous; older versions `superseded` |
| `cb_installation` | InstallationJob | unique `install_key` = workspace:blueprint-version |
| `cb_installed_item` | partial-step record | unique (installation, task, kind); `definition_hash`; `base_revision` detects manual edits; `origin` created/reused |
| `cb_trial` | sample trial | unique (installation, task, trial_key); run id; provenance; verdict |
| `cb_review_item` | ReviewItem | source, proposed, connection, recipient, reviewer, task version, **binding hash** |
| `cb_sample_outbox` | authorised TEST action target | unique per review item (side-effect dedupe); provenance `mocked_integration` |
| `cb_activation` | ActivationDecision | per installed task; separate from billing and installation |
| `cb_entitlement` | development trial entitlement | dev/test builds only; billing status read from `billing_account`, never written |
| `cb_cli_job` | owner CLI job | durable status, envelope, validated result, reported usage only |

Deleting an interview cascades to its profiles, blueprints, installation records, trials, reviews and CLI jobs; created
flows/agents/knowledge stay (ordinary user data). `GET …/sessions/:id/export` exports the answers first.

## Key flows

1. **Interview** — `answer()` locks the session row, checks `revision`, validates the answer against the question's
   schema, updates the fact (new version), applies deterministic inferences (status `inferred`, never overwriting an
   answer), recomputes contradictions. `nextQuestion()` = eligible (condition true, fact missing/inferred/contradictory)
   ordered by contradiction first, then stage. Cap: 18 answers. Stop rule: essential facts for the confirmed departments
   are confirmed.
2. **Plan** — `generateDeterministic()` snapshots the profile, composes, validates and stores a version (identical body →
   same version). Approval is an explicit owner action ("preview before applying").
3. **Install** — per task, in one transaction under an advisory lock: skip if its step record exists; reuse an identical
   definition from an earlier version of the same interview; else create the flow (or knowledge + agent). A crash
   leaves committed steps only; the retry resumes. Nothing is published, scheduled or charged.
4. **Trial** — `enqueueRunEx(manual, triggerRef = cb-trial:<key>)` on the draft; the shared worker runs it; the verdict
   is computed from the persisted run output: structurally valid (graph validates) / ran without errors (run succeeded)
   / matched outcome (pack business checks).
5. **Review** — a completed trial's proposal (reply / ledger rows / copy) becomes a review item bound by hash. At
   decision time the binding is recomputed from the database (newest plan version, draft revision, trial run, reviewer's
   current role); mismatch → `invalidated`. Approval executes immediately into the sample outbox (unique per item). A
   lost response (test fault) → `uncertain`; `verify` checks the outbox before any retry.
6. **Activation** — needs a matched trial, a known reviewer, a supported trigger and an entitlement (dev trial or
   billing `active/trialing`); it opens an activation review bound to the draft's revision; approval publishes the draft's
   manual-trigger version (nothing runs unattended). `reconcileEntitlement()` pauses active tasks (unpublish) when no
   entitlement remains. Billing webhooks never touch Company Builder state.

## Reused existing pieces

`enqueueRunEx`/worker/engine (runs, steps, persistence), `validateGraph`/`checkExpressionSyntax` (safe JSONata, no eval),
`publishFlow`/`unpublishFlow`, `canDecide` + `canonicalJson`/`sha256Hex` (approval binding style), `audit`, the permission
matrix (`flow.view/edit/run/publish`, `agent.edit`, `approval.decide`, `billing.manage`), `DEFAULT_LIMITS` for agents,
the knowledge indexer, i18n (`useT`/`getT`, Arabic source catalogue), UI primitives (`Button disabledReason`, `Card`,
`StatusBadge`, `InlineConfirmation`).

## Why not the engine `approval` table for Company Builder reviews

Engine approvals are gates *inside* a run (bound to run + node + args + connection) and deciding one re-queues that run.
Company Builder reviews happen *after* a trial run finished (test action) or *before* publication (activation). Reusing
the table would wake finished runs and mix semantics, so the same binding rules are applied in `cb_review_item`.
Approval gates inside flows (e.g. a Gmail send with `requireApproval`) keep using the engine's approval table unchanged.
