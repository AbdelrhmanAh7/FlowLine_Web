import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Issue #435: plain HTML elements (<code>, <span>) with className="data" in node-config.tsx
 * display machine text (code refs like "$steps.<id>", cron previews, field names) that must
 * stay left-to-right in Arabic/RTL.
 *
 * The <Input> and <Textarea> UI components auto-add dir="ltr" via the machineDir() helper in
 * fields.tsx, but raw HTML tags bypass that. This test catches any <code> or <span> with
 * className="data" that lacks dir="ltr".
 */
describe("node-config.tsx RTL safety", () => {
  const src = readFileSync("src/components/builder/node-config.tsx", "utf8");
  const lines = src.split("\n");

  it('every <code className="data"> has dir="ltr"', () => {
    const offenders: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Match <code with className containing "data" but no dir="ltr"
      if (/<code\b[^>]*className="[^"]*\bdata\b[^"]*"/.test(line) && !/dir="ltr"/.test(line)) {
        offenders.push(`line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(offenders, "<code> elements with className data must have dir=\"ltr\" for Arabic RTL").toEqual([]);
  });

  it('every <span className="data ..."> has dir="ltr"', () => {
    const offenders: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Match <span with className containing "data" but no dir="ltr"
      if (/<span\b[^>]*className="[^"]*\bdata\b[^"]*"/.test(line) && !/dir="ltr"/.test(line)) {
        offenders.push(`line ${i + 1}: ${line.trim()}`);
      }
    }
    expect(offenders, "<span> elements with className data must have dir=\"ltr\" for Arabic RTL").toEqual([]);
  });
});
