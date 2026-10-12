import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

// A closing keyword (Closes/Fixes/Resolves) attached to an issue lets GitHub close it on merge.
// The lookbehinds skip the plain-English "only the owner closes #N", which is not a link directive.
const closingLink = (issue: number) =>
  new RegExp(String.raw`(?<!\bowner )(?<!\bowner's )\b(closes|fixes|resolves)\s*:?\s*#${issue}\b`, "i");

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
  // documents how to link a PR and the tracking doc itself.
  const CLOSING_LINK = closingLink(162);
  it.each([
    "AGENTS.md",
    "docs/GITHUB_WORKFLOW.md",
    "docs/implementation/OWNER_ACTIONS.md",
    ".github/pull_request_template.md",
  ])("%s never attaches a closing keyword to issue #162", (path) => {
    expect(read(path)).not.toMatch(CLOSING_LINK);
  });
});

// Issue #160 (secret scanning with push protection, Dependabot alerts, Copilot code review) is
// owner-only and deferred until after the pilot; PR #213 only records the owner's steps. QA round 1
// on PR #213 read an evidence example ("Secret scanning: enabled") as a claim that the settings were
// on, and found the steps restated in AI_QUESTIONS.md, NEXT_ACTION.md and the beta report. The steps
// and the record of what the owner did now live in one OWNER_ACTIONS.md section; this pins that.
describe("issue #160: one honest record of the owner's GitHub security steps", () => {
  const OWNER_ACTIONS = "docs/implementation/OWNER_ACTIONS.md";
  const section = () => {
    const text = read(OWNER_ACTIONS);
    const start = text.search(/^## Issue #160:/m);
    expect(start, "OWNER_ACTIONS.md has an '## Issue #160:' section").toBeGreaterThanOrEqual(0);
    const end = text.indexOf("\n## ", start + 1);
    return text.slice(start, end === -1 ? undefined : end);
  };
  // GitHub's heading anchor: lower case, punctuation dropped, spaces become hyphens.
  const anchor = (heading: string) =>
    heading.replace(/^#+\s*/, "").toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
  const notesOn160 = (path: string) => read(path).split(/\n(?=## )/).filter((s) => /^## .*#160\b/.test(s));

  it("marks each criterion unverified, or enabled only next to dated evidence on #160", () => {
    const rows = section()
      .split("\n")
      .filter((line) => /^\|\s*AC\d\s*\|/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    expect(rows.map(([ac]) => ac)).toEqual(["AC1", "AC2", "AC3"]);
    for (const [ac, , status, evidence] of rows) {
      expect(["unverified", "enabled"], ac).toContain(status);
      if (status !== "enabled") continue;
      expect(evidence, ac).toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
      expect(evidence, ac).toContain("https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/160#issuecomment-");
    }
  });

  it("gives the evidence comment as a template, never a filled-in state, and says what it must not contain", () => {
    const template = /```text\n([\s\S]*?)```/.exec(section())?.[1];
    expect(template, "a ```text evidence template").toBeDefined();
    expect(template).toContain("YYYY-MM-DD");
    expect(template).toContain("<enabled|disabled>");
    expect(template).not.toMatch(/:\s*(enabled|disabled)\b/i);
    expect(section()).toMatch(/Never record secret values[^.]*Dependabot alert/);
  });

  it.each([
    ["AC1", ["Advanced Security", "Secret Protection", "Push protection"]],
    ["AC2", ["Advanced Security", "Dependabot alerts"]],
    ["AC3", ["Rulesets", "New branch ruleset", "Automatically request Copilot code review"]],
  ])("gives %s an exact Settings path", (ac, labels) => {
    const step = section().split("\n").find((line) => new RegExp(String.raw`^\d\. \*\*${ac}\b`).test(line));
    expect(step, `numbered owner step for ${ac}`).toBeDefined();
    expect(step).toContain("Settings →");
    for (const label of labels) expect(step).toContain(label);
  });

  it.each(["NEXT_ACTION.md", "docs/implementation/PHASE4_BETA_REPORT.md"])("%s links its #160 entry to that section", (path) => {
    const notes = notesOn160(path);
    expect(notes).toHaveLength(1);
    const anchors = [...notes[0].matchAll(/OWNER_ACTIONS\.md#([^)\s]+)/g)].map((m) => m[1]);
    expect(anchors).toContain(anchor(section().split("\n")[0]));
  });

  it.each(["NEXT_ACTION.md", "docs/implementation/PHASE4_BETA_REPORT.md", "AI_QUESTIONS.md"])(
    "%s does not restate the #160 Settings paths",
    (path) => {
      for (const note of notesOn160(path)) expect(note).not.toContain("Settings →");
    },
  );

  it.each([OWNER_ACTIONS, "NEXT_ACTION.md", "docs/implementation/PHASE4_BETA_REPORT.md", "AI_QUESTIONS.md"])(
    "%s never attaches a closing keyword to issue #160",
    (path) => {
      expect(read(path)).not.toMatch(closingLink(160));
    },
  );
});
