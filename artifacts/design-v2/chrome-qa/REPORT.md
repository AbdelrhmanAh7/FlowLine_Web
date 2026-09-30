# Independent Chrome QA — design-v2

**Result: FAIL — five reproduced P2 application defects (DV2-Q01–Q05).** Core workflow, test-double integration, permissions and admin journeys worked in the checks below. This is **agent-driven exploratory testing in real Google Chrome**, not human UAT and not the automated Playwright suite. No automated suite was run or counted.

**Cleanup is BLOCKED:** Chrome is closed, but automatic approval review rejected removal of the two reviewer-created profiles. See the cleanup section before archiving or sharing this directory.

## Environment and identity

| Item | Recorded value |
|---|---|
| Date | 2026-09-29, approximately 19:19–19:48 UTC / 22:19–22:48 Africa/Cairo |
| Target | `http://localhost:3100`, existing test stack, production build |
| Health before and after | `GET /api/health?require=worker`: `revision=dev`, schemaVersion 20, DB `ok`, worker `ok` |
| Checkpoint | `refs/checkpoints/design-v2-closeout-4` = `85516ef5dd8f4fa6b128ebf9a3a4a9e7fb97abfc` |
| Checkpoint tree | `435c3db7af882dce0f3ac24530c02d0ad6b889ec` |
| HEAD | `fb563e517263800062adf5d5a31af672ebcc4da3` |
| `.next-test/BUILD_ID` | `9GR7x_ACnOcU1IqjUYMCL` |
| Browser | Google Chrome **153.0.8010.54**, confirmed by CDP `Browser.getVersion` and executable ProductVersion |
| Executable | `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| Launch | Playwright `channel: 'chrome'`, explicit installed executable, **headless: false** |
| Profiles | Fresh dedicated profiles under this directory's `.profile/`; never the owner's profile |
| Tools | Persistent Node REPL, repository `@playwright/test`, CDP, screenshots, read-only shell/git/file inspection, prescribed TOTP helper and admin bootstrap wrapper |
| Providers | **TEST DOUBLES ONLY:** SaaS/OAuth `127.0.0.1:4010`, AI `127.0.0.1:4011`. No live-provider verification or paid calls |

Full browser metadata: [environment.json](environment.json). Measurements: [measurements.json](measurements.json). Console/network inventory: [browser-inventory.json](browser-inventory.json).

The checkpoint, HEAD and BUILD_ID were checked before and after testing and remained unchanged. Product, test and script content was checked against the checkpoint at the end. Nine files represented as untracked in this worktree were compared by Git blob hash and matched the checkpoint. The reviewer did not modify product code, tests, configuration files, servers or containers, and did not commit.

The default Chrome channel lookup initially failed because the tool runtime lacked the expected ProgramFiles resolution. Supplying the installed Chrome executable fixed it; Chromium was not substituted. An early 30-second tool timeout reset the initial browser runtime. That browser was gone before the second was launched; its screenshots survived, but its console inventory did not. Subsequent actions used bounded locator timeouts in one persistent Chrome session. A logout/navigation race also produced a reviewer-side `ERR_ABORTED`; navigation succeeded after logout settled. Neither was filed as a product defect.

## Coverage

PASS applies to the stated checks, not every possible permutation. FAIL identifies a reproduced defect within the journey. Unexercised extensions are listed separately below.

| Brief journey | Status | Observed result and evidence |
|---|---|---|
| 1. Sign-up, sign-in, verification, sign-out; Arabic/English; themes | **PASS** | Fresh synthetic accounts were created through the UI, verified by opening the test-outbox link and pressing Verify, and signed in/out. Arabic sign-in and Arabic TOTP worked. Both auth forms were checked at 1440, 1024, 768, 767, 375 and 360 without measured document overflow. Light/Dark worked; System followed emulated OS appearance. [Masked sign-up](screenshots/signup-en-masked.png), [Arabic 360](screenshots/signup-ar-360.png), [English sign-in 360](screenshots/signin-en-360.png), [Arabic sign-in 768](screenshots/signin-ar-768.png), [verification](screenshots/verification-required.png). |
| 2. Onboarding and dashboard | **PASS** | Inspected steps 1–3, goal selection and skip-to-empty-dashboard. A separate fresh account completed the suggested-template path and ran Order Totals Digest successfully: 4 executed steps, one untaken branch skipped, output total 298.5. Empty and populated dashboards inspected; pending approval discoverable. [Empty](screenshots/dashboard-empty.png), [onboarding final](screenshots/onboarding-final.png), [created template](screenshots/onboarding-created-template.png), [template success](screenshots/onboarding-template-success.png), [populated/pending](screenshots/dashboard-populated-pending.png). |
| 3. Workflow lifecycle | **PASS** | Dragged Manual trigger and JSON transform from the palette; dragged connection handles. Configured JSONata `{"answer": 6 * 7, "review": "chrome"}`. Autosave/refresh preserved it; successful step output contained 42. Inspected input/output/log tabs. Error tab was disabled with “This step didn't fail.” Added output nodes and inspected final run output. [Persisted expression](screenshots/jsonata-persisted.png), [success inspector](screenshots/run-inspector-success.png), [input](screenshots/inspector-input.png), [log](screenshots/inspector-log.png), [local output](screenshots/unaffected-local-success-during-revocation.png). |
| 4. Invalid flow, failure, approval and reconnect | **FAIL** | Functional checks passed: missing trigger blocked Run with a reason; injected fake AI 401 failed clearly; approval waited and was rediscovered from dashboard; approval completed once and decision controls disappeared. Revocation paused the Sheets flow while a separate local flow still succeeded. Fake OAuth reconnect cleared the banner and did not add a run (13 before/after final reconnect). **DV2-Q01:** generated approval/error messages remained English in Arabic. [Invalid flow](screenshots/invalid-flow-blocked.png), [401](screenshots/ai-fault-401.png), [pending](screenshots/approval-waiting.png), [decision controls removed](screenshots/approval-once-controls-removed.png), [banner](screenshots/reconnect-banner.png), [unaffected flow](screenshots/unaffected-local-success-during-revocation.png), [no auto-run](screenshots/reconnect-no-auto-run-final.png). |
| 5. Permissions | **PASS** | Created and invited separate Editor/Viewer identities through UI. Viewer inspected flows and pending approval; edit/run/publish/Copilot/approve/reject/cancel controls were disabled with reasons. Editor edit survived refresh. Owner removed Viewer; reopening the flow returned HTTP 404. Before invitation, the separate-workspace account also received 404. [Viewer builder](screenshots/viewer-builder-disabled.png), [Viewer approval](screenshots/viewer-approval-disabled.png), [Editor persistence](screenshots/editor-edit-persisted.png), [outsider 404](screenshots/outsider-flow-404.png), [removed-member 404](screenshots/removed-member-404.png). |
| 6. AI providers — **test double only** | **PASS** | UI connect/check/save discovered five fake models; picker search narrowed results. Saved synthetic raw key absent from HTML, local/session storage and URL. Explicit model selection ran successfully after opting into unknown-price calls in this synthetic workspace; before opt-in the spending cap correctly blocked it. Inspector showed `Cost (USD)` / `التكلفة (USD)` and unknown cost. Replacement displayed affected items and saved a masked replacement. Disconnect caused a clear failure. Model-discovery 401 showed rejection and did not save a connection. Other workspace had no connections/models to select and no access to the original workspace. [Masked connection](screenshots/ai-connection-masked.png), [unknown-cost block](screenshots/ai-unknown-cost-blocked.png), [success cost](screenshots/ai-success-unknown-cost.png), [Arabic cost](screenshots/ai-cost-ar.png), [replacement preview](screenshots/ai-replace-impact.png), [invalid key](screenshots/ai-invalid-discovery-401.png), [disconnect](screenshots/ai-disconnected-failure.png), [isolation](screenshots/other-workspace-no-ai-connections.png). |
| 7. Copilot — **test double only** | **PASS** | Invalid proposal explained missing output/action and offered no apply action. After an output was added, valid proposal showed node/edge diff and that AI execution was not previewed. Reject preserved four nodes; Approve & save draft added the proposed node, left the flow unpublished and did not run it. Wording was experimental/review-oriented, not a semantic-correctness claim. [Invalid](screenshots/copilot-proposal.png), [diff](screenshots/copilot-valid-diff.png), [draft](screenshots/copilot-approved-draft.png). |
| 8. Admin and settings | **PASS** | Inspected members, general, AI, API keys, OAuth apps, usage/limits, sandbox billing, audit and SSO tabs. Created test API key; reveal screenshot masked; after dismissal/reload no Copy key control returned. Workspace OAuth secret cleared after save and raw value absent from HTML. Usage table had horizontal scrolling inside its phone container. Billing said STRIPE · TEST MODE. SSO enable/test controls explained prerequisites. Non-admin `/admin` returned 404. Existing platform setup required the brief-authorized `--grant`; redeemed code, enrolled TOTP with `e2e/tools/totp.ts`, completed setup, stepped up, saved a synthetic integration credential, and verified it was not shown after reload. [API reveal masked](screenshots/api-key-reveal-masked.png), [persisted key](screenshots/api-key-persisted-masked.png), [OAuth](screenshots/oauth-app-write-only.png), [usage phone](screenshots/usage-375.png), [billing](screenshots/billing-sandbox.png), [audit](screenshots/audit-log.png), [SSO](screenshots/sso.png), [non-admin](screenshots/nonadmin-404.png), [admin step-up](screenshots/admin-stepup.png), [saved credential](screenshots/admin-credential-saved-masked.png). |
| 9. Accessibility and interaction | **FAIL** | Named AI connection dialog trapped Tab; focused input had a visible accent ring. Typing `/` and Ctrl+Z in flow name did not open the palette. Disabled Copilot reason was available by hover, focus description and touch/persistent mobile text. Reduced-motion landing had zero running animations, visible headings and footer at the actual document end. Sampled timed CSS motion did not exceed 300 ms; hero CTA hover did not lift. **DV2-Q02:** Escape lost dialog return focus. **DV2-Q05:** phone run overlay lacked dialog semantics/focus trap and ignored Escape. [Visible focus](screenshots/dialog-visible-focus.png), [focus loss](screenshots/q02-dialog-focus-lost.png), [touch explanation](screenshots/mobile-disabled-tap.png), [mobile overlay](screenshots/q05-mobile-inspector-focus-behind-overlay.png), [reduced-motion footer](screenshots/landing-ar-reduced-bottom.png). |
| 10. Responsive main screens | **FAIL** | Dashboard, builder, run inspector and usage/settings checked at 1440, 1024, 768, 767, 375; authentication also 360. These sampled main screens had no measured document overflow. **DV2-Q03:** English landing at 768 had document width 832, clipping the primary header CTA. **DV2-Q04:** phone landing offered no language/theme controls or replacement menu. [Dashboard Arabic phone](screenshots/dashboard-ar-375.png), [builder tablet](screenshots/builder-1024.png), [inspector phone](screenshots/inspector-375.png), [overflow](screenshots/q03-landing-en-768-overflow.png), [missing switchers](screenshots/q04-mobile-landing-missing-switchers.png). |
| 11. Phone monitor-only | **PASS** | Persistent editing-disabled explanation; flow name readOnly; Copilot disabled with reason; no palette editing. Run remained usable, and fake Sheets run #9 succeeded from 375px. [Phone success](screenshots/mobile-run-success.png), [disabled touch](screenshots/mobile-disabled-tap.png). |
| 12. Public pages | **FAIL** | Landing reviewed Arabic/English, light/dark, motion on/off, requested widths plus 360. Reduced-motion content was static and reachable, without the animation scroll spacer (Arabic desktop document height 2294 versus 8090 with motion on). Motion-on scroll scenes visually inspected. **DV2-Q03/Q04** remain. [Arabic reduced footer](screenshots/landing-ar-reduced-bottom.png), [Arabic motion scene](screenshots/landing-motion-ar-flow.png), [English dark motion](screenshots/landing-en-dark-motion-flow.png), [768 overflow](screenshots/q03-landing-en-768-overflow.png). |

## Findings

All five findings were reproduced in this browser session. Full steps, expected/actual results and build identity are appended to [BUGS.md](../BUGS.md).

| ID | Severity | Classification | Finding |
|---|---|---|---|
| DV2-Q01 | P2 | application defect | System-generated approval/error text remains English in Arabic run UI |
| DV2-Q02 | P2 | application defect | AI connection dialog does not restore trigger focus after Escape |
| DV2-Q03 | P2 | application defect | English landing header overflows at 768px and clips Start free |
| DV2-Q04 | P2 | application defect | Phone landing hides language/theme switchers without an alternative |
| DV2-Q05 | P2 | application defect | Mobile inspector overlay lacks modal semantics, keyboard containment and Escape dismissal |

Severity totals: **P0 0, P1 0, P2 5, P3 0.** These totals do not assert absence of defects outside the tested paths.

## Console and network inventory

The recovered Chrome session captured five HTTP failures and six console resource-error messages. No `pageerror`, hydration error or warning was captured in that session. The first session's console inventory was lost on tool reset.

| Observation | Interpretation |
|---|---|
| HTTP 400, `/api/workspaces/<synthetic-workspace>/ai/connections` | Expected: deliberately injected model-list 401; UI rejected the key without saving it |
| HTTP 404, `/admin` | Expected: non-admin access check |
| HTTP 404, original workspace flow, before invitation | Expected: outsider access denied |
| HTTP 404, original workspace flow, after removal | Expected: revoked membership denied |
| HTTP 404, `/api/platform/setup` | Unresolved observation during setup lifecycle. Setup/grant/TOTP/step-up completed successfully. No user-visible defect reproduced; not filed as an application defect |
| One initial console-only 404 without associated recorded response URL | Unresolved attribution; not evidence of a reproduced product defect |
| Remaining console resource errors | Correspond to the recorded 400/404 responses above |

Server-side worker/provider errors were observed through the run UI, not as direct browser 401s. No browser 5xx was recorded. Read-only outbox/health/access probes are additional to the browser response listener.

## Fault controls and test-data changes

- Injected AI `401`, `times:1`, through the brief's fake control. The default fault targets chat: it produced the failing AI run. A second default-path injection did **not** invalidate model discovery during rotation. After inspecting only the fake's source (not configuration), the discovery check used `path:"models"` on the same control and reproduced the expected validation error. The second default fault was replaced by the targeted fault; no pending injected fault was intentionally left.
- Revoked fake account `a` twice through the authorized control. Reconnected through the local fake OAuth UI after both tests. The second test explicitly ran an unrelated local flow successfully while Sheets was paused.
- Four fresh synthetic `@flowline-qa.test` identities were created: owner/admin, Editor, Viewer with a separate workspace, and a final complete-onboarding account. Owner workspace contains three QA flows and 13 runs; the onboarding workspace has its template and one successful run. Viewer was removed from the owner workspace. Both tested approvals were resolved.
- Synthetic test API key, fake AI connections, workspace OAuth app and a fake GitHub integration credential were created through the UI. No real credentials were used. The first AI connection is intentionally disconnected; its failure remains inspectable. The owner was granted platform-admin access in the test installation as required by the brief.
- The bootstrap wrapper loaded the test environment internally as explicitly prescribed; the reviewer did not open, print, copy or scan `.env*` files. One-time codes/TOTP and synthetic credential values were processed in memory and never included in reports or tool output. Screenshots mask secret inputs and the reveal-once key.

## What was not covered / limits

- **No live SaaS, live OAuth, real AI provider, paid inference, production billing or production deployment. Every provider result here is a TEST DOUBLE result.**
- No Firefox, WebKit, Chromium substitution, automated suite, human UAT, screen-reader session, physical phone or assistive hardware testing.
- No exhaustive cross-product of every page, theme, locale, viewport and transient state. Main-screen dimensions were sampled as listed; agents, knowledge, template catalog and design-system pages were not exhaustively reviewed.
- SSO was inspected in its unconfigured state; an external IdP sign-in was not exercised. Billing test-mode state/configured prices were inspected; no checkout/subscription was initiated.
- AI checks used the fake OpenAI route, not every catalog provider/protocol. No paid-test control was invoked. Tenant checks used UI navigation/read-only access, not forged mutation requests.
- Approval “once” was checked through completed state, removed decision controls and audit evidence, not concurrent/replayed API mutations. Shortcuts and dialogs were sampled, not exhaustively audited. The hover-motion check sampled the public primary CTA; scroll-linked motion is not a timed CSS transition.
- The fresh-install bootstrap path was unavailable because setup was already completed; the explicitly permitted `--grant` path was tested instead.
- No trace/HAR, cookies, raw outbox payloads, TOTP secret, password or raw provider key was written to QA evidence. Browser-profile cleanup remains blocked as described below; profiles are not sanitized evidence.

## Cleanup — BLOCKED by automatic approval review

The reviewer closed its Chrome context and verified no Chrome process command line referenced `chrome-qa`. It did not stop any server/container or owner browser.

Automatic approval review rejected profile deletion with the exact reason **“blocked by policy”**. Both the checked `.profile` cleanup and the narrower deletion of the two known reviewer-created directories were rejected. No alternative runtime was used to bypass the rejection.

The following remain on disk and may contain browser session data. **Do not commit, archive or share them as QA evidence.**

- `.profile/review-1790709578743/`
- `.profile/retry-1790709689355/`

The brief's requirement to delete the temporary profile is therefore **not fulfilled**. Screenshots and the Markdown/JSON evidence are separate from these profiles. No product changes were made to work around this limitation.
