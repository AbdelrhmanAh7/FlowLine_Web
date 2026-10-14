import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { acquireLock, lockHeld, releaseLock, ROOT } from "../../scripts/demo/paths";
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

describe("acquireLock()", () => {
  // A temp file, never the real tools/demo-video/.work/build.lock: a test run must not steal or delete a live build's lock.
  const dir = mkdtempSync(join(tmpdir(), "demo-lock-"));
  const lock = join(dir, "build.lock");
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(lock, { force: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Acquires the lock, prints ACQUIRED, holds it, and releases on SIGTERM (so the test never races a zombie pid).
  const holderScript = `
    import { acquireLock, releaseLock } from ${JSON.stringify(join(ROOT, "scripts/demo/paths.ts"))};
    acquireLock(${JSON.stringify(lock)});
    console.log("ACQUIRED");
    process.on("SIGTERM", () => { releaseLock(${JSON.stringify(lock)}); process.exit(0); });
    await new Promise((r) => setTimeout(r, 10000));
  `;

  it("writes the pid, refuses a second acquirer, and releases cleanly", () => {
    acquireLock(lock);
    expect(readFileSync(lock, "utf8")).toBe(String(process.pid));
    expect(() => acquireLock(lock)).toThrow(/another demo build is running \(pid \d+\)/);
    releaseLock(lock);
    expect(existsSync(lock)).toBe(false);
    acquireLock(lock); // the same process can take it again after releasing
    releaseLock(lock);
  });

  it("fails closed on a stale lock instead of taking it over", () => {
    writeFileSync(lock, "4242");
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("esrch"), { code: "ESRCH" });
    });
    expect(() => acquireLock(lock)).toThrow(/stale demo build lock/);
    expect(existsSync(lock)).toBe(true); // never silently taken over
  });

  it("lets only one of two processes hold the lock", async () => {
    // A child process holds the lock: the parent is refused while it lives, then takes it after the child releases.
    const holder = spawn(process.execPath, ["--import", "tsx", "-e", holderScript], { cwd: ROOT });
    const acquired = new Promise<void>((resolve) => holder.stdout!.on("data", (d) => String(d).includes("ACQUIRED") && resolve()));
    await acquired; // the child holds the lock now
    expect(() => acquireLock(lock)).toThrow(/another demo build is running/);
    holder.kill("SIGTERM");
    await new Promise<void>((resolve) => holder.on("exit", resolve));
    acquireLock(lock); // the holder released on SIGTERM: the parent can take it
    releaseLock(lock);
  });
});
