import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function parseVersion(v: string): [number, number, number] {
  const [major, minor, patch] = v.split(".").map((n) => Number.parseInt(n, 10));
  return [major ?? 0, minor ?? 0, patch ?? 0];
}

function isGte(v: string, min: string): boolean {
  const [maj1, min1, pat1] = parseVersion(v);
  const [maj2, min2, pat2] = parseVersion(min);
  if (maj1 !== maj2) return maj1 > maj2;
  if (min1 !== min2) return min1 > min2;
  return pat1 >= pat2;
}

describe("dependency advisories security check", () => {
  it("@issue-62 AC1: lockfile resolves source-map-js >= 1.2.2", () => {
    const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
    const matches = [...lockfile.matchAll(/(?:['"]?source-map-js@|source-map-js:\s*)([0-9]+\.[0-9]+\.[0-9]+)/g)].map(
      (m) => m[1]!,
    );

    expect(matches.length).toBeGreaterThan(0);

    const vulnerable = matches.filter((ver) => !isGte(ver, "1.2.2"));
    expect(vulnerable).toEqual([]);
    expect(lockfile).not.toContain("source-map-js@1.2.1");
  });
});
