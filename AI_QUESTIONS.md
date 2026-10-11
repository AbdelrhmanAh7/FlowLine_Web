# Questions for the owner — issue #162

## Issue #162: Owner Actions - Sensitive Components

The issue brief explicitly states:

> "These actions are blocked by hard rules (money, legal, people) and must be handled by the founder only. Engineers must not perform these actions."

And lists five sensitive owner actions:
1. Real provider and AI account setup
2. Sandbox payments configuration
3. Approved deployment with restore/rollback/alerts
4. Pricing and terms finalization
5. Customer test coordination

The issue is described as "Part 1/2 of #30 (split by the CTO: Split into sensitive owner actions and non-sensitive scaffolding for engineers)".

## Questions

### 1. What engineering work is expected for this issue (Part 1)?

Since the issue explicitly states "Engineers must not perform these actions," and all five items are owner-only actions blocked by hard rules (money, legal, people), **no engineering implementation is possible for this issue as written**.

### 2. Is Part 2 (non-sensitive scaffolding for engineers) a separate issue?

If Part 2 is a separate issue (e.g., #163 or another number), please confirm the issue number so the engineering work can be tracked there.

### 3. Should this issue remain as a tracking/blocking issue for owner actions only?

If the intent is for this issue to serve as a checklist/documentation of owner-only actions (similar to `docs/implementation/OWNER_ACTIONS.md`), then:
- No code changes are needed
- The issue should be labeled as `owner-only` or `blocked` 
- The issue should not be assigned to engineers

### 4. Is there any scaffolding/documentation work engineers CAN do related to these owner actions?

For example:
- Documenting the owner action procedures in `docs/implementation/OWNER_ACTIONS.md` (already exists)
- Adding UI placeholders/disabled states with `disabledReason` for features awaiting owner setup (per "Honesty in UI" rule)
- Creating configuration schemas for when owner provides credentials
- Adding feature flags for owner-controlled features

## Recommendation

Given the explicit statement "Engineers must not perform these actions," I recommend:

1. **Close this issue as "owner-only — no engineering work required"** and track any engineering scaffolding in Part 2 (separate issue)
2. **OR** clarify what specific non-sensitive scaffolding work is expected in Part 1 vs Part 2

## Decision needed

Please confirm:
- [ ] This issue is owner-only tracking; no engineering commits expected
- [ ] Part 2 (engineering scaffolding) is issue #___ 
- [ ] Specific scaffolding tasks for engineers are: _______________

---

**Blocking:** Cannot proceed with implementation until clarified. Per AGENTS.md: "If the brief is unclear or impossible, write your questions to AI_QUESTIONS.md, commit it, and stop."