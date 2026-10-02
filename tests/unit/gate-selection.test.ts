import { describe, expect, it } from "vitest";
import { selectGateSteps } from "../../scripts/gate-selection.mjs";

const ALL = ["lint", "build", "stack", "chromium", "firefox", "webkit"];
const BROWSERS = ["chromium", "firefox", "webkit"];
const select = (over: Partial<Parameters<typeof selectGateSteps>[0]> = {}) => selectGateSteps({
  all: ALL,
  browsers: BROWSERS,
  only: ["firefox"],
  skip: [],
  tier: "fast",
  browserStacks: 3,
  browsersMode: "sequential",
  ...over,
});

describe("gate browser prerequisites", () => {
  it("selects one build for browser-only multi-stack runs", () => {
    const { selected, stackCount } = select();
    expect(stackCount).toBe(3);
    expect([...selected]).toEqual(["firefox", "stack", "build"]);
  });

  it("does not add a redundant build for a one-stack group", () => {
    const { selected, stackCount } = select({ browserStacks: 1 });
    expect(stackCount).toBe(1);
    expect(selected.has("stack")).toBe(true);
    expect(selected.has("build")).toBe(false);
  });

  it("accounts for multiple parallel project stacks when selecting build", () => {
    const { selected, stackCount, parallelProjects } = select({
      only: ["firefox", "webkit"],
      browsersMode: "parallel",
      browserStacks: 1,
    });
    expect(parallelProjects).toEqual(["firefox", "webkit"]);
    expect(stackCount).toBe(2);
    expect(selected.has("build")).toBe(true);
  });

  it("rejects skipping the shared build when multiple browser stacks are required", () => {
    expect(() => select({ skip: ["build"] })).toThrow(/multiple browser stacks require the build step/);
  });
});
