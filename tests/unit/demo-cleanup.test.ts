import { describe, expect, it } from "vitest";
import { cleanupBuild, type Closable, type Stoppable } from "../../scripts/demo/cleanup";

// The build's finally block must always release the lock, even when an earlier teardown step throws
// (Playwright 1.63 rethrows errors other than TargetClosedError from Browser.close()).
describe("cleanupBuild()", () => {
  const make = () => {
    const calls: string[] = [];
    const browser: Closable = { close: async () => void calls.push("browser") };
    const stack: Stoppable = { stop: async () => void calls.push("stack") };
    const steps = { browser, stack, removePublic: () => void calls.push("public"), releaseLock: () => void calls.push("lock") };
    return { calls, steps };
  };

  it("runs every step in order and releases the lock last", async () => {
    const { calls, steps } = make();
    await cleanupBuild(steps);
    expect(calls).toEqual(["browser", "stack", "public", "lock"]);
  });

  it("releases the lock when browser.close() throws, and rethrows the failure", async () => {
    const { calls, steps } = make();
    steps.browser = { close: async () => { calls.push("browser"); throw new Error("EPIPE"); } };
    await expect(cleanupBuild(steps)).rejects.toThrow("EPIPE");
    expect(calls).toEqual(["browser", "stack", "public", "lock"]);
  });

  it("releases the lock when stack.stop() throws", async () => {
    const { calls, steps } = make();
    steps.stack = { stop: async () => { calls.push("stack"); throw new Error("stop failed"); } };
    await expect(cleanupBuild(steps)).rejects.toThrow("stop failed");
    expect(calls).toEqual(["browser", "stack", "public", "lock"]);
  });

  it("releases the lock when the public/ removal throws", async () => {
    const { calls, steps } = make();
    steps.removePublic = () => { calls.push("public"); throw new Error("EBUSY"); };
    await expect(cleanupBuild(steps)).rejects.toThrow("EBUSY");
    expect(calls).toEqual(["browser", "stack", "public", "lock"]);
  });

  it("releases the lock when every step throws (a failure still surfaces)", async () => {
    const { calls, steps } = make();
    steps.browser = { close: async () => { calls.push("browser"); throw new Error("b"); } };
    steps.stack = { stop: async () => { calls.push("stack"); throw new Error("s"); } };
    steps.removePublic = () => { calls.push("public"); throw new Error("p"); };
    await expect(cleanupBuild(steps)).rejects.toThrow();
    expect(calls).toEqual(["browser", "stack", "public", "lock"]);
  });

  it("handles a run with no browser and no stack (record-only reuse)", async () => {
    const { calls, steps } = make();
    await cleanupBuild({ ...steps, browser: null, stack: null });
    expect(calls).toEqual(["public", "lock"]);
  });
});
