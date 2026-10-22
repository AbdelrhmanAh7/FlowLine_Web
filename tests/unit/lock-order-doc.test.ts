import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The rank table in docs/engineering/lock-order.md is the checklist reviewers apply ("take lower ranks first, never go
// back"). It once drifted from the code (issue #45 put the user lock before the email token, the table still ranked the
// token first), so it is pinned here together with the exceptions that go backward on purpose.
const doc = readFileSync(fileURLToPath(new URL("../../docs/engineering/lock-order.md", import.meta.url)), "utf8");
const rows = doc
  .split("\n")
  .filter((line) => /^\| \d+ \|/.test(line))
  .map((line) => {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    return { rank: Number(cells[0]), table: cells[2].replace(/`/g, ""), where: cells[3], notes: cells[4] };
  });
const rowOf = (table: string) => rows.find((r) => r.table === table)!;

describe("lock order rank table", () => {
  it("ranks the entities in the order the code takes them (user, token, session, account, workspace, member, audit)", () => {
    expect(rows.map((r) => [r.rank, r.table])).toEqual([
      [1, "user"],
      [2, "email_token"],
      [3, "session"],
      [4, "account"],
      [5, "workspace"],
      [6, "workspace_member"],
      [7, "audit_event"],
    ]);
  });

  it("puts the user before the email token and before the delete flow's workspace locks (#45)", () => {
    expect(rowOf("user").rank).toBeLessThan(rowOf("email_token").rank);
    expect(rowOf("email_token").rank).toBeLessThan(rowOf("workspace").rank);
    expect(rowOf("user").where).toContain("consumeAccountToken");
  });

  it("writes down every sequence that goes backward, with the reason it cannot deadlock", () => {
    // reset deletes sessions before writing accounts (rank 3 before 4), following global rank order (#41).
    expect(rowOf("account").notes).toMatch(/session.*before.*account|session/i);
    expect(rowOf("account").notes).toMatch(/user\s+row\s+first/i);
    // the audit insert key-share locks the workspace after the member row (rank 6 then 5), safe only with NO KEY UPDATE.
    expect(rowOf("workspace").notes).toMatch(/exception/i);
    expect(rowOf("workspace").notes).toMatch(/FOR NO KEY UPDATE/i);
    expect(rowOf("workspace").notes).toMatch(/FOR KEY SHARE/i);
    expect(rowOf("workspace_member").notes).toMatch(/backward/i);
  });
});
