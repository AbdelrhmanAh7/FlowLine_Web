# Local candidate reviews — round 1

These are independent worker/lead source reviews, **not CodeRabbit reviews or CI gates**. The lead pushed the reviewed snapshots as new no-PR backup branches; those pushes are not CI or CodeRabbit gates. A changed candidate needs another exact-diff review. Root is a different agent from each listed worker author. Every candidate is based on main `9641ad1` unless noted.

| Candidate | Reviewer | Exact reviewed diff SHA256 | Outcome |
|---|---|---|---|
| Lighthouse | Root lead (sol high), author routine worker | `a1bad03526c2233f14f38a143844e818a89a2b044a6c43e5dbb2eded95cb2065` | Approved locally after removing English additive collection, which mixed prior locale reports. Syntax only; actual Lighthouse CI not run. |
| P3 polish | Root lead (sol high), author routine worker | `cdcddbb724fdab2d0190192c37a8ebc04829eaf3e7a96f0d4568d6a80d2489a6` | Approved locally. Existing generated token pipeline stays consistent; AI errors map through identical localized catalogs; changed recognized-code assertion has explicit replacement coverage. 89 focused units; browser verification remains absent. |
| Copilot benchmark | Root lead (sol high), author routine worker | `869aa3568ecd1b33e6bd8f6d150ea370cbbaf499a97b88b7529e0bd8da14eb71` | Approved locally. Aggregate cap/preflight, one provider attempt and fake-vs-hosted distinction inspected. Three scorer units; benchmark execution/live quality not run. |
| HubSpot | Root lead (sol high), author routine worker | `098ec18ac579d05375a15761eda93af16639e54288f6028cad971ed87c6cf22d` | Approved locally. Read-only pagination, bounded schema, fixed provider errors and email overwrite ordering inspected. Unit31/contract13 plus previously omitted listener regressions31+1 pass. Real account/DB/E2E not verified. |
| Auth H1/H2/M7 + callback races | Product worker (sol high), author security worker | `44c128ad07877f907677851d6a80a5d9e8d4bdcc6203cd88a2fee6622c7dd47f` | Approved locally, now commit `08355ae423aa91c7d2b6f106878603d3c2f98ecb`. Root found stale authority and removed-member reprovisioning; five regressions/final fence were added before independent approval. Units19/integration33, typecheck/lint pass; H3 separate. |
| Product retry/copy/pilot drafts | Root lead (sol high), author product worker | `632bae80e00ab69340586338f7a6e7e978d51a9b42b1f229d30607927832f5ee` | Approved locally. Dedupe bound to source/step/revision/request, one execution event, explicit owner-decision note and separate provider charge disclosures. Draft terms/plan are proposals, not installed policies or entitlements. 193 focused tests +10 deterministic packet requests; actual HTTP/browser/provider acceptance absent. |

Lead docs were independently inspected by the product worker. Corrected the exact plan page to `?tab=plan` and clarified that only **real** provider requests were absent (local doubles ran). Final ledger/evidence metadata will receive another review before local finalization.

Preservation observation: another actor finished rebasing the original `FL-wt-sec-auth` during this round, ending at H3 commit `8fa9c19`. Neither root nor these workers wrote to that original worktree. Follow-on H3 work uses its immutable commit in a fresh worktree; it never resets or aborts the original. All other inherited work remains preserved.

## Subsequent exact-snapshot reviews

