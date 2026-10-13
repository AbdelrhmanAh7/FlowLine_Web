# Questions for #142 (blocked: run 6)

Acceptance needs a recorded live run (`FIELD_RUN=run6-v2-<sha> PACKET=packet.v2.json`) of the field harness on an isolated test stack. This agent machine has no Docker, no running Postgres (`pg_isready`: no response on :5432), no `.env.test` and no model access, so the run cannot be produced here. Offline re-scoring of run 4 is already recorded in run5 RESULTS.md.

1. Who runs run 6 (owner or a machine with the stack) on head of PR #188? Commit its RESULTS.md as `run6-v2-<sha>/`.
2. Or re-scope #142 so it does not close on the scorer fix (`Refs #142`) and run 6 moves to a follow-up issue?

Until then PR #188 should not claim `Closes #142`. Docs now say the gaps are unit-tested but not live-confirmed (BUGS.md VF-04, RESULTS.md, NEXT_ACTION.md).

## Status (round 13)

Re-checked on this machine: no `.env.test`, no Docker, Postgres installed but not running, Ollama not reachable from the sandbox, no model credentials. A live run 6 is still impossible here; nothing was faked. The run-5 per-VP table now marks VP-05/VP-06 `ownerDecision` as historical (superseded under the current scorer).

Recommended resolution for the hub/owner: link PR #188 as `Refs #142` (not `Closes #142`) and keep #142 open until run 6 is committed as `run6-v2-<sha>/RESULTS.md` from a machine with the stack and a model. The agent that edits PR bodies is the harness; this branch cannot change it.
