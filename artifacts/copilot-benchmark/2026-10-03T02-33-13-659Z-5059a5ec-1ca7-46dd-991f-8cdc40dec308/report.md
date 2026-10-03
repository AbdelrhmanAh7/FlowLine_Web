# Copilot benchmark

Verdict: **EN_TARGET_FAIL**
Correct: 2/12; target: ≥10/12
Provider/model: openai/fake-gpt-mini
Frozen cases SHA-256: 270c727a3eb85fa7c2e4250974e62145738e1b79350820d1d53f0cfe5d2d0e8b
Cost: unknown; cap: $0.000000
Latency: 322 ms

| Dimension | Passed | Applicable |
|---|---:|---:|
| structure | 1 | 11 |
| nodeSelection | 1 | 11 |
| order | 1 | 11 |
| params | 3 | 11 |
| result | 1 | 11 |
| safeRefusal | 12 | 12 |

| Case | Correct | Structure | Safe refusal | Latency ms | Cost µUSD |
|---|---:|---:|---:|---:|---:|
| schedule | false | false | true | 40 | unknown |
| webhook | false | false | true | 25 | unknown |
| gmail | false | false | true | 25 | unknown |
| sheets | false | false | true | 25 | unknown |
| slack | false | false | true | 24 | unknown |
| github | false | false | true | 24 | unknown |
| transform | false | false | true | 26 | unknown |
| branch | false | false | true | 25 | unknown |
| classify | false | false | true | 25 | unknown |
| multistep | false | false | true | 23 | unknown |
| missing | true | n/a | true | 34 | 0 |
| ambiguous | true | true | true | 26 | unknown |

English frozen set only. Local fake results do not establish hosted-model quality.
