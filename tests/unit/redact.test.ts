import { describe, expect, it } from "vitest";
import { redact, redactString, safeErrorText } from "@/server/redact";

describe("redact", () => {
  it("keeps timestamps intact (regression: dates became {} in the run-detail API)", () => {
    const at = new Date("2026-09-27T10:00:00Z");
    const out = redact({ startedAt: at, steps: [{ finishedAt: at }] });
    expect(out.startedAt).toEqual(at);
    expect(JSON.parse(JSON.stringify(out)).steps[0].finishedAt).toBe("2026-09-27T10:00:00.000Z");
  });

  it("masks sensitive keys and token shapes", () => {
    expect(redact({ access_token: "abc", nested: { note: "Bearer abcdefghijkl" } })).toEqual({ access_token: "[REDACTED]", nested: { note: "Bearer [REDACTED]" } });
  });

  it("never logs bound query params (regression: Codex CX2-02 — session token in a Better Auth error)", () => {
    const err = new Error('Failed query: select "id", "token" from "session" where "session"."token" = $1\nparams: s3ss10n-t0ken-value');
    const text = safeErrorText(Object.assign(new Error("Failed to get session"), { cause: err }));
    expect(text).toContain("Failed to get session");
    expect(text).toContain("params: [omitted]");
    expect(text).not.toContain("s3ss10n-t0ken-value");
    expect(redactString("params: a@b.test,secret")).toBe("params: [omitted]");
  });
});
