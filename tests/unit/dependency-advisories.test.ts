import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
}

export function parseSemVer(v: string): SemVer | null {
  const clean = v.split("+")[0]!.split("(")[0]!.trim();
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z.-]+))?$/.exec(clean);
  if (!match) return null;

  const major = Number.parseInt(match[1]!, 10);
  const minor = Number.parseInt(match[2]!, 10);
  const patch = Number.parseInt(match[3]!, 10);
  const prereleaseStr = match[4];

  const prerelease: Array<string | number> = [];
  if (prereleaseStr) {
    for (const id of prereleaseStr.split(".")) {
      if (/^[0-9]+$/.test(id)) {
        prerelease.push(Number.parseInt(id, 10));
      } else {
        prerelease.push(id);
      }
    }
  }

  return { major, minor, patch, prerelease };
}

export function compareSemVer(aStr: string, bStr: string): number {
  const a = parseSemVer(aStr);
  const b = parseSemVer(bStr);
  if (!a || !b) throw new Error(`Invalid semver: ${aStr} or ${bStr}`);

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  const aHasPre = a.prerelease.length > 0;
  const bHasPre = b.prerelease.length > 0;

  if (!aHasPre && !bHasPre) return 0;
  if (!aHasPre && bHasPre) return 1;
  if (aHasPre && !bHasPre) return -1;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const aId = a.prerelease[i];
    const bId = b.prerelease[i];

    if (aId === undefined) return -1;
    if (bId === undefined) return 1;

    if (typeof aId === "number" && typeof bId === "number") {
      if (aId !== bId) return aId > bId ? 1 : -1;
    } else if (typeof aId === "string" && typeof bId === "string") {
      if (aId !== bId) return aId < bId ? -1 : 1;
    } else {
      return typeof aId === "number" ? -1 : 1;
    }
  }

  return 0;
}

export function semverGte(v: string, min: string): boolean {
  return compareSemVer(v, min) >= 0;
}

// Dependabot alert #3 (GHSA-68fv-2mgg-jv7q): source-map-js below 1.2.2 is vulnerable. The override stays on the
// 1.x line that PostCSS and Tailwind declare, so a future 2.x is not forced on them.
const PATCHED_SOURCE_MAP_JS = "1.2.2";
const NEXT_SOURCE_MAP_JS_MAJOR = "2.0.0-0";

// Every source-map-js version the lockfile names, as a package key (`source-map-js@1.2.2:`) or a
// dependency entry (`source-map-js: 1.2.2`). Versions are read whole, so 1.2.10 is never taken for 1.2.1.
export function lockedSourceMapJsVersions(lockfile: string): string[] {
  const regex =
    /(?<![\w@/.-])source-map-js(?:@|:\s*['"]?)([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/g;
  return [...lockfile.matchAll(regex)].map((m) => m[1]!);
}

export function vulnerableSourceMapJs(lockfile: string): string[] {
  return lockedSourceMapJsVersions(lockfile).filter((version) => !semverGte(version, PATCHED_SOURCE_MAP_JS));
}

export function incompatibleSourceMapJs(lockfile: string): string[] {
  return lockedSourceMapJsVersions(lockfile).filter((version) => semverGte(version, NEXT_SOURCE_MAP_JS_MAJOR));
}

const lockfileWith = (version: string) =>
  [
    "packages:",
    `  source-map-js@${version}:`,
    "    resolution: {integrity: sha512-fixture}",
    "snapshots:",
    "  postcss@8.5.28:",
    "    dependencies:",
    `      source-map-js: ${version}`,
  ].join("\n");

// Inline code spans that start with a shell command must paste as they are: `pnpm why <package>` makes a POSIX
// shell read `<package>` as input redirection from a file named "package".
const SHELL_COMMAND = /^(?:pnpm|npx|node|gh|git)\s/;
const ANGLE_PLACEHOLDER = /<[^<>\s]+>/;

export function unpastableCommands(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1]!)
    .filter((code) => SHELL_COMMAND.test(code) && ANGLE_PLACEHOLDER.test(code));
}

