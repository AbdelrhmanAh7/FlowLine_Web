// Issues #200 and #179: the error/rejection boundary of route() and of GET /api/platform/copy. Request-level (no model).
//
// #200 AC: route() error responses carry Cache-Control: no-store and Referrer-Policy: no-referrer.
// #179 AC1: GET /api/platform/copy (getCopyEditorState) never leaks state or an internal error to a non-admin caller.
// Both tests hit /api/platform/copy as an anonymous caller and share the feat:fl-platform-admin tag.
//
// The two files were merged into one to stay within the hub's cap of 8 top-level e2e-army/*.e2e.ts files: the hub's
// verify job copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts) and
// the #166 MENA-template test is the ninth file, so tests/unit/e2e-army-tooling.test.ts asserts the repo stays at <= 8.
// Merging keeps every test and tag, with no extra session setup.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "@issue-200 AC1: error responses of route() are no-store and no-referrer",
  { tags: ["feat:fl-platform-admin", "lvl:api"] },
  async ({ app }) => {
    const platform = await fetch(new URL("/api/platform/copy", app.baseUrl));
    expect(platform.status).toBe(404);
    expect(platform.headers.get("cache-control")).toBe("no-store");
    expect(platform.headers.get("referrer-policy")).toBe("no-referrer");

    const me = await fetch(new URL("/api/me", app.baseUrl));
    expect(me.status).toBe(401);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(me.headers.get("referrer-policy")).toBe("no-referrer");
  },
);

test("@issue-179 AC1: an anonymous caller gets 404 and no copy state", { tags: ["feat:fl-platform-admin", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/platform/copy", app.baseUrl));
  expect(res.status).toBe(404);
  const text = await res.text();
  expect(text).not.toContain("draft");
  expect(text).not.toContain("published");
});
