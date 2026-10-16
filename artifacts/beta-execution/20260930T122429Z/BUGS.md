# Beta execution findings and limits

CURRENT 2026-09-30 continuation: [CP23_CONTINUATION.md](CP23_CONTINUATION.md) supersedes the cp21/account-waiting statements below. Latest cp23 source changes and recovery failure/correction require fresh gates and Claude review; current local runtime is still cp21. The material below is retained historical evidence.

Executor checks, not independent review. Candidate product/E2E inputs match cp20; cp21 `5d2a8e1dd765058ccd6b474026e5e5e5452efa89` adds the shared-close-handler unit assertion.

| ID | Impact / status | Evidence |
|---|---|---|
| BX-01 | Resolved test wiring mismatch: old unit source assertion expected an inline run close callback. Updated assertion verifies both controls use closeRun, which clears run and disables automatic reselection. No product code or existing behavior assertion removed. | `tests/unit/dialog-focus.test.ts`; unit 388/388; retained cp20 keyboard-surface behavior checks |
| BX-02 | Preserved launcher interruption: PowerShell treated npm stderr warning as terminating error. Integration test runner did not complete. A WSL bash attempt then lacked pnpm (exit 127). The supported Node-supervised Windows launch completed integration 460/460. Neither interrupted launch is counted as PASS. | raw logs ignored; `sanitized-v2/test-integration.txt`, `test-integration-restart.txt`, `test-integration-attempt3.txt`; gate status files |
| BX-03 | Evidence encoding: Windows PowerShell redirected early logs as UTF-16. First sanitizer decoded them incorrectly. Preserve those initial copies as invalid encoding; publish/use `sanitized-v2/` only, which detects BOM before redaction. | `sanitize-logs.mjs`; initial top-level lint/typecheck/test/contract/integration TXT files are excluded from intended publication |
| DV2-02 | Two additional disposable test environments remediated, independently generated keys and fresh DBs, no fallback; old DBs preserved. History text scan clean. No production data was rewrapped. Old copied ciphertext remains compromised. | `key-reuse-audit.json`, `key-rotation.json`, `key-rotation-history.json`; design-worktree historical 10/10 crypto evidence remains separate |
| DV2-R01 | OPEN, P3 touch tooltip toggle after drag-off. Limited tooltip interaction; no execution or stored-data effect established. | Existing design-v2 BUGS.md; retained touch observations |
| DV2-R02 | OPEN accessibility gap: disabled-tab reason is not reachable via arrow-key focus. Screen-reader description/hover/tap exist; this is not waived by journey 9. | Existing BUGS.md; independent impact review pending |
| DV2-R03 | OPEN latent focus fallback when opener is removed. No current caller identified in the retained review; new successful-removal callers have explicit surviving-focus behavior. | Existing BUGS.md and cp20 removal retests |
| DV2-R04 | OPEN; approval-message association/reviewer-text display requires Claude impact review. Source selects the first pending approval for a node and decision controls submit its explicit id/preview. That does not prove all multi-approval contexts are safe or merely cosmetic. No beta-readiness waiver. | `src/i18n/engine-text.ts:254`, `runs/inspector.tsx` DecisionBox; retained review |
| Q01a/Q04a/theme | Existing raw provider-text localization, landing focus order, light amber/orange similarity and System-dot hydration observations remain open. | design-v2 BUGS.md / NOTES.md |

Recorded new P0/P1 application findings: none from this executor's narrow repository checks. This is not an independent security or visual-review verdict. External integrations, actual email, Paddle checkout, cloud AI, host TLS/recovery and load are NOT RUN here. No owner account, endpoint or expenditure is configured by this run yet.
