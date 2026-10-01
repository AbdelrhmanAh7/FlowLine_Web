import { describe, expect, it } from "vitest";
import { emptyState, applyAnswer } from "@/company-builder/interview";
import { composeBlueprint } from "@/company-builder/planner";

describe("company client context", () => {
  it("uses the client's name only while the current situation is client work", () => {
    let state = applyAnswer(emptyState(), "situation", "client");
    state = applyAnswer(state, "client_name", "Prior client");
    const ctx = { sessionId: "test-client", profileVersion: 1, connections: [], language: "en" as const };
    expect(composeBlueprint(state, ctx).clientName).toBe("Prior client");
    for (const situation of ["start", "improve"]) {
      const corrected = applyAnswer(state, "situation", situation, false, "correction");
      expect(composeBlueprint(corrected, ctx).clientName).toBeNull();
    }
  });
});
