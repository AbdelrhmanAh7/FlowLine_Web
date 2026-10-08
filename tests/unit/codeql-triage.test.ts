import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Issue #63: every open CodeQL alert is fixed, or dismissed with its reason written in docs/security/CODEQL_TRIAGE.md
 * and next to the flagged code. CodeQL itself runs on GitHub; these tests keep the triage and the fixes from regressing.
 */
const read = (p: string) => readFileSync(p, "utf8");
const triage = () => read("docs/security/CODEQL_TRIAGE.md");

/** Alert → rule, file and (for fixed alerts) the flagged snippet that must stay gone. */
const FIXED: Record<number, { rule: string; file: string; flagged: string }> = {
  1: { rule: "js/identity-replacement", file: "tests/unit/cb-pack-customer-follow-up.test.ts", flagged: `.replace(/^\\(/, "(")` },
  2: { rule: "js/incomplete-multi-character-sanitization", file: "tests/unit/landing-header.test.ts", flagged: `.replace(/<[^>]*>/g, "")` },
  3: { rule: "js/incomplete-sanitization", file: "e2e/phase3.spec.ts", flagged: `FAKE.replace(/[.:/]/g` },
  4: { rule: "js/incomplete-sanitization", file: "scripts/stop-test-stack.mjs", flagged: `ps.replace(/"/g` },
  5: { rule: "js/stack-trace-exposure", file: "e2e/fakes/provider-server.ts", flagged: "{ error: String(e) }" },
  8: { rule: "js/disabling-certificate-validation", file: "scripts/release/verify-beta-stack.mjs", flagged: "NODE_TLS_REJECT_UNAUTHORIZED" },
  7: { rule: "js/resource-exhaustion", file: "e2e/fakes/ai-server.ts", flagged: "fault.delayMs ?? 1000)" },
  13: { rule: "js/shell-command-injection-from-environment", file: "scripts/stop-test-stack.mjs", flagged: "execSync(" },
  14: { rule: "js/incomplete-url-substring-sanitization", file: "tests/unit/ai-hub-wave-b.test.ts", flagged: `endsWith("cohere.com")` },
};
const DISMISSED: Record<number, { rule: string; file: string }> = {
  6: { rule: "js/regex-injection", file: "e2e/fakes/provider-server.ts" },
  9: { rule: "js/server-side-unvalidated-url-redirection", file: "e2e/fakes/provider-server.ts" },
  10: { rule: "js/insufficient-password-hash", file: "e2e/fakes/ai-protocols.ts" },
  12: { rule: "js/insufficient-password-hash", file: "src/server/rate-limit.ts" },
};
/** The triage table row for alert `n`: `| #n | rule | file | disposition | reason |`. */
const row = (n: number) => triage().split("\n").find((l) => l.startsWith(`| #${n} |`));

describe("CodeQL triage (#63)", () => {
  it("@issue-63 AC1: every alert open on 2026-10-07 has a row in CODEQL_TRIAGE.md with its rule, file and a disposition", () => {
    for (const [n, a] of Object.entries({ ...FIXED, ...DISMISSED })) {
      const r = row(Number(n));
      expect(r, `alert #${n}`).toBeDefined();
      expect(r).toContain(`\`${a.rule}\``);
      expect(r).toContain(`\`${a.file}\``);
      expect(r, `alert #${n}`).toMatch(Number(n) in FIXED ? /\| fixed \|/ : /\| dismissed: (false positive|used in tests|won't fix) \|/);
    }
  });

  it("@issue-63 AC2: fixed alerts no longer contain the flagged code", () => {
    for (const [n, a] of Object.entries(FIXED)) expect(read(a.file), `alert #${n} in ${a.file}`).not.toContain(a.flagged);
  });

  it("@issue-63 AC3: each dismissed alert carries its written reason next to the code, naming the rule and alert number", () => {
    for (const [n, a] of Object.entries(DISMISSED)) {
      expect(read(a.file), `alert #${n} in ${a.file}`).toContain(`CodeQL \`${a.rule}\` (alert #${n})`);
      expect(row(Number(n))!.split("|")[5]!.trim().length, `alert #${n} reason`).toBeGreaterThan(40);
    }
  });

  it("@issue-63 AC4: stop-test-stack runs its commands without a shell (no string-built command lines)", () => {
    const src = read("scripts/stop-test-stack.mjs");
    expect(src).toContain("execFileSync");
    expect(src).not.toMatch(/\bexecSync\b/);
  });

  it("@issue-63 AC5: verify-beta-stack never disables certificate validation; a local CA is trusted with --ca-file", () => {
    const src = read("scripts/release/verify-beta-stack.mjs");
    expect(src).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized\s*:\s*(false|!)/);
    expect(src).toContain("--ca-file");
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, ["scripts/release/verify-beta-stack.mjs", "--base", "https://localhost:1", ...extra, "--out", join(tmpdir(), "flowline-issue-63")], { encoding: "utf8", timeout: 10_000 });
    const old = run("--insecure-local");
    expect(old.status).toBe(2);
    expect(old.stderr).toContain("--insecure-local was removed");
    const missing = run("--ca-file", join(tmpdir(), "flowline-issue-63", "no-such-ca.crt"));
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("cannot read --ca-file");
  });
});
