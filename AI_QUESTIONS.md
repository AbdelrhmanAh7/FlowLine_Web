# Issue #221 — blocked at the hub boundary (2026-10-14)

Acceptance is unmet. PR #227 must use `Refs #221`; the harness owns its body.
The CTO explicitly denied hub write authorization in the issue comments. No
product workaround can safely turn a verified account's valid sign-in into 403.

Rechecked at FlowLine `50370039cc2e87a02f04ea3dc20c686d98236edc`:
- Deployed hub checkout: `1544080dba6e5c8c593531e92f4abc8511c96a43`.
- Separate source checkout `nql-agents`: `02b81bfd52b7383e85f1e73de36e4aaf4046d61c`.
- Stable evidence: `~/agents/logs/stable/FlowLine_Web/2026-10-12/e2e-army.log`
  lines 57–61 pass all auth tests; lines 481–505 rerun core-api and show
  200/403, used verification tokens and accumulated rate limits.
- `hub-live/src/jobs/stable.ts:195–198` reruns selected whole shards on the
  same stack; line 204 calls confirmation without the staged environment.
- `confirm/e2e-army.log` reports `NO_TESTS`, not a successful confirmation.
- `hub-live/ops/verify/e2e-army/tests/lib.ts:19` defaults the seed to
  `nql-e2e-army-1`. The saved log does NOT record `E2E_ARMY_SEED`; its actual
  value and equality across invocations are unverified. Prior claims of a
  proven identical seed were too strong. Capture the non-secret effective seed
  and invocation identity in the authorized hub regression run.

Required follow-up: an authorized hub lane must isolate repeat-run account data,
select only quota-affected tests, propagate the staged environment through every
confirmation caller, add regression coverage, then run the original feature on
an isolated fresh stack and record both tested SHAs. No full local FlowLine build,
hub modification, secret access, push or PR change was performed here.

Blocking question for dispatch: provide an authorized writable hub implementation
lane and its verification scope. This is the previously denied authorization,
not an unanswered product requirement. Do not redispatch this FlowLine-only lane
as if documentation could satisfy the release gate.