// Hand-typed links drift: a run link cited as `AbdelrahmanAh7/...` points at a repository that does not exist.
const REPO_SLUG = "AbdelrhmanAh7/FlowLine_Web";

export function foreignRepoLinks(markdown: string): string[] {
  return [...markdown.matchAll(/(?:github\.com\/|repos\/)([\w.-]+\/FlowLine_Web)\b/gi)]
    .map((m) => m[1]!)
    .filter((slug) => slug !== REPO_SLUG);
}

// The active phase's status ledger (AGENTS.md, "Docs (mandatory)") keeps one "## … (issue #N)" section per task. A
// merge of main has already conflicted in it, so the #62 section is checked here rather than trusted to survive.
const PHASE_LEDGER = "docs/implementation/PHASE4_BETA_REPORT.md";

export function ledgerSection(markdown: string, issue: number): string | undefined {
  const heading = new RegExp(`^## .*\\(issue #${issue}\\)\\s*$`);
  return markdown.split(/^(?=## )/m).find((section) => heading.test(section.split("\n")[0]!));
}

export function relativeLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\((?![a-z]+:|#)([^)#\s]+)[^)]*\)/gi)].map((m) => m[1]!);
}

describe("dependency advisories security check", () => {
  it("semver comparison correctly handles prereleases and stable versions", () => {
    expect(semverGte("1.2.1", "1.2.2")).toBe(false);
    expect(semverGte("1.2.2-beta.1", "1.2.2")).toBe(false);
    expect(semverGte("1.2.2-rc.2", "1.2.2")).toBe(false);
    expect(semverGte("1.2.2", "1.2.2")).toBe(true);
    expect(semverGte("1.2.2+build.1", "1.2.2")).toBe(true);
    expect(semverGte("1.2.3-alpha.1", "1.2.2")).toBe(true);
    expect(semverGte("1.2.3", "1.2.2")).toBe(true);
    // SemVer §11: alphanumeric prerelease identifiers compare in ASCII order, whatever the locale ("B" < "a").
    expect(compareSemVer("1.2.2-B", "1.2.2-a")).toBe(-1);
    expect(compareSemVer("1.2.2-alpha.Z", "1.2.2-alpha.a")).toBe(-1);
    expect(compareSemVer("1.2.2-rc", "1.2.2-beta")).toBe(1);
  });

  it("flags only versions below 1.2.2 and accepts later patches such as 1.2.10", () => {
    // Versions are compared whole and by semver, never by substring: 1.2.10 is read as 1.2.10, not as 1.2.1.
    expect(lockedSourceMapJsVersions(lockfileWith("1.2.10"))).toEqual(["1.2.10", "1.2.10"]);
    expect(vulnerableSourceMapJs(lockfileWith("1.2.10"))).toEqual([]);
    expect(vulnerableSourceMapJs(lockfileWith("1.2.2"))).toEqual([]);
    expect(vulnerableSourceMapJs(lockfileWith("1.2.1"))).toEqual(["1.2.1", "1.2.1"]);
    expect(vulnerableSourceMapJs(lockfileWith("1.2.2-beta.1"))).toEqual(["1.2.2-beta.1", "1.2.2-beta.1"]);
    expect(incompatibleSourceMapJs(lockfileWith("1.99.0"))).toEqual([]);
    expect(incompatibleSourceMapJs(lockfileWith("2.0.0-beta.1"))).toEqual(["2.0.0-beta.1", "2.0.0-beta.1"]);
    expect(incompatibleSourceMapJs(lockfileWith("2.0.0"))).toEqual(["2.0.0", "2.0.0"]);
    // Packages whose names merely end in source-map-js are not read as source-map-js.
    expect(lockedSourceMapJsVersions("  '@scope/source-map-js@1.0.0':\n      not-source-map-js: 1.0.0")).toEqual([]);
  });

  it("@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2 and < 2", () => {
    const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
    expect(lockedSourceMapJsVersions(lockfile).length).toBeGreaterThan(0);
    expect(vulnerableSourceMapJs(lockfile)).toEqual([]);
    expect(incompatibleSourceMapJs(lockfile)).toEqual([]);
    const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/^ {2}"source-map-js": ">=1\.2\.2 <2"$/m);
    expect(lockfile).toMatch(/^ {2}source-map-js: '>=1\.2\.2 <2'$/m);
  });

  it("commands in the advisory docs and #62 evidence paste into a shell without <placeholders>", () => {
    expect(unpastableCommands("Run `pnpm why <package>` and `pnpm why source-map-js`.")).toEqual(["pnpm why <package>"]);
    expect(unpastableCommands("`vitest run tests/unit/<file>.test.ts` and `<tr>`")).toEqual([]);
    expect(unpastableCommands("`pnpm exec vitest run tests/unit/<file>.test.ts`")).toHaveLength(1);
    for (const doc of ["docs/security/DEPENDENCIES.md", "artifacts/phase-4/issue-62/EVIDENCE.md"]) {
      expect(unpastableCommands(readFileSync(join(root, doc), "utf8")), doc).toEqual([]);
    }
  });

  it("links in the advisory docs and #62 evidence point at this repository", () => {
    expect(foreignRepoLinks("[run](https://github.com/AbdelrahmanAh7/FlowLine_Web/actions/runs/1)")).toEqual([
      "AbdelrahmanAh7/FlowLine_Web",
    ]);
    expect(foreignRepoLinks("`gh api 'repos/AbdelrhmanAh7/FlowLine_Web/dependabot/alerts'`")).toEqual([]);
    for (const doc of ["docs/security/DEPENDENCIES.md", "artifacts/phase-4/issue-62/EVIDENCE.md"]) {
      expect(foreignRepoLinks(readFileSync(join(root, doc), "utf8")), doc).toEqual([]);
    }
  });

  it("#62 evidence counts only a CI gate run as the fast tier, not the local focused checks", () => {
    const evidence = readFileSync(join(root, "artifacts/phase-4/issue-62/EVIDENCE.md"), "utf8");
    const fastTierRow = evidence.split("\n").find((line) => line.startsWith("| REQ-FL-62-3 "));
    expect(fastTierRow, "REQ-FL-62-3 row").toBeDefined();
    expect(fastTierRow).toMatch(/\]\(https:\/\/github\.com\/AbdelrhmanAh7\/FlowLine_Web\/actions\/runs\/\d+\)/);
    expect(fastTierRow).toMatch(/`gate`/);
    expect(fastTierRow).toMatch(/not counted as the fast tier/);
  });

  it("the Phase 4 ledger records #62 with its evidence and the pending post-merge alert check", () => {
    const fixture = "# Report\n\n## Other task — 2026-10-12 (issue #61)\n\nSee [x](../x.md#top).\n\n### Sub (issue #62)\n";
    expect(ledgerSection(fixture, 62)).toBeUndefined();
    expect(relativeLinks(ledgerSection(fixture, 61)!)).toEqual(["../x.md"]);

    const entry = ledgerSection(readFileSync(join(root, PHASE_LEDGER), "utf8"), 62);
    expect(entry, `${PHASE_LEDGER} has a "## … (issue #62)" section`).toBeDefined();
    expect(entry).toMatch(/source-map-js": ">=1\.2\.2 <2"/);
    expect(entry).toMatch(/\*\*Pending after PR #77 merges:\*\* alert #3 closed as `fixed`/);
    const links = relativeLinks(entry!);
    expect(links).toEqual(expect.arrayContaining(["../../artifacts/phase-4/issue-62/EVIDENCE.md", "../../NEXT_ACTION.md"]));
    for (const link of links) expect(existsSync(join(root, dirname(PHASE_LEDGER), link)), link).toBe(true);
    expect(readFileSync(join(root, "NEXT_ACTION.md"), "utf8")).toMatch(/^\d+\. After PR #77 \(issue #62\b.*alert #3/m);
  });
});
