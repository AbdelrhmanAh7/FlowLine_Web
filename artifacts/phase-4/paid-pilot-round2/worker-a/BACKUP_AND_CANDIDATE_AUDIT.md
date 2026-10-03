# Worker A backup and candidate audit

19 manifest candidate refs were already exact on GitHub; no redundant pushes. M5 `360078e` was already committed and clean; no duplicate commit. Two reviewed combined snapshots are now remote immutable backups. Mutable combined ref was preserved after its fence detected an external advance.

| Branch | HEAD | Paths | Exact prior binary approval | Remote backup | Disposition |
|---|---|---:|---|---|---|
| `paid-pilot-lighthouse` | `d4eae152b1931f08e1bc1c434eef3ca1f90bbde5` | 4 | False | True | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `paid-pilot-p3` | `c1ba48220fca07da7d9b0be3844732c14e06df20` | 11 | False | True | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `paid-pilot-copilot` | `0c58c4d39a353957973b12036fa6e0ae415799f1` | 12 | False | True | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `paid-pilot-hubspot` | `d5fa51e33fe807a075138e2660074335412df723` | 13 | False | True | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `codex/pilot-security-report-round1` | `bc46dc257e28602e76f82d71b791ade401306643` | 2 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-security-runtime-round1` | `56f96d9ee31498d2a38d1b4516dadcc49b7ac352` | 10 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-security-deps-round1` | `dd840db6bf6f9329f61007152b3bb500b4d66b75` | 5 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-security-redact-round1` | `09be0b3641a139409fad242e9617eec9b0db1975` | 15 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-sandbox-env-round1` | `571d1c62d83d7f01461739ad1ed4e830c04d7796` | 4 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-security-resource-round1` | `a9f7597c90b98128a1cebf46a949810e0586c31d` | 20 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-upload-admission-20261003` | `360078e9d3357267711f006888b578f5a0c6c434` | 21 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-chunk-admission-20261003` | `e437af28b177f9998bca582de7b9752ab7e8429e` | 52 | False | False | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `codex/paid-pilot-body-deadline-20261003` | `9d7f0c426f0d952aa46296a9f32ee5c30b6c263e` | 7 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/pilot-security-auth-round1` | `08355ae423aa91c7d2b6f106878603d3c2f98ecb` | 29 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-federated-mfa-20261003` | `2c85f058c2bf382ee861a2c2007af129705c62c6` | 40 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-monitor-20261003` | `67d3bed6c4524d6fe62bc8f7b43b199114ea2797` | 5 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-safe-retry-main-20261003` | `b854d2c94ce31ec2503c58f6d883dcfd117edcb1` | 17 | False | True | SOURCE PARITY REVIEW: preserved old5xx approval |
| `paid-pilot-tool-roster` | `287096749d8107a7c9a8fe2ce20ec0d77fb861ef` | 2 | True | True | READY FOR LEAD QUEUE: exact prior source approval, remote backup, gates still required |
| `codex/paid-pilot-product-20261003` | `6bfbbe7938854ed05340f971c787d8993afcacc3` | 21 | False | True | BLOCKED NEXT ROUND: independent-review hash provenance mismatch |
| `codex/paid-pilot-deploy-align-20261003` | `f1921e58c5115a8fd3939587db9a713e546f6c04` | 3 | True | True | NO PR: preservation only |
| `codex/paid-pilot-combined-20261003` | `3c10df7731ae06845a40c0b3b8749b84324ca281` | 251 | False | False | NO PR: preservation only |
| `codex/paid-pilot-safe-retry-20261003` | `485a4f854b5df7b1f8d3776bb8c93dfe0b463c82` | 17 | True | True | NO PR: preservation only |
| `codex/paid-pilot-round1-20261003` | `9641ad1e684cad7b84bd2385751ea19b0a9d4060` | 0 | False | False | NO PR: preservation only |

Safe retry standalone and preserved old source patch IDs match `2e4214c6d43bbeb7696654c11e0389d7a7847625`; standalone `b854d2c` is the only PR candidate.

Backup reviews: `COMBINED_TIP_REVIEW.json` (97567e8) and `COMBINED_INDEX_TIP_REVIEW.json` (3c10df7). These are source reviews for backup only. No tests or CI rerun by Worker A.
