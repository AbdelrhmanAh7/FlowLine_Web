import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { acquireLock, LOCK_STARTING, lockHeld, releaseLock, ROOT } from "../../scripts/demo/paths";
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
  const setPid = (pid: number) => writeFileSync(lock, String(pid));
  // A lock whose pid was never written and which is older than the grace period: the build that created it is gone.
  const setStale = (content: string) => {
    writeFileSync(lock, content);
    utimesSync(lock, new Date(0), new Date(0));
  };
  it("keeps the lock when the pid exists but kill is not permitted (EPERM)", () => {
    setPid(4242);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("eperm"), { code: "EPERM" });
    });
    expect(lockHeld(lock)).toBe(4242);
  });
  it("frees the lock when the process is gone (ESRCH)", () => {
    setPid(4242);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("esrch"), { code: "ESRCH" });
    });
    expect(lockHeld(lock)).toBeNull();
  });
  it("reports no holder when the lock file does not exist", () => {
    expect(lockHeld(join(dir, "missing.lock"))).toBeNull();
  });
  it("keeps a just-created lock while its owner is still writing the pid (empty file, fresh)", () => {
    writeFileSync(lock, "");
    expect(lockHeld(lock)).toBe(LOCK_STARTING);
  });
  it("keeps a just-created lock whose content is not a pid yet (fresh garbage)", () => {
    writeFileSync(lock, "ab");
    expect(lockHeld(lock)).toBe(LOCK_STARTING);
  });
  it("frees an empty lock that never got a pid and is older than the grace period", () => {
    setStale("");
    expect(lockHeld(lock)).toBeNull();
  });
  it("frees a non-integer lock older than the grace period", () => {
    setStale("abc");
    expect(lockHeld(lock)).toBeNull();
  });
  it("frees a NaN lock older than the grace period", () => {
    setStale("NaN");
    expect(lockHeld(lock)).toBeNull();
  });
  it("frees a PID 0 lock older than the grace period", () => {
    setStale("0");
    expect(lockHeld(lock)).toBeNull();
  });
  it("frees a negative PID lock older than the grace period", () => {
    setStale("-42");
    expect(lockHeld(lock)).toBeNull();
  });
  it("keeps a fresh empty lock inside the 5 s grace window and frees it after", () => {
    writeFileSync(lock, "");
    expect(lockHeld(lock)).toBe(LOCK_STARTING); // fresh: still being written
    const past = new Date(Date.now() - 6000);
    utimesSync(lock, past, past);
    expect(lockHeld(lock)).toBeNull(); // older than the grace window
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
  const setStale = (content: string) => {
    writeFileSync(lock, content);
    utimesSync(lock, new Date(0), new Date(0));
  };

  // Acquires the lock, prints ACQUIRED, holds it, and releases on SIGTERM (so the test never races a zombie pid).
  const holderScript = `
    import { acquireLock, releaseLock } from ${JSON.stringify(join(ROOT, "scripts/demo/paths.ts"))};
    acquireLock(${JSON.stringify(lock)});
    process.on("SIGTERM", () => { releaseLock(${JSON.stringify(lock)}); process.exit(0); });
    console.log("ACQUIRED");
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

  it("refuses while the first build is still writing its pid (fresh empty lock is not stolen)", () => {
    writeFileSync(lock, "");
    expect(() => acquireLock(lock)).toThrow(/another demo build is starting/);
    expect(existsSync(lock)).toBe(true); // the live lock is left for its owner
  });

  it("fails closed on a stale lock instead of taking it over", () => {
    writeFileSync(lock, "4242");
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("esrch"), { code: "ESRCH" });
    });
    expect(() => acquireLock(lock)).toThrow(/stale demo build lock/);
    expect(existsSync(lock)).toBe(true); // never silently taken over
  });

  it("fails closed on an old empty lock (pid write never finished) after the grace period", () => {
    setStale("");
    expect(() => acquireLock(lock)).toThrow(/stale demo build lock/);
    expect(existsSync(lock)).toBe(true);
  });

  it("lets only one of two processes hold the lock", async () => {
    // A child process holds the lock: the parent is refused while it lives, then takes it after the child releases.
    const holder = spawn(process.execPath, ["--import", "tsx", "-e", holderScript], { cwd: ROOT });
    const acquired = new Promise<void>((resolve) => holder.stdout!.on("data", (d) => String(d).includes("ACQUIRED") && resolve()));
    try {
      await acquired; // the child holds the lock and its cleanup handler is ready
      expect(() => acquireLock(lock)).toThrow(/another demo build is running/);
    } finally {
      const exited = new Promise<void>((resolve) => holder.on("exit", resolve));
      holder.kill("SIGTERM");
      await exited;
    }
    acquireLock(lock); // the holder released on SIGTERM: the parent can take it
    releaseLock(lock);
  });
});
