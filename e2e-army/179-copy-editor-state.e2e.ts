// Issue #179: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a caller who is not a
// platform admin. Request-level (no model). The admin success shape and the 503 COPY_STATE_UNAVAILABLE failure mapping are
// proven in tests/unit/platform-copy.test.ts (the throwaway stack has no platform admin / TOTP).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-179 AC1: an anonymous caller gets 404 and no copy state", { tags: ["feat:fl-platform-admin", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/platform/copy", app.baseUrl));
  expect(res.status).toBe(404);
  const text = await res.text();
  expect(text).not.toContain("draft");
  expect(text).not.toContain("published");
});
