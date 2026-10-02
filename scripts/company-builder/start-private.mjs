// Starts Flowline for the OWNER CLI PROTOTYPE bound to a PRIVATE address only (never 0.0.0.0), plus the worker.
//   node scripts/company-builder/start-private.mjs                 # next start on 127.0.0.1:3000 (after pnpm build)
//   node scripts/company-builder/start-private.mjs --dev           # next dev on 127.0.0.1:3000
//   node scripts/company-builder/start-private.mjs --private-host=192.168.1.10   # approved LAN address (e.g. the Pi)
// Only a server started this way sets FLOWLINE_CB_BOUND, without which the prototype gate stays closed. The CLI
// controller is separate (scripts/company-builder/cli-controller.mts) and is started by the founder when needed.
import { spawn } from "node:child_process";
import { isPrivateIpv4 } from "./private-host.mjs";

process.loadEnvFile(".env");
const dev = process.argv.includes("--dev");
const privateHost = process.argv.find((a) => a.startsWith("--private-host="))?.split("=")[1];
if (privateHost && !isPrivateIpv4(privateHost)) {
  console.error("--private-host must be a private (RFC 1918) IPv4 address in canonical dotted form (no zero-padded octets)");
  process.exit(2);
}
const host = privateHost ?? "127.0.0.1";
const env = { ...process.env, FLOWLINE_CB_BOUND: privateHost ? "private" : "loopback" };
const procs = [
  spawn("npx", ["next", dev ? "dev" : "start", "-H", host, "-p", process.env.PORT ?? "3000"], { stdio: "inherit", env }),
  spawn("npx", ["tsx", "worker/index.ts"], { stdio: "inherit", env }),
];
const stop = () => procs.forEach((p) => p.exitCode === null && p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (c) => { stop(); process.exitCode = c ?? 1; });
