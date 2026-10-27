# Issue #492 — docs: ARCHITECTURE.md (runtime, Run sequence, modules, data model)

Originating Sentry issue: None (docs-only PR).

## Acceptance criteria

**AC1.** The document must not falsely claim the Stage 1 charter lives "at the top of `AGENTS.md`"; any goals stated must acknowledge they are unsourced in the repo or cite the file where they actually appear.

**AC2.** The three Mermaid sequence-diagram `Note` / arrow lines that contained a raw `;` character (which Mermaid treats as a statement separator and that cause a parse error on GitHub) must be rewritten without that character.

## Verification

| AC | Change | Command / observation | Result |
|---|---|---|---|
| AC1 | Removed "charter at the top of `AGENTS.md`" from line 3. Removed claim that Stage 1 scope and contributor rules both live in `AGENTS.md` from line 5. Added honest language: goals are in owner planning documents and no single committed file contains the full charter text; `SCOPE_MATRIX.md` is cited for the scope matrix. Module-table intro no longer references the charter. | `grep "charter" docs/ARCHITECTURE.md` | Zero matches — claim removed |
| AC1 | Checked `AGENTS.md` for Stage 1 charter text | `grep -n "Stage 1\|ACTIVE\|FROZEN\|ten active" AGENTS.md` | No output; confirmed charter not there |
| AC2 | Replaced `;` on line 57 (`active run; lock click` → `active run, then lock click`) | `awk '/\`\`\`mermaid/,/\`\`\`/' docs/ARCHITECTURE.md \| grep ";"` | Exit 1, no output — no semicolons remain in Mermaid blocks |
| AC2 | Replaced `;` on line 75 (`returns 422; rejected` → `returns 422. Rejected`) | same check above | same result |
| AC2 | Replaced `;` on line 78 (`prior steps; recheck` → `prior steps, then recheck`) | same check above | same result |

## Changed files
- `docs/ARCHITECTURE.md` — two citation fixes (lines 3–5, lines 112–113) and three Mermaid semicolon fixes (lines 57, 75, 78)

## Tests changed
None. This PR changes only a Markdown documentation file. The `docs` CI check (`docs.yml`) already passes per the PR's test plan. No code, test, schema or CI file is touched; the docs-only gate skips the test tier by design (AGENTS.md gate rules).

No E2E tests are required: `E2E: not needed — docs-only change, no code or user flow altered.`
