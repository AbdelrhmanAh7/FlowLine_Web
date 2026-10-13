# Follow-ups from issue #180 (PR #186)

Found in the final review of PR #186. I left them out to keep that PR to one task of about 300 changed lines. None of them is a regression: `main` shows the same generic message in these cases. I propose each as a separate issue.

1. **Session-level refusals in the copy editor.**
   - A save or publish that fails with `PLATFORM_REAUTH_REQUIRED` (401), `PLATFORM_MFA_REQUIRED` (403), `CSRF_TOKEN_INVALID` (403) or `RATE_LIMITED` (429) shows the generic "Could not save the draft. Check the text and try again." Retrying cannot fix the first two.
   - Show their existing `errors.*` texts instead, and never the server's own message. That needs a "translated text or null" helper in `src/i18n/errors.ts`, because `apiErrorMessage` falls back to the server text for codes it does not know.
   - After `CSRF_TOKEN_INVALID`, also re-read `/api/platform/me`, which is where a fresh token comes from.
   - The admin-session alert has the same gap when `/api/platform/me` itself fails with one of these codes.
2. **What the editor shows after a conflict.**
   - After `REVISION_CONFLICT` the editor reloads the copy but keeps the admin's unsaved text in the field, so the other change to that key stays hidden, and saving again replaces it.
   - Decide the UX, for example: show the latest saved text next to the unsaved edit, or offer "keep mine" and "take the latest".
3. **Browser-level coverage of the editor's error display.**
   - The hub's e2e-army stack has no platform admin, so `e2e-army/180-admin-copy-errors.e2e.ts` only covers what a non-admin gets.
   - `e2e/admin-panel.spec.ts` already onboards a real admin and saves in this editor. Add cases there that answer a save with a 409, a 5xx and an aborted request (`page.route`), and check the alert, the reload and the Retry state.
   - Also assert `error.code === "REVISION_CONFLICT"` in `tests/integration/platform-copy.test.ts`. The client's message mapping relies on that code.
