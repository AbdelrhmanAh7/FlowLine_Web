import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { checkDocs } from "../../scripts/ci/docs-check.mjs";

// Acceptance tests for issue #68: the owner-review draft of the restore, rollback and alerting runbook (docs only).
const root = fileURLToPath(new URL("../../", import.meta.url));
const runbookPath = resolve(root, "docs/runbooks/restore-rollback-alerts.md");
const read = (path: string) => (existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), "utf8") : "");
const [runbook, ownerActions] = ["docs/runbooks/restore-rollback-alerts.md", "docs/implementation/OWNER_ACTIONS.md"].map(read);
const lineCount = (text: string) => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length);
// The body of the `## ` section whose heading matches, up to the next `## ` heading.
const section = (heading: RegExp) => runbook.split(/^(?=## )/m).find((p) => p.startsWith("## ") && heading.test(p.split("\n")[0])) ?? "";
const between = (body: string, from: string, to: string) => body.slice(body.indexOf(from), body.indexOf(to));
// Top-level ordered steps (`1. `, `2. ` …) must be numbered 1..n in document order.
const steps = (body: string) => [...body.matchAll(/^(\d+)\. \S/gm)].map((m) => Number(m[1]));
const isOrdered = (body: string) => steps(body).length >= 3 && steps(body).every((n, i) => n === i + 1);

describe("@issue-68 restore, rollback and alerting runbook", () => {
  it("@issue-68 AC1: has the four sections, each with concrete ordered steps", () => {
    expect(runbook, "docs/runbooks/restore-rollback-alerts.md is missing").not.toBe("");
    const [backup, rollback, alerting, decisions] = [/Backup and restore/i, /Rollback/i, /Alerting/i, /Owner decisions needed/i].map((h) => section(h));
    for (const [name, body] of Object.entries({ backup, rollback, alerting, decisions })) expect(body, `${name} section`).not.toBe("");
    expect(backup).toMatch(/what is backed up/i);
    expect(isOrdered(between(backup, "### Restore steps", "Verification queries")), "restore steps are numbered 1..n").toBe(true);
    expect(backup).toMatch(/```sql[\s\S]+?__drizzle_migrations[\s\S]+?```/);
    expect(isOrdered(rollback), "rollback steps are numbered 1..n").toBe(true);
    expect(rollback).toMatch(/criteria/i);
    expect(rollback).toMatch(/roll[- ]forward/i);
    for (const alert of [/error rate/i, /auth(entication)? failures/i, /job failures/i, /backup age/i]) {
      const row = alerting.split("\n").find((line) => line.startsWith("|") && alert.test(line));
      expect(row, `alert row ${alert} with a numeric threshold and an owner placeholder`).toMatch(/\d[\s\S]*<owner>/);
    }
    const items = decisions.split("\n").filter((line) => /^(\d+\.|-) \S/.test(line));
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) expect(item, "owner decision has a default (REQ-FL-68-5)").toMatch(/Default: \S/);
  });

  it("@issue-68 AC1: the restore proves the dump in a scratch database, then swaps it in all-or-nothing, with writers and backup held back", () => {
    expect(between(runbook, "6. Stop", "7. Prove")).toMatch(/dc stop web worker backup/); // else backup marks an empty DB LAST_OK
    const scratch = between(runbook, "7. Prove", "8. Check");
    expect(scratch, "full restore of the data, not a table-of-contents listing").toMatch(/createdb[\s\S]*pg_restore .*-d flowline_restore .*--single-transaction --exit-on-error/);
    expect(between(runbook, "8. Check", "9. Swap"), "snapshot time from the archive header, not the run table").toMatch(/Archive created at/);
    expect(runbook, "max(created_at) is no cutoff marker: an idle beta has no run near the dump").not.toMatch(/max\(created_at\)/);
    const swap = between(runbook, "9. Swap", "10. Confirm");
    expect(swap).toMatch(/dropdb .*--force[\s\S]*alter database flowline_restore rename to flowline[\s\S]*pre-restore-\$UTC/);
    expect(swap).not.toMatch(/--clean/);
    expect(between(runbook, "11. Start", "12. Run"), "a release that caused the damage is not restarted").toMatch(/ruled out as the cause[\s\S]*flowline:\$PREV_SHA/);
    expect(between(runbook, "16. Only now", "17. Post"), "backup restarts only after the checks").toMatch(/dc up -d backup/);
  });

  it("@issue-68 AC1: commands are copy-pasteable shell, with variables defined once and no <placeholder> in a command", () => {
    // `<name>` in a POSIX shell is input redirection, so a pasted command with one fails or does the wrong thing.
    const commands = [...runbook.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).filter((c) => /^(dc|docker|git|node|curl|FLOWLINE_IMAGE=)\b/.test(c));
    expect(commands.length).toBeGreaterThan(10);
    for (const command of commands) expect(command, `command ${command}`).not.toMatch(/<[A-Za-z][\w-]*>/);
    const setup = runbook.match(/```sh\n([\s\S]+?)```/)?.[1] ?? "";
    for (const name of ["DEPLOY_DIR", "REPO_DIR", "BASE_URL", "PREV_SHA", "CURRENT_SHA", "UTC"]) expect(setup, `${name} is defined`).toMatch(new RegExp(`^${name}=|; ${name}=`, "m"));
    expect(setup).toMatch(/^dc\(\) \{/m);
    expect(setup, "dc exec/stop need the image variable too").toMatch(/^export FLOWLINE_IMAGE=/m);
    // An unscoped `up` would recreate `monitor` (losing its alert state) and `backup`; every `up` names its services.
    for (const command of commands.filter((c) => / dc up\b/.test(c))) expect(command, "scoped up").toMatch(/dc up -d( --wait)? (web worker|backup)$/);
    expect(setup).toMatch(/operator machine.*BASE_URL and REPO_DIR/); // the smoke steps run there, not on the beta host
    for (const command of commands.filter((c) => c.startsWith("node "))) expect(command, "repo scripts anchored at REPO_DIR").toMatch(/^node "\$REPO_DIR\/scripts\//);
    // DUMP_FILE is a bare file name, so "backups/$DUMP_FILE" never doubles the directory.
    expect(between(runbook, "2. Pick the dump:", "3. Record")).toMatch(/DUMP_FILE="flowline-[0-9TZ]+\.dump"/);
    expect(runbook).not.toMatch(/backups\/backups/);
    // From the deploy folder, `git diff -- drizzle/` would look at deploy/beta/drizzle/ and always print nothing.
    expect(section(/Rollback/i)).toMatch(/git -C "\$REPO_DIR" diff --stat "\$PREV_SHA" "\$CURRENT_SHA" -- drizzle\//);
    expect(runbook).toMatch(/FLOWLINE_ENCRYPTION_KEYS_OLD[\s\S]*FLOWLINE_PLATFORM_ENCRYPTION_KEYS_OLD/); // old rings are backed up too
    expect(section(/Rollback/i), "rollback image checked against its revision label").toMatch(/docker image inspect[^\n]*image\.revision/);
    expect(section(/Alerting/i), "a blank ops token silences the monitor").toMatch(/FLOWLINE_OPS_TOKEN. is non-empty/);
    for (const [path] of runbook.matchAll(/\S*artifacts\/phase-4\S*/g)) expect(path, "evidence paths anchored at REPO_DIR").toMatch(/^`\$REPO_DIR\/artifacts\//);
  });

  it("@issue-68 AC2: has no secrets, real identifiers or LIVE-trading content and keeps NileQuant PAPER only", () => {
    expect(runbook).toMatch(/NileQuant[^\n]*PAPER only/);
    const forbidden: RegExp[] = [
      /-----BEGIN [A-Z ]*KEY-----/, /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/, /\bsk-[A-Za-z0-9-]{16,}/, // private, payment, AI keys
      /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // GitHub, cloud, Slack tokens
      /hooks\.slack\.com|discord(app)?\.com\/api\/webhooks/i, // real alert webhooks
      /postgres(ql)?:\/\/[^\s<:]+:[^\s<@]+@/, /(PASSWORD|SECRET|TOKEN|KEY)=(?!<)\S/, // inline or assigned secrets
      /\b\d{1,3}(\.\d{1,3}){3}\b/, /https?:\/\/(?!<|localhost[:/])/, // IP addresses, real hosts (placeholders are <...>)
      /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|cloud|eg|ai)\b/i, /@[a-z0-9-]+\.[a-z]{2,}/i, // domains, e-mails
      /\blive[- ]?(trading|account|broker|order)s?\b/i, /\bLIVE\b/,
    ];
    for (const pattern of forbidden) expect(runbook, `matches ${pattern}`).not.toMatch(pattern);
  });

  it("@issue-68 AC3: is linked from OWNER_ACTIONS.md next to PP-06 (#30), statuses unchanged, and its links resolve", () => {
    const linkLine = ownerActions.split("\n").find((line) => /\]\(\.\.\/runbooks\/restore-rollback-alerts\.md\)/.test(line));
    expect(linkLine, "OWNER_ACTIONS.md links the runbook").toMatch(/PP-06[\s\S]*#30/);
    expect(ownerActions).toMatch(/^\| O04 \| Existing domain \/ secure Pi target \/ read-only access \| Pending inputs and exact approval;/m);
    expect(ownerActions).toMatch(/^\| O08 \| Beta deployment \| Not reached; requires verified host\/domain/m);
    const links = [...runbook.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]).filter((href) => !/^[a-z]+:/i.test(href));
    for (const href of links) expect(existsSync(resolve(dirname(runbookPath), href)), `link ${href}`).toBe(true);
  });

  it("@issue-68 AC4/AC5: the docs check passes and the whole change stays within ~300 lines", () => {
    const added = ["docs/runbooks/restore-rollback-alerts.md", "tests/unit/restore-rollback-alerts-runbook.test.ts", "artifacts/issue-68/EVIDENCE.md"];
    expect(checkDocs([...added, "docs/implementation/OWNER_ACTIONS.md"]).passed).toBe(true);
    // Runbook + this test + EVIDENCE.md (records the matching `git diff --shortstat`) + the 2-line OWNER_ACTIONS.md link.
    expect(added.reduce((sum, path) => sum + lineCount(read(path)), 2)).toBeLessThanOrEqual(300);
  });
});
