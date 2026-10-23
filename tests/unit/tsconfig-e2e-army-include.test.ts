import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tsconfig e2e-army inclusion and documentation", () => {
  it("does not exclude e2e-army from tsconfig.json while preserving other excludes", () => {
    const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
    expect(existsSync(tsconfigPath)).toBe(true);
    const content = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
    const excludeList = content.exclude ?? [];

    expect(excludeList).not.toContain("e2e-army");
    expect(excludeList).toContain("node_modules");
    expect(excludeList).toContain(".next-test");
    expect(excludeList).toContain("artifacts");
  });

  it("updates docs/DEVELOPER_GUIDE.md to mention devDependencies and typechecking without exclusion wording", () => {
    const guidePath = resolve(process.cwd(), "docs/DEVELOPER_GUIDE.md");
    expect(existsSync(guidePath)).toBe(true);
    const text = readFileSync(guidePath, "utf-8");

    expect(text).not.toContain("excludes e2e-army");
    expect(text).toContain("@e2e-dev/web");
    expect(text).toContain("0.18.0");
    expect(text).toContain("e2e-army/` is type-checked by `pnpm typecheck`");
  });

  it("confirms e2e-army/lib.ts exists and exports expected helpers", () => {
    const libPath = resolve(process.cwd(), "e2e-army/lib.ts");
    expect(existsSync(libPath)).toBe(true);
    const text = readFileSync(libPath, "utf-8");
    expect(text).toContain("needsModel");
    expect(text).toContain("appUrl");
    expect(text).toContain("apiBase");
  });
});
