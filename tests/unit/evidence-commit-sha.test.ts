import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const report = resolve(__dirname, "../../docs/evidence/470/EVIDENCE.md");

it("@issue-470 AC1: evidence names one full immutable tested commit", () => {
  const content = readFileSync(report, "utf8");
  expect(content.match(/^- Commit SHA: .+$/gm)).toHaveLength(1);
  expect(content).toMatch(/^- Commit SHA: `[a-f0-9]{40}`$/m);
});

it("@issue-470 AC2: evidence omits the duplicated engine entry", () => {
  expect(readFileSync(report, "utf8")).not.toMatch(/^.*Node engine\s*:/im);
});
