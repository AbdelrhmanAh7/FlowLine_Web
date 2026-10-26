import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");

describe("GITHUB_WORKFLOW.md preserves critical merging documentation", () => {
  const doc = read("docs/GITHUB_WORKFLOW.md");

  it("AC1: has a '## Merging into main' heading and mentions 'main protection'", () => {
    expect(doc).toMatch(/^## Merging into main$/m);
    expect(doc).toMatch(/main protection/i);
  });

  it("AC2: names the required 'gate' and 'docs' checks", () => {
    expect(doc).toMatch(/`gate`/);
    expect(doc).toMatch(/`docs`/);
    // Both checks must be mentioned as required
    expect(doc).toMatch(/required.*`gate`.*`docs`|`gate`.*`docs`.*required|`gate` and `docs`.*check/i);
  });

  it("AC3: contains the full-tier run command with 'gh workflow run gate.yml' and 'tier=full'", () => {
    expect(doc).toMatch(/gh workflow run gate\.yml/);
    expect(doc).toMatch(/tier=full/);
  });

  it("AC4: contains 'Labels never start CI'", () => {
    expect(doc).toMatch(/Labels never start CI/i);
  });
});