| Candidate | Independent reviewer | Exact binary diff SHA256 | Scope/outcome |
|---|---|---|---|
| Report | Root sol high | a670fc2e65e73389b1fe0583176eaf41c48fd760085a9cfdbd5512b48fce7a61 | bc46dc2; historical source report, approved |
| Redaction | Root sol high | 3b0b7255df0e38df1523b6840f0c7fadc9ff4722c3b8d9d72a608d11dc36b289 | 09be0b3;34 units, billing19 later combined; approved |
| Runtime/pins | Root sol high | 04b60adcf8b723b1e78383a48ff30c20a0d9f309acfe55664da31d788bc15ca3 | 56f96d9;2 source policy units; full app build pending; approved |
| Resource bounds | Root sol high | 653e49bea7653ee9c6fe37a240aeda711ee27574a54c00949b5fda3d82f4265c | a9f7597;54 units+4 DB; partialM4/M5; approved |
| Federated MFA | Root sol high | 34b122d37a22f15f4e734d0e36030bd9002327b85ccada457ee5476f19edc8a0 | 2c85f05;28 units+63 DB; includes root revoked-initiator fix; approved |
| Monitor | Security worker sol high | fad123fef2c35c545ca62e4018927634b45ead49632567ba8e41dbc2e9cd481c | 67d3bed;17 units/tsc/lint; actual alerts unverified; approved |
| Body deadline | Security and product workers sol high | 0c9a441e8a1f8f8ac2f74583c514cc8a026774460b63899e311c0a6bb04a834f | 9d7f0c4;31 units; actual proxy unverified; approved |
| Uncertain5xx | Root sol high | 66e552d2cec58c9050be5845d50c18b536d02eaee7e4a5dcd30f6315437dc660 | 485a4f8;28 DB+27 units; approved. Main portb854d2c has identical source patch-id b0f276dd4d2c19cff174475e73d8697468a12e9b; no source edits |
| Pi alignment | Product worker sol high | a800c871ac18ec92b666103826a1f82c41a221834733b31858dd1d368745a31c | f1921e5; cached pinned Caddy validate/compose parse; no deploy; approved |
| Tool roster/guide | Root sol high | 36a29afa47dc000a5440a8322922592a27b2d511979ca6f6078e7ceed310bf6b | 2870967; bounded tool probes, qualified provider/privacy wording; approved |
| L1 loader prune | Root sol high | c7e2ba7a317e911dd17b0cb3508c6e1896fc6bbde0bf82a453a57a1c8c4f28db | dd840db; unused version-scoped dependency removal, own graph proof; full build pending; approved |
| M5 raw-file admission | Root sol high | 1b0700bb1fecc5e29694898521698feb126f440a16058a80168543af84bd132f | 360078e;11 DB+24 units/tsc/lint; actual-byte lock/ACL/rollback inspected; partialM5; approved |

These are source approvals by a different agent from the author. Root authored the monitor/body/deploy follow-ups and received separate worker reviews. Existing draft beta recovery source was independently inspected by product worker: binary diff SHA25655fdd2933ab7153b91276afb17c281ab64140842f9e4ffc1d66b4e5368ac3b79; no current deployed/build certification. Combined manual conflict resolutions retain disjoint report notes and all localized/auth codes; final source/driver review recorded separately at closeout.

L3 partial environment slice: root sol high independently approved raw binary diff `833df3a1c25c7937a933a66c6f2d1cb8598b1ba5b3ff33e8d11155525276d5d8`, now571d1c6. Actual child11 cases/tsc/lint passed after real Windows fixes; no OS authority confinement claim.

Combined source1fff962 was independently approved by security sol high: exact M5 executable files match360078e; catalogs retain disjoint BODY_READ_TIMEOUT and3UPLOAD codes. Harness review rejected inherited environment and unverifiable cleanup; corrections are retained. Node22 crypto helper independently approved by security worker, exact file SHA256173bdcdb3afef4f32cef65ef1e863a43d1be8f21d57dacaf144279b42e5f8354. It is crypto-only execution, not an app-build acceptance. Final harness/docs hashes will be recorded after freeze.

Final queue slice root sol high approved whole binary SHA256`6dc4f2a97a58146e1f94cc9276f7ca408b754b24d0a7ecb24ba6815a9d8d3c51`, commit e437af2; count `67d98f69f3bfc8ff7a9b901fef2e6b3ad762951afa727ba2a81a1770789e50ad`, commit0bf0a49; chunk `81f9694d48254294eb44e6d27c9f0b6a4889c1b1db1dea4f03fe71182e09f347`, commitc673956. Root is different agent from each worker author.

Security sol high independently APPROVED final combined source4a907b84c630388befe77044bf18c318826737ed: exact helper blobs, claim/deletion fences and disjoint catalog8-code unions. Final verifier file SHA256`108e1f1df183534571bb2117809797f2c058b68d7e36a777bf4350db3b76be09` approved; final162/162 run exercises it with clean/unchanged source and verified cleanup. Primary documentation reporting corrections are reviewed at final frozen hash before publication, not a CI gate.

Closeout approvals: product sol high independently approved coordinator checkpoint binary SHA256`91d7b3f2cd7ed51ddc11f99459689f07ec6eccf4b4fef04665314bf24bec6871` before commit1865047. Security sol high independently approved combined artifact-only binary SHA256`fe794cf7b03222d97494aba2829e7d0619486cb659b7b97e06fa0280359dc87f` before evidence commitde79ab2; verifier Git LF SHA256`ce99924e1378d7dcef033643fcaab42b59fb2aa5fbb82d13e952b1b3c7280d99` differs from executed file108e1f only by CRLF normalization, independently checked. Final closeout metadata is reviewed as a separate documentation-only delta.
