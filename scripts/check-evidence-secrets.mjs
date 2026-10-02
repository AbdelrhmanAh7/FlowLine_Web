// Fails when a real local secret value appears in evidence or in staged files (DV2-02).
//
// Pattern scanners miss test keys and base64 secrets, so this compares against the ACTUAL values in the local env files
// (.env, .env.test, .env.local, .env.staging, deploy/beta/.env.beta — whichever exist). It prints only the file and the
// variable name, never a value.
//
//   node scripts/check-evidence-secrets.mjs [extra paths...]
//
// Scans: artifacts/ (except gitignored helper-logs/), every file staged in git, and any extra paths.
// Limits: compressed files (.zip traces, images) are skipped; values shorter than 12 characters and deliberate fake
// fixtures (containing "fake") are not treated as secrets.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ENV_FILES = [".env", ".env.test", ".env.local", ".env.staging", "deploy/beta/.env.beta"];
const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL)/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".next-test", "test-results", "playwright-report", "helper-logs", ".profile"]);
const BINARY = /\.(zip|png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|mp4|webm)$/i;

const secrets = [];
for (const f of ENV_FILES) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || !SECRET_NAME.test(m[1])) continue;
    for (const v of m[2].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))) {
      if (v.length >= 12 && !/fake/i.test(v)) secrets.push({ name: `${f}:${m[1]}`, value: v });
    }
  }
}

const files = new Set();
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".next-test-")) continue; // per-port `next dev` dirs (dev-test.mjs)
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.add(p);
  }
};
walk("artifacts");
try {
  // -z: NUL-separated and unquoted, so staged paths with non-ASCII names are scanned too.
  for (const f of execFileSync("git", ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"], { encoding: "utf8" }).split("\0")) if (f) files.add(f);
} catch {
  /* not a git checkout */
}
for (const p of process.argv.slice(2)) {
  if (existsSync(p) && statSync(p).isDirectory()) walk(p);
  else files.add(p);
}

if (secrets.length === 0) {
  console.warn("check-evidence-secrets: WARNING - no local env file with secret values was found; nothing to compare against (this is not a pass on real secrets).");
}
let hits = 0;
let scanned = 0;
for (const f of files) {
  if (BINARY.test(f) || !existsSync(f)) continue;
  const text = readFileSync(f, "utf8");
  scanned++;
  for (const s of secrets) {
    if (text.includes(s.value)) {
      hits++;
      console.error(`SECRET FOUND: ${relative(".", f)} contains the value of ${s.name}`);
    }
  }
}
console.log(`check-evidence-secrets: ${secrets.length} local secret value(s) checked across ${scanned} file(s); ${hits} hit(s)`);
process.exit(hits ? 1 : 0);
