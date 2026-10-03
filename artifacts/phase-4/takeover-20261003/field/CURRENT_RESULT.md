# Field validation v2 — current result

**Status: FAIL (8/10); issue #6 OPEN.** Root completed a real API/worker run using synthetic sample requests and the independent v2 scorer on source `9d76c84342bcd1c6f8b6f79a2f200759c02e130c`. The run is in [`runs/takeover-6313141399/results.json`](runs/takeover-6313141399/results.json); its sanitized operator record is [`operator-6313141399.json`](operator-6313141399.json). The packet digest in the run is `b4a278f96c2d1acbf8d4fb0a0ce0b465fc05276e6ac76b5111e27fbd5fdf1d4f`.

| Check | Recorded result |
| --- | --- |
| Ten packet requests | 8 passed, 2 failed |
| VP-05 and VP-06 | Both failed only `ownerDecisionQualified`; the generated draft names a team member but does not explicitly give the owner the decision on the current request |
| Persisted VP-01 duplicate comparison | All seven checks passed, including unchanged count, keys and values after reprocessing |
| Approval gate and replay | All ten checks passed, including no preapproval outbox entry, bound sample text and recipient, executed review, one persisted sample outbox entry and refused replay |
| Persisted follow-up records | Exactly one scoped record for each of ten requests |
| Overall scorer | `passed: false`; no acceptance claim |

The operator used an isolated `flowline_test_field_takeover_6313141399` database and dedicated port `54520`. The sanitized record reports matching field identity, one ready worker, migration exit 0, and API suite exit 1 from the scored failures. It also reports owned processes stopped and the database retained. The run recorded `dirty: true`: Next-generated `tsconfig` includes and new reports were present at runtime; root restored only the verified generated includes from HEAD, and product code was unchanged. The result is tied to the recorded source SHA with this dirty-tree limitation.

Earlier operator startup attempts remain preserved as separate `operator-*.json` files. Root identified an initial temporary-operator `Node fetch.ok()` call error and an omitted test `FLOWLINE_COMPANY_BUILDER=on` flag that yielded 404; both were corrected only in the temporary operator. No product or harness assertion was weakened. Raw diagnostics were moved to TEMP outside committed evidence.

The earlier [`focused-checks.json`](focused-checks.json) (52 tests) and [`postreview-focused-checks.json`](postreview-focused-checks.json) (61 tests) are historical records. Root reports 63 focused tests after two further guard cases and full CI run `37081798792` passing all six checks at the source SHA. These checks establish harness and CI behavior; the recorded product result remains **8/10 FAIL**.

**Limits:** This was a sample-only API/worker and local outbox run. It does not prove Gmail delivery, a refund, cancellation, payment, browser journey, human acceptance, or a live provider connection. FC-1/FC-3/FC-4 and a held-out packet were not exercised. Issue #6 covers harness scoring and remains open because PR #10 is draft, unreviewed by CodeRabbit and unmerged. The observed product qualification defects are separate findings; a product fix and fresh recorded run are required before reconsidering product acceptance.
