// Named DV2-02 encryption variables only. Never emit values or process environment.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";

const parent = path.resolve("..");
const names = ["FLOWLINE_ENCRYPTION_KEY", "FLOWLINE_ENCRYPTION_KEYS_OLD", "FLOWLINE_PLATFORM_ENCRYPTION_KEY", "FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD"];
const targets = ["FlowLine", "FL-wt-aihub"];
const testEnvs = targets.map(root => ({ root, env: parseEnv(readFileSync(path.join(parent, root, ".env.test"), "utf8")) }));
const exposed = testEnvs.map(({ env }) => env.FLOWLINE_ENCRYPTION_KEY).filter(Boolean);
if (!exposed.length) throw new Error("No named affected key found; audit incomplete");
const checks = [];
for (const root of [...targets, "FL-wt-design"]) {
  for (const file of [".env", ".env.test", ".env.local", ".env.staging", "deploy/beta/.env.beta"]) {
    const full = path.join(parent, root, file);
    if (!existsSync(full)) continue;
    const env = parseEnv(readFileSync(full, "utf8"));
    const matches = names.filter(name => (env[name] ?? "").split(",").some(value => value.trim() && exposed.includes(value.trim())));
    checks.push({ source: `${root}/${file}`, disposable: file === ".env.test" && env.FLOWLINE_ENV === "test" && /^\/flowline_test(?:_[a-z0-9]+)?$/.test(new URL(env.DATABASE_URL).pathname), reusedVariables: matches });
  }
}
for (const container of ["flowline-staging-web-1", "flowline-staging-worker-1"]) {
  try {
    const conditions = names.map(name => `(eq (printf "%.${name.length + 1}s" .) "${name}=")`).join(" ");
    const template = `{{range .Config.Env}}{{if or ${conditions}}}{{println .}}{{end}}{{end}}`;
    const env = parseEnv(execFileSync("docker", ["inspect", "--format", template, container], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
    checks.push({ source: container, disposable: false, reusedVariables: names.filter(name => (env[name] ?? "").split(",").some(value => value.trim() && exposed.includes(value.trim()))) });
  } catch { checks.push({ source: container, disposable: false, audit: "BLOCKED: scoped container inspection failed" }); }
}
const report = { at: new Date().toISOString(), checks, affectedTestsShareKey: exposed.length === 2 && exposed[0] === exposed[1], nonDisposableReuse: checks.some(c => !c.disposable && c.reusedVariables?.length), complete: checks.every(c => !c.audit) };
writeFileSync("artifacts/beta-execution/20260930T122429Z/key-reuse-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ affectedTestsShareKey: report.affectedTestsShareKey, nonDisposableReuse: report.nonDisposableReuse, complete: report.complete }));
if (!report.complete || report.nonDisposableReuse) process.exitCode = 1;
