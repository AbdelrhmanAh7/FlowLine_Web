import { describe, expect, it } from "vitest";
import { can, CAPABILITIES, denyReason, type Role } from "@/lib/permissions";

describe("permission matrix", () => {
  it("viewers read but never decide, edit, or manage", () => {
    expect(can("viewer", "approval.decide")).toBe(false);
    expect(can("editor", "approval.decide")).toBe(true);
    expect(can("owner", "approval.decide")).toBe(true);
    for (const [cap, roles] of Object.entries(CAPABILITIES)) {
      if ((roles as readonly Role[]).includes("viewer")) expect(roles as readonly Role[]).toContain("owner");
      expect(can("owner", cap as keyof typeof CAPABILITIES)).toBe(true);
    }
  });

  it("explains a denial in plain English", () => {
    expect(denyReason("viewer", "approval.decide")).toBe("Only workspace owners and editors can do this; you are a viewer");
    expect(denyReason("editor", "sso.manage")).toBe("Only workspace owners can do this; you are an editor");
    expect(denyReason(null, "sso.manage")).toBe("Only workspace owners can do this");
  });
});
