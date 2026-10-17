import { describe, expect, it } from "vitest";
import { redact, redactString, safeErrorText } from "@/server/redact";

describe("redact", () => {
  it.each([29, 30, 31, 32, 33])("fails closed for secrets in objects and arrays at depth %s", (depth) => {
    const secret = "synthetic-unshaped-credential";
    for (const leaf of [secret, { password: secret }, [secret]]) {
      let value: unknown = leaf;
      for (let i = 0; i < depth; i++) value = i % 2 ? [value] : { next: value };
      expect(JSON.stringify(redact(value, [secret]))).not.toContain(secret);
    }
  });

  it("drops unexamined subtrees and terminates cyclic input without returning raw values", () => {
    const secret = "synthetic-cycle-credential";
    const value: Record<string, unknown> = { note: secret };
    value.self = value;
    const out = redact(value, [secret]);
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.stringify(out)).not.toContain(secret);
    expect(JSON.stringify(out)).toContain("[REDACTED_LIMIT]");
  });
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

  it.each(["\n", "\r\n"])("omits the entire multiline parameter tail and nested causes (%j)", (newline) => {
    const marker = "synthetic-unshaped-session-credential";
    const cause = new Error(`Failed query: select $1${newline}params: harmless${newline}${marker}${newline}last bound value`, { cause: new Error(`params: another${newline}${marker}`) });
    const text = safeErrorText(new Error("Database operation failed", { cause }));
    expect(text).toContain("Database operation failed");
    expect(text).toContain("params: [omitted]");
    expect(text).not.toContain(marker);
    expect(text).not.toContain("last bound value");
    expect(redactString(`PARAMS: harmless${newline}${marker}`)).not.toContain(marker);
    expect(safeErrorText(new Error("Ordinary bounded failure"))).toBe("Error: Ordinary bounded failure");
  });
});
