# Copilot benchmark runner

`scripts/copilot-benchmark.mts` scores the original frozen English 12-case set from `scripts/diag/copilot-benchmark.mts`. It compares that definition byte for byte with the existing hub copy before running. Do not edit the cases or tune Copilot on their results.

Run it from the repository root with a process environment that already supplies the database URL and workspace encryption key. The runner does not load `.env` files or accept API keys. Create the workspace AI connection in Settings → AI Providers first, then supply its IDs:

```text
pnpm -s tsx scripts/copilot-benchmark.mts --workspace <workspace-uuid> --actor <verified-owner-user-id> --connection <connection-uuid> --provider <provider-id> --model <model-id> --max-usd <aggregate-cap>
```

The owner and connection are checked against the same workspace. The pinned route uses one model, one generation per supported case, no repair round, no transport retry, and no policy fallback. The runner preflights the maximum estimated cost of all eleven potential calls against `--max-usd` and uses the hub's normal ledger for each call. A route with unknown pricing is refused before inference. `--allow-unknown-cost` permits unknown pricing **only** with the local AI test double under `FLOWLINE_ENV=test`; unknown-priced real calls cannot satisfy a hard USD cap.

The report is written to a new `artifacts/copilot-benchmark/<timestamp>-<id>/` directory as `report.json` and `report.md`, including partial results after a stop. Correctness, safe refusal, graph structure, node selection, order, parameters, result checks, latency and cost are separate. Supported tasks refused by the model are incorrect. The target is at least 10/12; a result from the fake server does not certify hosted-model quality. External actions receive static checks only, and graph preview runs only local steps. The runner never saves or publishes a proposal.
