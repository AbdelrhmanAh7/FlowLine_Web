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
});
