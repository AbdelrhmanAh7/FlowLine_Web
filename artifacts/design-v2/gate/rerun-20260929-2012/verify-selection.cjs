// Verifies the rerun selection (list-A/B/C.txt) equals the tests that failed (x) or never ran (-) in the
// interrupted run (../e2e-chromium-2.txt). Compares file + full title; tags and durations are ignored.
const fs = require("fs");
const path = require("path");
const D = __dirname;
const norm = (s) => s.replace(/ @[\w-]+/g, "").replace(/ \([\d.]+m?s\)$/, "").trim();
const expected = fs
  .readFileSync(path.join(D, "..", "e2e-chromium-2.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.match(/^\s+(x|-)\s+\d+ \[chromium\] › e2e[\\/](\S+?):\d+:\d+ › (.*)$/))
  .filter(Boolean)
  .map((m) => norm(`${m[2]} › ${m[3]}`))
  .sort();
const selected = ["A", "B", "C"]
  .flatMap((b) =>
    fs
      .readFileSync(path.join(D, `list-${b}.txt`), "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/\[chromium\] › (\S+?):\d+:\d+ › (.*)$/))
      .filter(Boolean)
      .map((m) => norm(`${m[1]} › ${m[2]}`)),
  )
  .sort();
fs.writeFileSync(path.join(D, "expected-titles.txt"), expected.join("\n") + "\n");
fs.writeFileSync(path.join(D, "selected-titles.txt"), selected.join("\n") + "\n");
const missing = expected.filter((t) => !selected.includes(t));
const extra = selected.filter((t) => !expected.includes(t));
console.log(`expected ${expected.length}, selected ${selected.length}, missing ${missing.length}, extra ${extra.length}`);
for (const t of missing) console.log("MISSING", t);
for (const t of extra) console.log("EXTRA", t);
process.exit(missing.length || extra.length || expected.length !== 29 ? 1 : 0);
