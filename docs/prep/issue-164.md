# Prep for #164: Import an n8n workflow JSON into FlowLine as an editable graph

> Offline floor prep (2026-10-13T14:12Z): capacity 0 — claude: claude week 87% ≥ 85%: the last 15% is the owner's; codex: codex is in peak hours (16:00–00:00 Africa/Cairo):; opencode: opencode has no live canary pass in the last 3 h (; agy: held until 10-14 14:35Z (1 d 0 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

### 📝 Task brief

> [!NOTE]
> Queued for the Mac mini AI implementers.

#### Brief
Idea approved by the founder (Ideas Lab). Import an n8n workflow JSON into FlowLine as an editable graph

Why it could work: As an n8n alternative, the cheapest switch argument is importing what teams already built instead of rebuilding by hand. First step: parse one common webhook → function → HTTP workflow, map supported nodes to FlowLine nodes, and render unsupported ones as clearly labelled disabled placeholders the user can replace. (Innovation Lead, opencode-cli 2026-10-06)

Deliver the smallest useful first version; the Tech Lead plans it and splits it if large.

<details><summary><b>Context</b></summary>

| | |
|---|---|
| **Notion task** | https://www.notion.so/3f127121047281c0b51fcdba9b8359bb |
| **Engineer** | Auto (Claude first) |
| **Triage** | feature · risk medium · sensitive false (local-fast, unverified) |

</details>

<sub>Delivery agent · decision 133fc370-84ad-4cb1-89c4-4ce46784640a</sub>

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/pull_request_template.md`
- `.github/workflows/claude.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/gate.yml`
- `.github/workflows/nightly.yml`
- `.gitignore`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `CLAUDE.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/docs-check-script.test.ts`
- `tests/unit/docs-index.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`

## Test plan (ollama:gemma3:4b)

## FlowLine - Import n8n Workflow JSON - Test Plan

**Goal:** Verify basic import and rendering of a simple n8n workflow JSON.

**1. Simple Webhook -> Function -> HTTP Workflow Import**
   * **Name:** Basic Import - Valid JSON
   * **Setup:** Import a pre-defined n8n JSON (webhook -> function -> HTTP)
   * **Assertion:** Graph is rendered correctly with all nodes mapped.
   * **File:** `e2e/landing-interaction.spec.ts`
   * **Edge Case:** Invalid JSON – Graph renders with error message.

**2. Node Mapping - Supported Nodes**
   * **Name:** Supported Node Mapping
   * **Setup:** Import JSON with supported FlowLine nodes.
   * **Assertion:** All nodes are correctly mapped and editable.
   * **File:** `e2e/landing-interaction.spec.ts`

**3. Node Mapping - Unsupported Nodes (Placeholder)**
   * **Name:** Unsupported Node Placeholder
   * **Setup:** Import JSON with an unsupported node type.
   * **Assertion:** Unsupported node is rendered as a clearly labelled disabled placeholder.
   * **File:** `e2e/landing-interaction.spec.ts`
   * **Edge Case:** Complex Unsupported Node – Placeholder accurately reflects complexity.

**4. Graph Editing - Basic Node Modification**
   * **Name:** Node Edit - Simple Change
   * **Setup:** Import JSON, modify a single node’s input.
   * **Assertion:** Modified node is reflected in the graph.
   * **File:** `e2e/landing-interaction.spec.ts`

**5. Graph Rendering - Large Workflow**
   * **Name:** Large Workflow Rendering
   * **Setup:** Import a larger, more complex n8n workflow JSON.
   * **Assertion:** Graph renders without errors, maintaining node connections.
   * **File:** `e2e/landing-interaction.spec.ts`
   * **Edge Case:** Extremely Large Workflow – Performance/Rendering Stability.

**6.  Error Handling - Invalid JSON (Partial)**
   * **Name:** Invalid JSON (Partial)
   * **Setup:** Import JSON with a partial, invalid structure.
   * **Assertion:**  Clear error message displayed to the user.
   * **File:** `e2e/landing-interaction.spec.ts`

**7.  File Integrity - Import Confirmation**
   * **Name:** Import Confirmation
   * **Setup:** Import a workflow.
   * **Assertion:** Confirmation message displayed, graph is successfully imported.
   * **File:** `e2e/landing-interaction.spec.ts`
