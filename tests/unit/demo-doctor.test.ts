import { describe, expect, it } from "vitest";
import { nodeCheck } from "../../scripts/demo/doctor";

// The demo commands run from the root package, whose `engines` floor is `24.x`. The doctor must reject Node < 24
// (the old check accepted 22) while still passing on the owner's newer Node (the Mac mini runs 26).
describe("nodeCheck()", () => {
  it("accepts the repo's engine major (24)", () => {
    expect(nodeCheck("24.9.0")).toMatchObject({ name: "Node >= 24", ok: true });
  });
  it("accepts a newer major (the Mac mini runs 26)", () => {
    expect(nodeCheck("26.10.0")).toMatchObject({ ok: true });
    expect(nodeCheck("26.10.0").fix).toBeUndefined();
  });
  it("rejects Node 22 and older, naming the 24 floor in the fix", () => {
    expect(nodeCheck("22.11.0")).toMatchObject({ ok: false });
    expect(nodeCheck("22.11.0").fix).toMatch(/Node 24/);
    expect(nodeCheck("20.18.0").ok).toBe(false);
  });
});
