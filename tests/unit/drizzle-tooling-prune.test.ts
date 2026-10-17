import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Drizzle Kit unused loader removal", () => {
  it("keeps the audited Kit version and verifies its shipped runtime never references the removed loader", () => {
    const require = createRequire(import.meta.url);
    const folder = dirname(require.resolve("drizzle-kit"));
    expect(JSON.parse(readFileSync(join(folder, "package.json"), "utf8")).version).toBe("0.31.11");
    const shippedRuntime = readdirSync(folder).filter((file) => /\.(?:cjs|mjs|js)$/.test(file));
    expect(shippedRuntime).toContain("bin.cjs");
    for (const file of shippedRuntime) {
      expect(readFileSync(join(folder, file), "utf8"), file).not.toMatch(/@esbuild-kit\/(?:esm-loader|core-utils)/);
    }
    const kitRequire = createRequire(join(folder, "bin.cjs"));
    expect(() => kitRequire.resolve("@esbuild-kit/esm-loader")).toThrow();
    expect(() => kitRequire.resolve("@esbuild-kit/core-utils")).toThrow();
  });
  it("removes the vulnerable binary graph from the lockfile instead of suppressing the advisory", () => {
    const lock = readFileSync("pnpm-lock.yaml", "utf8");
    expect(lock).not.toMatch(/@esbuild-kit\/(?:esm-loader|core-utils)@/);
    expect(lock).not.toMatch(/(?:^|\n)\s+['"]?(?:@esbuild\/[^:]+|esbuild)@0\.18\.20:/);
    expect(lock).toContain("esbuild@0.25.12:");
  });
});
