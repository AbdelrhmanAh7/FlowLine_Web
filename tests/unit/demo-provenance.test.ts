import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readProvenance, writeProvenance } from "../../scripts/demo/provenance";
import { escapeRegExp } from "../../scripts/demo/scenarios/common";

describe("recording provenance", () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-prov-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it("round-trips the commit a clip was recorded from", () => {
    writeProvenance(dir, "d211653");
    expect(readProvenance(dir)).toBe("d211653");
  });
  it("refuses a recording without provenance instead of stamping the current HEAD", () => {
    const empty = mkdtempSync(join(tmpdir(), "demo-prov-"));
    expect(() => readProvenance(empty)).toThrow(/re-record/);
    writeFileSync(join(empty, "provenance.json"), "{}");
    expect(() => readProvenance(empty)).toThrow(/no uiCommit/);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("escapeRegExp", () => {
  it("makes translated text with regex metacharacters match literally", () => {
    const text = "Open run (inspector)? v1.0+";
    expect(new RegExp(escapeRegExp(text)).test(text)).toBe(true);
    expect(new RegExp(escapeRegExp(text)).test("Open run inspector v1x0")).toBe(false);
    expect(new RegExp(`${escapeRegExp("a|b")}`).test("a")).toBe(false);
  });
});
