import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { checkDocs } from "../../scripts/ci/docs-check.mjs";

// Acceptance tests for issue #68: the owner-review draft of the restore, rollback and alerting runbook (docs only).
const root = fileURLToPath(new URL("../../", import.meta.url));
const runbookPath = resolve(root, "docs/runbooks/restore-rollback-alerts.md");
const ownerActionsPath = resolve(root, "docs/implementation/OWNER_ACTIONS.md");
const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const runbook = read(runbookPath);
const ownerActions = read(ownerActionsPath);

// The body of the `## ` section whose heading matches, up to the next `## ` heading.
function section(heading: RegExp): string {
  const parts = runbook.split(/^(?=## )/m).filter((part) => part.startsWith("## "));
  return parts.find((part) => heading.test(part.split("\n")[0])) ?? "";
}
// Top-level ordered steps (`1. `, `2. ` …) of a section, in document order.
const steps = (body: string) => [...body.matchAll(/^(\d+)\. \S/gm)].map((m) => Number(m[1]));
const isOrdered = (ns: number[]) => ns.length >= 3 && ns.every((n, i) => n === i + 1);

describe("@issue-68 restore, rollback and alerting runbook", () => {
  it("@issue-68 AC1: has the four sections, each with concrete ordered steps", () => {
    expect(runbook, "docs/runbooks/restore-rollback-alerts.md is missing").not.toBe("");
    const backup = section(/Backup and restore/i);
    const rollback = section(/Rollback/i);
    const alerting = section(/Alerting/i);
    const decisions = section(/Owner decisions needed/i);
    for (const [name, body] of Object.entries({ backup, rollback, alerting, decisions })) expect(body, `${name} section`).not.toBe("");

    expect(backup).toMatch(/what is backed up/i);
    expect(isOrdered(steps(section(/Restore steps/i) || backup)), "restore steps are numbered 1..n").toBe(true);
    expect(backup).toMatch(/```sql[\s\S]+?```/);
    expect(backup).toMatch(/__drizzle_migrations/);

    expect(isOrdered(steps(rollback)), "rollback steps are numbered 1..n").toBe(true);
    expect(rollback).toMatch(/roll[- ]forward/i);
    expect(rollback).toMatch(/criteria/i);

    for (const alert of [/error rate/i, /auth(entication)? failures/i, /job failures/i, /backup age/i]) {
      const row = alerting.split("\n").find((line) => line.startsWith("|") && alert.test(line));
      expect(row, `alert row ${alert}`).toBeDefined();
      expect(row, `alert row ${alert} has an owner placeholder`).toMatch(/<owner>/);
      expect(row, `alert row ${alert} has a numeric threshold`).toMatch(/\d/);
    }
    const items = decisions.split("\n").filter((line) => /^(\d+\.|-) \S/.test(line));
    expect(items.length).toBeGreaterThanOrEqual(3);
    // REQ-FL-68-5: each open decision carries a default so work is not blocked.
    for (const item of items) expect(item, "owner decision has a default").toMatch(/Default: \S/);
  });

  it("@issue-68 AC2: has no secrets, real identifiers or LIVE-trading content and keeps NileQuant PAPER only", () => {
    expect(runbook).not.toBe("");
    expect(runbook).toMatch(/NileQuant[^\n]*PAPER only/);
    const forbidden: RegExp[] = [
      /-----BEGIN [A-Z ]*KEY-----/, // private keys
      /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/, // payment keys
      /\bsk-[A-Za-z0-9-]{16,}/, // AI provider keys
      /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
      /\bAKIA[0-9A-Z]{16}\b/, // cloud access keys
      /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
      /hooks\.slack\.com|discord(app)?\.com\/api\/webhooks/i, // real alert webhooks
      /postgres(ql)?:\/\/[^\s<:]+:[^\s<@]+@/, // inline DB passwords
      /(PASSWORD|SECRET|TOKEN|KEY)=(?!<)\S/, // assigned secret values
      /\b\d{1,3}(\.\d{1,3}){3}\b/, // IP addresses
      /https?:\/\/(?!<|localhost[:/])/, // real hosts; placeholders are <...>
      /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|cloud|eg|ai)\b/i, // real domains
      /@[a-z0-9-]+\.[a-z]{2,}/i, // real e-mail addresses
      /\blive[- ]?(trading|account|broker|order)s?\b/i,
      /\bLIVE\b/,
    ];
    for (const pattern of forbidden) expect(runbook, `matches ${pattern}`).not.toMatch(pattern);
  });

  it("@issue-68 AC3: is linked from OWNER_ACTIONS.md next to the deployment PP item, statuses unchanged", () => {
    const link = /\]\(\.\.\/runbooks\/restore-rollback-alerts\.md\)/;
    const linkLine = ownerActions.split("\n").find((line) => link.test(line));
    expect(linkLine, "OWNER_ACTIONS.md links the runbook").toBeDefined();
    expect(linkLine).toMatch(/PP-06/);
    expect(linkLine).toMatch(/#30/);
    // The boundary rows the runbook relates to keep their current state.
    expect(ownerActions).toMatch(/^\| O04 \| Existing domain \/ secure Pi target \/ read-only access \| Pending inputs and exact approval;/m);
    expect(ownerActions).toMatch(/^\| O08 \| Beta deployment \| Not reached; requires verified host\/domain/m);
  });

  it("@issue-68 AC3: every relative link in the runbook resolves", () => {
    expect(runbook).not.toBe("");
    const links = [...runbook.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]).filter((href) => !/^[a-z]+:/i.test(href));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) expect(existsSync(resolve(dirname(runbookPath), href)), `link ${href}`).toBe(true);
  });

  it("@issue-68 AC4: the mandatory docs check passes for this change", () => {
    const files = ["docs/runbooks/restore-rollback-alerts.md", "docs/implementation/OWNER_ACTIONS.md", "tests/unit/restore-rollback-alerts-runbook.test.ts"];
    expect(checkDocs(files).passed).toBe(true);
    expect(existsSync(runbookPath)).toBe(true);
  });

  it("@issue-68 AC5: the runbook stays small enough for one ≤ ~300-line PR", () => {
    const lines = runbook.split("\n").length;
    expect(lines).toBeGreaterThan(40);
    expect(lines).toBeLessThanOrEqual(200);
  });
});
