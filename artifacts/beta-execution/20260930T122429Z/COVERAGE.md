# Candidate coverage mapping

CURRENT 2026-09-30 continuation: [CP23_CONTINUATION.md](CP23_CONTINUATION.md) supersedes the cp21/account-waiting statements below. Latest cp23 source changes and recovery failure/correction require fresh gates and Claude review; current local runtime is still cp21. The material below is retained historical evidence.

Checkpoint 21: `5d2a8e1dd765058ccd6b474026e5e5e5452efa89`; checkpoint 20 product/E2E inputs are byte-identical. Only tests/unit/dialog-focus.test.ts differs among execution inputs. `candidate-identity.json` and `checkpoint-21.json` record all ten object hashes. Real index and branch remain unchanged.

| Coverage | Actual run / verdict | Limits |
|---|---|---|
| Chromium Windows cp20 | 114/114, BUILD_ID DbqJVlz8sc6rPLGHdQZ2i | Retained pre-session gate, one worker; not freshly rerun here |
| Firefox Linux cp20 | 50/50, BUILD_ID 0mnDzy6guQ84p-f5plXLf | Docker engine selection; no native Windows Firefox claim |
| WebKit Linux cp20 | 50/50, BUILD_ID Zkibi65ZQDNzenE7FRDz1 | Docker engine selection; no Safari claim |
| Current non-browser | lint/typecheck; unit 388/388, contract 465/465, integration 460/460; evidence scan zero hits | Current tests tree, product/E2E same cp20; test doubles only; interrupted launch records preserved |
| Exhaustive journey 9 | 225 PASS plus one preserved wrong-launcher attempt subsequently corrected | E/F cp16 + G cp18 + H cp20 mapped by source blobs; not all sessions rerun on cp20/21 |
| Journeys 1–8, 10, M01/M02/Q05 and disposable admin | Retained cp12 evidence; relevant changes covered by later journey-9 sessions and cumulative gate | Earlier exploratory journeys are not claimed freshly replayed on cp21 |
| Visual | Retained prior design comparison; no new screenshots evaluated by this executor | Claude visual review pending; no Ollama/local model review required |
| Key remediation | Named non-disposable reuse audit; two new test DBs/independent keys; application crypto/persistence checks; old-key rejection; 2,592 reachable text blobs zero affected-key hits | Phase-4 source uses v1; hub uses v2 with AAD; platform ring checked separately with candidate crypto; binary images/zips and unreachable transcripts excluded |
| Browser setup | Actual Chrome 154.0.8037.92, visible Playwright 1.63.0, dedicated ignored profile | No app/external verification claim. Idle for owner login, recording off. No personal profile |
| External / Pi / cloud AI | NOT RUN / BLOCKED | No approved accounts/domain/host/consent/spend; old flowline:e42667d laptop results do not certify new candidate or Pi |

Platform-ring rejection in the remediation script uses the prior configured platform key if present, otherwise a generated wrong-key control; it is not proof of exposure of a prior platform key. Workspace compromised-key denial and persisted cross-environment key isolation are separately verified. The Phase-4 fixture consumer remains v1, so no AAD isolation claim is made for it.

Claude review is outstanding. No executor verification is labeled independent. No skipped or flaky test is counted as passing. The prior wrappers rebuilt on each browser invocation (different BUILD_IDs); future new browser gates must follow the binding build-once → readiness → Chromium → Firefox → WebKit rule rather than replaying that older launcher behavior.
