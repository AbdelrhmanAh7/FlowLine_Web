# Questions / blockers for #121

`docs/engineering/lock-order.md` does not exist on main (origin/main = c830c11). The skeleton (part 1/3, #120) exists only on branch `ai/120` (commit 3315b21) and has not merged. The brief says to start after it merges and rebase on main, so no work was done. `git fetch` was also blocked by the sandbox (github.com not allowed), so origin/main may be stale.

Needed: merge #120, then re-run #121 (rebase on main, add the #41 and #42 worked examples).
