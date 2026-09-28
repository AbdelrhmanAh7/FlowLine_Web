import { describe, expect, it } from "vitest";
import { errorOf, NodeError, PLATFORM_UNAVAILABLE_MESSAGE } from "@/engine/execute";

class DrizzleQueryError extends Error {
  constructor(query: string, cause: unknown) {
    super(`Failed query: ${query}\nparams: 1,2`);
    this.name = "DrizzleQueryError";
    this.cause = cause;
  }
}

describe("step errors from Flowline's own database (Codex CX4Q-02)", () => {
  it("never shows SQL or driver text; classified as PLATFORM_UNAVAILABLE", () => {
    const cases: unknown[] = [
      new DrizzleQueryError('update "usage_event" set "status" = $1', new Error("Connection terminated unexpectedly")),
      new Error('Failed query: select * from "run"'),
      Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01", severity: "FATAL" }),
      new Error("Connection terminated unexpectedly"),
      Object.assign(new Error("wrapper"), { cause: Object.assign(new Error("deadlock"), { code: "40P01", severity: "ERROR" }) }),
    ];
    for (const c of cases) {
      const e = errorOf(c);
      expect(e.code).toBe("PLATFORM_UNAVAILABLE");
      expect(e.message).toBe(PLATFORM_UNAVAILABLE_MESSAGE);
      expect(e.message).not.toMatch(/select|update|usage_event|\$1/i);
    }
  });
  it("leaves node, provider-style and ordinary errors alone", () => {
    expect(errorOf(new NodeError("HTTP_RESPONSE_LOST", "The server closed the connection")).code).toBe("HTTP_RESPONSE_LOST");
    expect(errorOf({ code: "PROVIDER_SERVER", message: "The app returned 503" })).toEqual({ code: "PROVIDER_SERVER", message: "The app returned 503" });
    expect(errorOf(new Error("boom"))).toEqual({ code: "NODE_ERROR", message: "boom" });
  });
});
