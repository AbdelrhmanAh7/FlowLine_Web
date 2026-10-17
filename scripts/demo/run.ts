// Spawns a child process at background priority and settles on its exit OR its spawn error (never an uncaught 'error').
import { spawn } from "node:child_process";
import { setPriority } from "node:os";

export function run(cmd: string, args: string[], cwd: string, hint = "run `pnpm demo:setup`"): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "inherit", "pipe"] });
    // Background priority without a `nice` wrapper, so a missing binary surfaces as ENOENT below instead of exit 127.
    if (p.pid) try { setPriority(p.pid, 10); } catch { /* best effort */ }
    let err = "";
    p.stderr.on("data", (b: Buffer) => {
      const s = b.toString();
      if (!/Version mismatch|zod/.test(s)) err += s;
    });
    p.on("error", (e: NodeJS.ErrnoException) =>
      fail(new Error(e.code === "ENOENT" ? `${cmd} is not installed (or ${cwd} is missing): ${hint}` : `could not start ${cmd}: ${e.message}`)),
    );
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.slice(0, 3).join(" ")} … failed (${code}): ${err.slice(-1500)}`))));
  });
}
