/**
 * Issue #112: CodeQL triage B (scripts/ alerts) - verify-beta-stack (alert #8)
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: standalone script has no declaration file
import { buildVerifyArgs, isLoopbackTarget, resolveTlsPolicy } from "../../scripts/release/verify-beta-stack.mjs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const script = fileURLToPath(new URL("../../scripts/release/verify-beta-stack.mjs", import.meta.url));

describe("verify-beta-stack TLS policy and argv builders (alert #8)", () => {
  it("isLoopbackTarget identifies loopback targets and rejects non-loopback", () => {
    for (const h of ["https://localhost", "http://127.0.0.1:8080", "https://[::1]", "localhost", "127.0.0.1", "::1"]) expect(isLoopbackTarget(h)).toBe(true);
    for (const h of ["https://beta.example.com", "https://93.184.216.34", "http://192.168.1.1", "", "invalid"]) expect(isLoopbackTarget(h)).toBe(false);
  });

  it("resolveTlsPolicy keeps certificate validation ON unless BETA_STACK_ALLOW_INSECURE=1 with loopback", () => {
    expect(resolveTlsPolicy({}, "https://localhost")).toEqual({ rejectUnauthorized: true, allowInsecure: false, env: {} });
    for (const h of ["https://beta.example.com", "https://93.184.216.34"]) expect(resolveTlsPolicy({ BETA_STACK_ALLOW_INSECURE: "1" }, h)).toEqual({ rejectUnauthorized: true, allowInsecure: false, env: {} });
    for (const h of ["https://localhost", "https://127.0.0.1:443", "https://[::1]"]) expect(resolveTlsPolicy({ BETA_STACK_ALLOW_INSECURE: "1" }, h)).toEqual({ rejectUnauthorized: false, allowInsecure: true, env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  });

  it("buildVerifyArgs returns stable ordered argv array and carries no --insecure in default path", () => {
    expect(buildVerifyArgs({}, "https://beta.example.com")).toEqual(["--base", "https://beta.example.com"]); expect(buildVerifyArgs({ BETA_STACK_ALLOW_INSECURE: "1" }, "https://beta.example.com")).toEqual(["--base", "https://beta.example.com"]);
    expect(buildVerifyArgs({ BETA_STACK_ALLOW_INSECURE: "1" }, "https://127.0.0.1:443")).toEqual(["--base", "https://127.0.0.1:443", "--insecure-local"]);
    expect(buildVerifyArgs({}, "https://localhost", { out: "artifacts/test" })).toEqual(["--base", "https://localhost", "--out", "artifacts/test"]);
  });

  it("exported surface area is strictly bounded and isolated with zero side effects", async () => {
    // @ts-expect-error TS7016: standalone script has no declaration file
    const mod = await import("../../scripts/release/verify-beta-stack.mjs");
    expect(Object.keys(mod).sort()).toEqual(["buildVerifyArgs", "isLoopbackTarget", "resolveTlsPolicy"]);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(isLoopbackTarget("127.0.0.1")).toBe(true);
    expect(resolveTlsPolicy({}, "https://localhost")).toEqual({ rejectUnauthorized: true, allowInsecure: false, env: {} });
  });

  it("alert #8 is documented in triage doc and code", () => {
    expect(read("docs/security/codeql-triage-scripts.md")).toMatch(/\|\s*#8\s*\|\s*`js\/disabling-certificate-validation`\s*\|\s*`scripts\/release\/verify-beta-stack\.mjs`\s*\|\s*Fixed\s*\|/);
    const code = read("scripts/release/verify-beta-stack.mjs");
    for (const token of ["(alert #8)", "docs/security/codeql-triage-scripts.md"]) expect(code).toContain(token);
  });

  it("exits 1 on non-loopback target with insecure env or flag", () => {
    for (const bad of ["https://example.com", "https://93.184.216.34", "http://192.168.1.1"]) {
      const res = spawnSync(process.execPath, [script, "--base", bad], { env: { ...process.env, BETA_STACK_ALLOW_INSECURE: "1" }, encoding: "utf8" });
      expect(res.status).toBe(1); expect(res.stderr).toContain("Refusing to disable certificate validation");
    }
    const rf = spawnSync(process.execPath, [script, "--base", "https://example.com", "--insecure-local"], { env: process.env, encoding: "utf8" });
    expect(rf.status).toBe(1); expect(rf.stderr).toContain("Refusing to disable certificate validation");
  }, 10000);
});
