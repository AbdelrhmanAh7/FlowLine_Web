# AI Questions for Issue #239

## Blocking Dependency: Missing Create Actions

### 1. The actions and their describe blocks are missing on main
- `src/integrations/providers/mizano.ts` only registers `mizano.list_overdue_invoices` (plus identity/verification)
- `tests/contract/mizano.test.ts` has no describe blocks for `mizano.create_customer` or `mizano.create_draft_quote`
- No `toHaveProperty("Idempotency-Key")` calls exist to replace

### 2. #239 depends on the #147 sibling issue that adds them
- Commit `df3ca14` ("chore: ai implementer progress on #147") adds both create actions with proper idempotency key handling
- That commit is in `git log --all` but **not reachable from HEAD** (branch ai/239 is based on main without #147)
- The contract tests in #239 can only be written once the actions exist

### 3. Should I rebase once #147 merges?
- Option A: Wait for #147 to merge to main, then rebase ai/239 and implement the contract tests
- Option B: Rebase ai/239 onto the #147 branch now (if available locally) and implement
- Option C: Implement the tests in a separate PR that depends on #147's PR

**Recommendation:** Option A is cleanest — implement #239 after #147 lands on main, since #239 is explicitly "Part of #147" and the contract tests verify behavior that #147 introduces.

---

**Action:** Stopping work on #239 until the create actions are available on the base branch.