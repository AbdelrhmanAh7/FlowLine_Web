import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROUPS, checkManifest, expandSteps, groupFiles, listSpecFiles, resolveGroups } from "../../scripts/gate-groups.mjs";

const onDisk = readdirSync("e2e").filter((f) => f.endsWith(".spec.ts")).map((f) => `e2e/${f}`).sort();

describe("gate groups: manifest coverage", () => {
  it("assigns every e2e spec to exactly one group (read from disk independently)", () => {
    const assigned = Object.keys(GROUPS).flatMap((g) => groupFiles(GROUPS, g)).sort();
    expect(assigned).toEqual(onDisk);
    expect(listSpecFiles()).toEqual(onDisk);
    expect(checkManifest()).toEqual([]);
  });

  it("flags a spec that no group lists", () => {
    const problems = checkManifest(GROUPS, [...onDisk, "e2e/brand-new.spec.ts"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("e2e/brand-new.spec.ts");
  });

  it("flags a spec in two groups and a listed spec that is gone", () => {
    const dup = { a: { description: "", specs: ["canvas"] }, b: { description: "", specs: ["canvas", "ghost"] } };
    const problems = checkManifest(dup, ["e2e/canvas.spec.ts"]);
    expect(problems.some((p) => p.includes("both"))).toBe(true);
    expect(problems.some((p) => p.includes("e2e/ghost.spec.ts") && p.includes("does not exist"))).toBe(true);
  });

  it("rejects empty groups, unsafe file names and names that would select another spec", () => {
    expect(checkManifest({ a: { description: "", specs: [] } }, [])).toContain('group "a" is empty');
    expect(checkManifest({ a: { description: "", specs: ["x; rm"] } }, ["e2e/x; rm.spec.ts"]).some((p) => p.includes("unsafe"))).toBe(true);
    const clash = checkManifest({ a: { description: "", specs: ["a", "b-a"] } }, ["e2e/a.spec.ts", "e2e/b-a.spec.ts"]);
    expect(clash.some((p) => p.includes("would also select"))).toBe(false); // the e2e/ prefix keeps them apart
    const nested = checkManifest({ a: { description: "", specs: ["a"] } }, ["e2e/a.spec.ts", "e2e/sub/e2e/a.spec.ts"]);
    expect(nested.some((p) => p.includes("would also select"))).toBe(true);
  });
});

describe("gate groups: selection", () => {
  it("resolves named groups to their concrete files without duplicates", () => {
    const sel = resolveGroups(["auth", "auth"]);
    expect(sel.groups).toEqual(["auth"]);
    expect(sel.files).toEqual(groupFiles(GROUPS, "auth"));
    expect(sel.files.every((f) => onDisk.includes(f))).toBe(true);
  });

  it("resolving every group yields every spec once", () => {
    expect([...resolveGroups(Object.keys(GROUPS)).files].sort()).toEqual(onDisk);
  });

  it("rejects unknown or empty selections", () => {
    expect(() => resolveGroups(["nope"])).toThrow(/unknown group "nope"/);
    expect(() => resolveGroups(["auth", "constructor"])).toThrow(/unknown group "constructor"/);
    expect(() => resolveGroups([])).toThrow(/at least one/);
  });
});

describe("gate groups: step aliases", () => {
  it("expands static into its checks and leaves other names alone", () => {
    expect(expandSteps(["static", "unit"])).toEqual(["lint", "typecheck", "evidence", "unit"]);
    expect(expandSteps(["lint", "static"])).toEqual(["lint", "typecheck", "evidence"]);
  });
});
