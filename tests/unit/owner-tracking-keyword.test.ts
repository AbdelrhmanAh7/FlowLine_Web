import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

// Issue #162 tracks founder-only actions and must stay open until the owner closes it (PR #185 review).
// Every place that tells a PR author how to link an issue must carve out owner-tracking issues.
describe("owner-tracking issues are linked with 'Refs #N', never 'Closes #N'", () => {
  it.each([
    "AGENTS.md",
    "docs/GITHUB_WORKFLOW.md",
    ".github/pull_request_template.md",
  ])("%s names the non-closing Refs rule for owner-only/needs-owner issues", (path) => {
    const text = read(path);
    expect(text).toMatch(/Refs #(N|162)/);
    expect(text).toMatch(/owner-only|owner-tracking/);
  });

  it("OWNER_ACTIONS.md forbids closing keywords for #162", () => {
    const text = read("docs/implementation/OWNER_ACTIONS.md");
    expect(text).toContain("`Refs #162`");
    expect(text).toMatch(/never with a closing keyword/);
  });

  // The PR #185 threads recurred because the tracking doc never recorded HOW #162 stays open
  // when the branch (whose own commit messages quote the keyword) is squash-merged. The doc
  // now states the two checks the merger must repeat; this pins them so a rewrite cannot drop it.
  it("OWNER_ACTIONS.md records how PR #185 keeps #162 open through the merge", () => {
    const text = read("docs/implementation/OWNER_ACTIONS.md");
    expect(text).toContain("closingIssuesReferences");
    expect(text).toMatch(/fast-forward/);
    expect(text).toMatch(/Refs #162/);
  });

  // The PR #185 review asked to "check that no commit message contains Closes/Fixes/Resolves #162".
  // The repo cannot see the live PR body from a unit test, so the doc must carry the repeatable
  // verification (the API fields to read and the commit-subject scan) and this pins it.
  it("OWNER_ACTIONS.md records the repeatable verification of the live PR body", () => {
    const text = read("docs/implementation/OWNER_ACTIONS.md");
    expect(text).toMatch(/verified \d{4}-\d{2}-\d{2}/);
    expect(text).toContain("gh pr view 185 --json body,closingIssuesReferences");
    expect(text).toContain("git log --format=%s origin/main..HEAD");
  });

  // Root cause of the PR #185 loop: any wording that attaches a closing keyword
  // (Closes/Fixes/Resolves) to #162 lets GitHub close the founder's tracking issue on
  // merge. The repo must never tell an author to do that, so guard every file that
  // documents how to link a PR and the tracking doc itself. The lookbehind skips the
  // plain-English "only the owner closes #162", which is not a link directive.
  const CLOSING_LINK = /(?<!\bowner )(?<!\bowner's )\b(closes|fixes|resolves)\s*:?\s*#162\b/i;
  it.each([
    "AGENTS.md",
    "docs/GITHUB_WORKFLOW.md",
    "docs/implementation/OWNER_ACTIONS.md",
    ".github/pull_request_template.md",
  ])("%s never attaches a closing keyword to issue #162", (path) => {
    expect(read(path)).not.toMatch(CLOSING_LINK);
  });
});
