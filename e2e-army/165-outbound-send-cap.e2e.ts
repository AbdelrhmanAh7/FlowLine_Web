// Issue #165 AC1: an anonymous caller can't start a run that would send outbound messages (the per-connection send cap sits
// behind authentication). Request-level (no model). The cap itself (SEND_RATE_LIMITED after the limit, refused calls not
// counted before approval) is proven in tests/integration/p2-actions.test.ts, since the throwaway stack has no seeded
// connection to send through.
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("@issue-165 AC1: an anonymous caller cannot start a run that sends outbound messages", { tags: ["feat:fl-integration-actions", "lvl:api"] }, async ({ app }) => {
  const res = await fetch(new URL("/api/flows/00000000-0000-4000-8000-000000000000/runs", app.baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect([401, 403, 404]).toContain(res.status);
  const text = await res.text();
  expect(text).not.toContain("SEND_RATE_LIMITED");
  expect(text).not.toContain("runId");
});
