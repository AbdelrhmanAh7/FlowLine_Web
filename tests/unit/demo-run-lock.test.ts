import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { lockHeld } from "../../scripts/demo/paths";
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
  // A temp file, never the real tools/demo-video/.work/build.lock: a test run must not steal or delete a live build's lock.
  const dir = mkdtempSync(join(tmpdir(), "demo-lock-"));
  const lock = join(dir, "build.lock");
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(lock, { force: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const setPid = () => writeFileSync(lock, "4242");
  it("keeps the lock when the pid exists but kill is not permitted (EPERM)", () => {
    setPid();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("eperm"), { code: "EPERM" });
    });
    expect(lockHeld(lock)).toBe(4242);
  });
  it("frees the lock when the process is gone (ESRCH)", () => {
    setPid();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("esrch"), { code: "ESRCH" });
    });
    expect(lockHeld(lock)).toBeNull();
  });
  it("reports no holder when the lock file does not exist", () => {
    expect(lockHeld(join(dir, "missing.lock"))).toBeNull();
  });
});
