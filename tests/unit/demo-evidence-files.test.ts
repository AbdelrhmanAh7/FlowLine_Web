import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// AGENTS.md "Evidence": only Markdown is committed under artifacts/ (screenshots go to the PR or a CI artifact).
describe("artifacts/issue-99", () => {
  it("tracks Markdown only (contact sheets are attached to the PR, not committed)", () => {
    const r = spawnSync("git", ["ls-files", "artifacts/issue-99"], { encoding: "utf8" });
    const files = r.stdout.split("\n").filter(Boolean);
    expect(files.filter((f) => !f.endsWith(".md"))).toEqual([]);
  });
});
