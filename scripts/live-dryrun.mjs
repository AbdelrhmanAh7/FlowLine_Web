// Runs the SaaS certification suite in dry-run mode: the same scenario code as the live
// suite, but against the in-process provider test double (loopback only, fake tokens).
// Results land in artifacts/phase-4/live-certification/live-dryrun-results.json as DRYRUN_PASS/DRYRUN_FAIL/N/A.
import { spawn } from "node:child_process";

const env = { ...process.env, FLOWLINE_LIVE_DRYRUN: "1" };
// A stray override from the shell must not redirect anything; the suite sets its own.
delete env.FLOWLINE_PROVIDER_OVERRIDE;
// src/server/connections.ts creates a pg Pool at import time. The pool never connects
// unless queried (the suite makes no DB calls); a placeholder satisfies the constructor.
env.DATABASE_URL ??= "postgres://flowline:unused@127.0.0.1:1/flowline_unused";

const child = spawn("vitest run --project live tests/live/certification.test.ts", { stdio: "inherit", shell: true, env });
child.on("exit", (code) => process.exit(code ?? 1));
