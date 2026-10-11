import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK, WORK, lockHeld } from "../../scripts/demo/paths";
import { run } from "../../scripts/demo/run";

describe("run()", () => {
  it("rejects with setup guidance when the binary is missing (no uncaught error event)", async () => {
    await expect(run("/nonexistent/flowline-demo-bin", [], process.cwd())).rejects.toThrow(/not installed.*pnpm demo:setup/);
  });
  it("rejects with the exit code when the command fails", async () => {
    await expect(run("false", [], process.cwd())).rejects.toThrow(/failed \(1\)/);
  });
  it("resolves on exit 0", async () => {
    await expect(run("true", [], process.cwd())).resolves.toBeUndefined();
  });
});

describe("lockHeld()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(LOCK, { force: true });
  });
  const setPid = () => {
    mkdirSync(WORK, { recursive: true });
    writeFileSync(LOCK, "4242");
  };
  it("keeps the lock when the pid exists but kill is not permitted (EPERM)", () => {
    setPid();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("eperm"), { code: "EPERM" });
    });
    expect(lockHeld()).toBe(4242);
  });
  it("frees the lock when the process is gone (ESRCH)", () => {
    setPid();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("esrch"), { code: "ESRCH" });
    });
    expect(lockHeld()).toBeNull();
  });
});
