// The demo's own isolated test stack: production build, app :3190, fakes :4190/:4191, database flowline_test_demo.
// It never touches the e2e stack on :3100. The `.next-test` build is shared with the e2e stack: reused when it is
// current, and never rebuilt while another `next build` runs (issue #96 section 8, stage 0).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, statSync } from "node:fs";

export const DEMO_STACK = { port: 3190, fakePort: 4190, aiPort: 4191, db: "flowline_test_demo" } as const;
export const DEMO_URL = `http://localhost:${DEMO_STACK.port}`;
const HEALTH = `${DEMO_URL}/api/health?require=worker`;

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(HEALTH, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

/** True when `.next-test` holds a build newer than every tracked change under src/ (committed or not). */
export function buildIsCurrent(root = process.cwd()): boolean {
  const id = `${root}/.next-test/BUILD_ID`;
  if (!existsSync(id)) return false;
  const built = statSync(id).mtimeMs / 1000;
  const lastCommit = Number(spawnSync("git", ["log", "-1", "--format=%ct", "--", "src", "next.config.ts"], { cwd: root, encoding: "utf8" }).stdout.trim() || 0);
  const dirty = spawnSync("git", ["status", "--porcelain", "--", "src", "next.config.ts"], { cwd: root, encoding: "utf8" }).stdout.trim();
  return built >= lastCommit && !dirty;
}

/** Another `next build` (a gate or e2e run) is in progress on this machine. */
export function otherBuildRunning(): boolean {
  // Match only actual node processes running `next build`, not opencode/other processes that
  // happen to have "next build" in their command line (e.g. issue text).
  const r = spawnSync("pgrep", ["-f", "^node.*next build"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0;
}

export type Stack = { url: string; stop: () => Promise<void>; reused: boolean };

/**
 * Starts the stack (or reuses one already healthy on :3190, which is then left running). `rebuild` forces a fresh
 * production build; otherwise a current `.next-test` build is reused with FLOWLINE_TEST_SKIP_BUILD=1.
 */
export async function startStack(opts: { rebuild?: boolean; log?: (s: string) => void } = {}): Promise<Stack> {
  const log = opts.log ?? ((s: string) => console.log(s));
  if (await healthy()) {
    log(`stack: reusing the demo stack already running on ${DEMO_URL}`);
    return { url: DEMO_URL, reused: true, stop: async () => {} };
  }
  const reuse = !opts.rebuild && buildIsCurrent();
  if (!reuse && otherBuildRunning()) throw new Error("another `next build` is running (gate or e2e); wait for it, then re-run (the build in .next-test is shared)");
  log(`stack: starting app :${DEMO_STACK.port}, db ${DEMO_STACK.db}, ${reuse ? "reusing .next-test" : "production build first (a few minutes)"}`);
  const env = {
    ...process.env,
    FLOWLINE_TEST_PORT: String(DEMO_STACK.port),
    FLOWLINE_TEST_FAKE_PORT: String(DEMO_STACK.fakePort),
    FLOWLINE_TEST_AI_PORT: String(DEMO_STACK.aiPort),
    FLOWLINE_TEST_DB: DEMO_STACK.db,
    FLOWLINE_TEST_NEXT: "start",
    ...(reuse ? { FLOWLINE_TEST_SKIP_BUILD: "1" } : {}),
  };
  // Own process group, so stop() ends the whole tree (app, worker, fakes) and nothing else.
  const child: ChildProcess = spawn(process.execPath, ["scripts/dev-test.mjs"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const tail: string[] = [];
  const keep = (b: Buffer) => {
    const s = b.toString();
    // Log worker output in real-time
    for (const line of s.split("\n").filter(Boolean)) {
      if (line.includes("[worker]")) log(`[stack] ${line}`);
    }
    tail.push(...s.split("\n").filter(Boolean));
    tail.splice(0, Math.max(0, tail.length - 40));
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  const stop = async () => {
    if (child.exitCode !== null || !child.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    for (let i = 0; i < 50 && child.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
  };
  const deadline = Date.now() + (reuse ? 3 : 15) * 60_000;
  while (!(await healthy())) {
    if (child.exitCode !== null) throw new Error(`the demo stack exited (${child.exitCode}):\n${tail.join("\n")}`);
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`the demo stack was not healthy in time:\n${tail.join("\n")}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log(`stack: healthy on ${DEMO_URL}`);
  return { url: DEMO_URL, reused: false, stop };
}
