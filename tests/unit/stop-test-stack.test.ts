/**
 * Issue #112: CodeQL triage B (scripts/ alerts) - stop-test-stack (alerts #4 & #13)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: standalone script has no declaration file
import { buildFuserArgs, buildKillArgs, buildLsofArgs, buildPowerShellArgs, buildStackArgs, validatePid, validatePort, validateStackName } from "../../scripts/stop-test-stack.mjs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const script = fileURLToPath(new URL("../../scripts/stop-test-stack.mjs", import.meta.url));

describe("stop-test-stack validators (alert #13)", () => {
  it("validatePid accepts ^[0-9]{1,7}$ > 1 and rejects injection payloads and bad values", () => {
    for (const p of [2, 1234, 65535, "2", "1234", "9999999"]) expect(validatePid(p)).toBe(Number(p));
    for (const bad of ["1234; rm -rf /", "$(whoami)", "'id'", "1 && curl evil", "-1", "0", "1", "", "abc", "12345678"]) {
      expect(() => validatePid(bad)).toThrow();
    }
  });

  it("validatePort accepts 1..65535 and rejects non-integers, out of range, and injections", () => {
    for (const p of [80, 443, 3100, 4010, 65535, "3100"]) expect(validatePort(p)).toBe(Number(p));
    for (const bad of [0, 70000, "80;kill", 3.14, "3.14", -1, "", "http"]) expect(() => validatePort(bad)).toThrow();
  });

  it("validateStackName accepts ^[A-Za-z0-9_.-]{1,64}$ and rejects shell metacharacters", () => {
    for (const n of ["flowline-test", "stack_1", "test-shard-3", "A1.B2_C3"]) expect(validateStackName(n)).toBe(n);
    for (const bad of ["stack; rm -rf /", "$(whoami)", "`id`", "stack & echo", "stack | rm", "'stack'", '"stack"', "", "a".repeat(65)]) {
      expect(() => validateStackName(bad)).toThrow();
    }
  });
});

describe("argv builders construct exact arrays (alerts #4 & #13)", () => {
  it("builds exact argv arrays and rejects invalid values before any command execution", () => {
    expect(buildLsofArgs(3100)).toEqual(["-ti", "tcp:3100"]);
    expect(() => buildLsofArgs("3100; rm -rf /")).toThrow();
    expect(buildFuserArgs(3100)).toEqual(["-n", "tcp", "3100"]);
    expect(buildFuserArgs(3100, { kill: true })).toEqual(["-k", "-n", "tcp", "3100"]);
    expect(() => buildFuserArgs("3100; evil")).toThrow();
    expect(buildKillArgs([1234, 5678])).toEqual(["-9", "1234", "5678"]);
    for (const b of ["1234; rm -rf /", "$(whoami)"]) expect(() => buildKillArgs([b])).toThrow();
    expect(() => buildKillArgs([])).toThrow();
    const ps = buildPowerShellArgs([3100, 4010], 3100);
    expect(ps.slice(0, 2)).toEqual(["-NoProfile", "-Command"]);
    expect(ps[2]).toContain("LocalPort 3100");
    expect(() => buildPowerShellArgs(["3100; evil"])).toThrow();
    expect(buildStackArgs("flowline-test")).toEqual(["--filter", "name=flowline-test"]);
    expect(() => buildStackArgs("stack; rm -rf /")).toThrow();
  });

  it.each(["1234; rm -rf /", "$(whoami)"])("exits 1 on PID env %j with stderr validation error", (badPid) => {
    const res = spawnSync(process.execPath, [script], { env: { ...process.env, FLOWLINE_TEST_PID: badPid }, encoding: "utf8" });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Invalid PID");
  });

  it("scripts contain no shell exec string, no shell: true, and no .replace sanitization", () => {
    for (const f of ["scripts/stop-test-stack.mjs", "scripts/release/verify-beta-stack.mjs"]) {
      const c = read(f);
      expect(c).not.toMatch(/\bexecSync\s*\(/);
      expect(c).not.toMatch(/\bexec\s*\(/);
      expect(c).not.toContain("shell: true");
    }
    expect(read("scripts/stop-test-stack.mjs")).not.toContain(".replace(");
  });

  it("documents alerts #4 and #13 in triage doc and code", () => {
    const doc = read("docs/security/codeql-triage-scripts.md");
    expect(doc).toMatch(/\|\s*#4\s*\|\s*`js\/incomplete-sanitization`\s*\|\s*`scripts\/stop-test-stack\.mjs`\s*\|\s*Fixed\s*\|/);
    expect(doc).toMatch(/\|\s*#13\s*\|\s*`js\/shell-command-injection-from-environment`\s*\|\s*`scripts\/stop-test-stack\.mjs`\s*\|\s*Fixed\s*\|/);
    const code = read("scripts/stop-test-stack.mjs");
    expect(code).toContain("(alert #4)");
    expect(code).toContain("(alert #13)");
    expect(code).toContain("docs/security/codeql-triage-scripts.md");
  });
});
