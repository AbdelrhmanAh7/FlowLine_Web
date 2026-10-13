# #165 follow-ups (not in this PR)

This PR adds a per-connection, per-action send cap for side-effecting integration actions. Approval gating already existed (`requireApproval` / `sensitive`). These are left for separate issues:

1. Audit view: show `outbound_capped` run events in the run audit UI (copy and i18n in `messages/ar.json` and `messages/en.json`).
2. Per-destination caps: the current key is connection plus action, not the destination host or recipient.
3. Node-config UI: expose `maxSendsPerMinute` in the flow editor (it is only settable through the graph JSON today).
4. Approval for high-volume broadcasts: a threshold-based approval rule beyond the existing per-action `sensitive` flag.
