import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

const REPO = "AbdelrhmanAh7/FlowLine_Web";

// GitHub closes an issue on merge when a PR body, or a commit reaching the default branch, puts a
// closing keyword before it: close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved, any case,
// optional colon, then "#N" or "owner/repo#N" (GitHub docs); a full issue URL is guarded too.
// The lookbehind skips the plain-English "only the owner closes #N", which is not a link directive.
const closingLink = (issue: number) =>
  new RegExp(
    String.raw`(?<!\bowner(?:'s)? )\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s*` +
      String.raw`(#|${REPO}#|https://github\.com/${REPO}/issues/)${issue}\b`,
    "i",
  );

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
});

// Root cause of the PR #185 (#162) and PR #213 (#160) loops: any wording that attaches a closing
// keyword to an owner-tracking issue lets GitHub close it on merge. The repo must never tell an
// author to do that, so guard every file that documents how to link a PR, the owner-actions doc
// and the ledgers that point at it, for every owner-tracking issue.
describe("no closing keyword targets an owner-tracking issue", () => {
  it("recognises every closing form GitHub accepts, and nothing else", () => {
    const link = closingLink(160);
    for (const s of ["Closes #160", "fixed: #160", `RESOLVE ${REPO}#160`, `close https://github.com/${REPO}/issues/160`]) {
      expect(s).toMatch(link);
    }
    for (const s of ["Refs #160", "only the owner closes #160", "Closes #1600", "closest #160"]) expect(s).not.toMatch(link);
  });

  const GUARDED = [
    "AGENTS.md",
    "docs/GITHUB_WORKFLOW.md",
    ".github/pull_request_template.md",
    "docs/implementation/OWNER_ACTIONS.md",
    "NEXT_ACTION.md",
    "docs/implementation/PHASE4_BETA_REPORT.md",
  ];
  it.each(GUARDED.flatMap((path) => [162, 160].map((issue): [string, number] => [path, issue])))(
    "%s never attaches a closing keyword to #%i",
    (path, issue) => {
      expect(read(path)).not.toMatch(closingLink(issue));
    },
  );
});

// Issue #160 (secret scanning with push protection, Dependabot alerts, Copilot code review) is
// owner-only and deferred until after the pilot; PR #213 only records the owner's steps. QA round 1
// on PR #213 read an evidence example ("Secret scanning: enabled") as a claim that the settings were
// on, and found the steps restated in AI_QUESTIONS.md, NEXT_ACTION.md and the beta report. The steps
// and the record of what the owner did now live in one OWNER_ACTIONS.md section; this pins that.
describe("issue #160: one honest record of the owner's GitHub security steps", () => {
  const OWNER_ACTIONS = "docs/implementation/OWNER_ACTIONS.md";
  // Ledger entries that only point at the section.
  const POINTERS = ["NEXT_ACTION.md", "docs/implementation/PHASE4_BETA_REPORT.md"];
  const sections = (path: string) => read(path).split(/\n(?=## )/);
  const notesOn160 = (path: string) => sections(path).filter((s) => /^## .*#160\b/.test(s));
  const section = () => {
    const found = sections(OWNER_ACTIONS).filter((s) => s.startsWith("## Issue #160:"));
    expect(found, "OWNER_ACTIONS.md has one '## Issue #160:' section").toHaveLength(1);
    return found[0];
  };
  // GitHub's heading anchor: link text kept, lower case, punctuation dropped, spaces become hyphens.
  const anchor = (heading: string) =>
    heading
      .replace(/^#+\s*/, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/ /g, "-");

  it("links #160 with Refs, never a closing keyword", () => {
    expect(section()).toContain("`Refs #160`, never with a closing keyword");
  });

  it("marks each criterion unverified, or enabled/disabled only next to dated evidence on #160", () => {
    const rows = section()
      .split("\n")
      .filter((line) => /^\|\s*AC\d\s*\|/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
    expect(rows.map(([ac]) => ac)).toEqual(["AC1", "AC2", "AC3"]);
    for (const [ac, , status, evidence] of rows) {
      expect(["unverified", "enabled", "disabled"], ac).toContain(status);
      if (status === "unverified") continue;
      expect(evidence, ac).toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
      expect(evidence, ac).toContain(`https://github.com/${REPO}/issues/160#issuecomment-`);
    }
  });

  it("gives the evidence comment as a template, never a filled-in state, and says what it must not contain", () => {
    const template = /```text\n([\s\S]*?)```/.exec(section())?.[1];
    expect(template, "a ```text evidence template").toBeDefined();
    expect(template).toContain("YYYY-MM-DD");
    expect(template).toContain("<enabled|disabled>");
    expect((template ?? "").replaceAll("<enabled|disabled>", "")).not.toMatch(/\b(enabled|disabled)\b/i);
    expect(section()).toMatch(/Never record secret values[^.]*Dependabot alert/);
  });

  it.each([
    ["AC1", ["Advanced Security", "Secret Protection", "Push protection"]],
    ["AC2", ["Advanced Security", "Dependabot alerts"]],
    ["AC3", ["Rulesets", "New branch ruleset", "Automatically request Copilot code review"]],
  ])("gives %s an exact Settings path", (ac, labels) => {
    const stepStart = new RegExp(String.raw`^\d\. \*\*${ac}\b`);
    const step = section().split("\n").find((line) => stepStart.test(line));
    expect(step, `numbered owner step for ${ac}`).toBeDefined();
    expect(step).toContain("Settings →");
    for (const label of labels) expect(step).toContain(label);
  });

  it.each(POINTERS)("%s links its #160 entry to that section", (path) => {
    const notes = notesOn160(path);
    expect(notes).toHaveLength(1);
    const anchors = [...notes[0].matchAll(/OWNER_ACTIONS\.md#([^)\s]+)/g)].map((m) => m[1]);
    expect(anchors).toContain(anchor(section().split("\n")[0]));
  });

  it.each(POINTERS)("%s does not restate the #160 owner steps", (path) => {
    for (const note of notesOn160(path)) expect(note).not.toContain("Settings →");
    for (const label of ["Enable Secret Protection", "New branch ruleset", "Automatically request Copilot code review"]) {
      expect(read(path)).not.toContain(label);
    }
  });
});
