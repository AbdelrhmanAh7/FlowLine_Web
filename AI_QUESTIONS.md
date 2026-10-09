# Questions / blockers for #121

Blocked on #120, re-checked 2026-10-09 after a successful `git fetch origin`:

- `origin/main` is still `c830c11` and has no `docs/engineering/lock-order.md`.
- #120 (the skeleton, part 1/3 of #89) is OPEN, and its PR #128 (branch `ai/120`) is still a **draft**.

Brief step 1 says to start only after the skeleton has merged, then rebase on main. Building on `ai/120` would mean stacking on, or folding in, an unreviewed draft, which the constitution (article 2) forbids. So this branch has no doc changes yet.

Needed: mark PR #128 ready, get it reviewed and merged, then re-run #121. That run rebases on main and adds the #41 and #42 worked examples under `## Worked examples`.

No e2e-army test: #121 is docs only and changes no user-facing flow.

Re-checked again (origin/main = 414ee0a): `docs/engineering/lock-order.md` is still absent, so the QA finding "missing modifications" cannot be fixed without building the skeleton myself. Still blocked on #120/PR #128 merging. Once it merges, re-run #121.
