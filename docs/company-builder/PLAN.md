# Company Builder — implementation plan

Source brief: `docs/company-builder/CLOUD_IMPLEMENTATION_PROMPT.md` (complete owner brief, sections 1–10).
Baseline: `main` 9324b1fed677f03e8c044eb1373b8577167abeb5; feature branch `claude/company-builder-milestones-abc-pmba6v`.
Requirements: `SCOPE_MATRIX.md` → *Company Builder (CB-*)*. Architecture: `ARCHITECTURE.md`. CLI boundary: `CLI_PROTOTYPE.md`.

## Source references

The three product references named in brief §2 (`Flowline_Virtual_Company_Product_Study_AR_2026-09-30.html`,
`Flowline_Virtual_Company_Risk_Register_AR.md`, `Flowline_Virtual_Company_UX_Copy_AR.json`) were **not supplied** to
this session (searched the repository and the container). Per §2, the self-contained requirements in the brief are used
and every source-specific item (Q01–Q14, R01–R36, copy ids) is marked **PENDING — source not supplied** in
`ACCEPTANCE_MATRIX.md`. Nothing is invented for them. New CLI/prototype risks use their own ids (`CBR-*`).

## Principles (from the brief, restated as design constraints)

1. Business layer over the existing engine: drafts are ordinary `flow` / `agent` rows opened in the existing editor.
   No second engine, no per-business application, no generated executable code.
2. Three modes kept distinct: `DETERMINISTIC_TEST` (default; rules + tested packs, no model), `OWNER_CLI_PROTOTYPE`
   (founder + designated workspace + loopback + env flag), `CUSTOMER_CLOUD` (not enabled by this work).
3. Deterministic rules decide eligibility, questions and copy. Model output (CLI) is optional, validated by Flowline,
   and never writes to the database directly.
4. Honest states everywhere: facts carry status + provenance; trials report structurally valid / ran / matched
   separately; activation is separate from billing and from installation.
5. Everything new is behind `FLOWLINE_COMPANY_BUILDER=on` (off by default — release scope unchanged unless the owner
   enables it).

## Milestone A — adaptive interview and plan preview

- Question bank (`src/company-builder/questions.ts`): versioned, each question has id, target fact, display condition,
  reason, answer schema, sensitivity and skip/stop rules. Deterministic next-question selection.
- Facts (`src/company-builder/facts.ts`): `confirmed | inferred | contradictory | unknown`, provenance and version.
  Inference never silently becomes confirmed; contradictions are surfaced.
- Interview session persisted (`cb_interview_session`), save/resume, back, correction, "don't know yet".
- Plan preview (`src/company-builder/planner.ts`): stop rule (outcome, data source, trigger, reviewer, feasible
  capability) or an honest partial plan with blockers. Sample data offered for founders with no systems; unsupported
  tools disclosed before any checkout; agency client isolation.
- UI: `/w/[slug]/company` — promise, situation choice, one-question flow, fact review ("راجع ما فهمناه عن مشروعك."),
  plan preview ("خطة فريقك جاهزة للمراجعة."). Advanced editor stays available.

## Milestone B — blueprint, compiled work and first verified result

- Typed, versioned objects (zod) in `src/company-builder/model.ts`; tables in migration `0020_company_builder`.
- Three packs (`src/company-builder/packs/`): customer triage, invoice organisation, content brief. Recruitment is
  planned, not operational. Packs compile to graphs of registered local nodes only; validated with `validateGraph`
  plus Company Builder checks (types, references, cycles, limits, capabilities).
- Installation (`src/company-builder/install.ts`): unique install key per workspace + blueprint version, per-task step
  records, resumable and idempotent; creates real draft flows (and a bounded Agent where justified).
- Sample trials run through the existing worker/engine; results checked against pack acceptance fixtures;
  provenance recorded (deterministic calculation / mocked integration / real CLI / real service).

## Milestone C — activation, review inbox, commercial-ready boundaries

- Task states: plan draft, requires setup, sample verified, live verified, approval required, active, paused, failed.
- Review inbox (`cb_review_item`): source, proposed content, connection, recipient, reviewer, task version; binding hash
  re-checked at execution (arguments, identity, version, membership).
- Development trial entitlement (`cb_entitlement`, dev/test only) separate from billing status; activation never
  follows payment or saved credentials; reconciliation pauses tasks when entitlement lapses.
- CLI prototype adapter (`src/company-builder/cli/`) with founder/workspace/loopback gate, typed envelope, fixed argv,
  job directories, bounded retries, durable jobs processed only by an operator-started controller
  (`scripts/company-builder/cli-controller.mts`), plus operator export/import for laptop-only CLIs.

## Verification

Unit, integration and E2E suites; frozen 12-case benchmark (`tests/fixtures/company-builder/benchmark.ts`) scored per
dimension; existing gates rerun; independent review by a separate reviewer agent; evidence under
`artifacts/company-builder/<run-id>/`. Real CLI trials, Codex, real Chrome, Pi and human usability are reported with
their actual status.
