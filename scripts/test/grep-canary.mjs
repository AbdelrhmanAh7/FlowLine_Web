// Evidence safety (docs/security/CREDENTIALS_DESIGN.md S6): tests use secrets of the form FLCANARY_<random>. None may
// ever appear in retained evidence — test results, Playwright traces/reports/screenshots, or artifacts/.
//   node scripts/test/grep-canary.mjs [dir ...]      (exit 1 on any hit; prints only file names, never the value)
// Zip-based traces are scanned as raw bytes (their JSON entries are usually stored uncompressed; compressed entries
// are a known limit — the admin-panel spec therefore runs with traces, screenshots and video OFF).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["artifacts", "test-results", "playwright-report"];
// A real canary value (FLCANARY_ + ≥ 16 random chars), not the word in documentation.
const NEEDLE = /FLCANARY_[A-Za-z0-9-]{16,}/;
const hits = [];

function walk(p) {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e));
    return;
  }
  if (st.size > 200 * 1024 * 1024) return;
  if (NEEDLE.test(readFileSync(p).toString("latin1"))) hits.push(p);
}

for (const r of roots) walk(r);
if (hits.length) {
  console.error(`Canary found in ${hits.length} evidence file(s):`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`No canary in: ${roots.join(", ")}`);
