import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      if (aId !== bId) return aId.localeCompare(bId);
    } else {
      return typeof aId === "number" ? -1 : 1;
    }
  }

  return 0;
}

export function semverGte(v: string, min: string): boolean {
  return compareSemVer(v, min) >= 0;
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
  });

  it("@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2", () => {
    const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
    const regex =
      /(?:['"]?source-map-js@|(?<![a-zA-Z0-9_-])source-map-js:\s*['"]?)([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/g;
    const matches = [...lockfile.matchAll(regex)].map((m) => m[1]!);

    expect(matches.length).toBeGreaterThan(0);

    const vulnerable = matches.filter((ver) => !semverGte(ver, "1.2.2"));
    expect(vulnerable).toEqual([]);
    expect(lockfile).not.toContain("source-map-js@1.2.1");
  });
});
