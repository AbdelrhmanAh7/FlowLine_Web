import { describe, expect, it } from "vitest";
import { formatDue } from "@/company-builder/format";

describe("follow-up time formatting (explicit time zone) — BUG CB2-05", () => {
  const iso = "2026-10-02T06:00:00.000Z";
  it("names the zone in English and converts to it", () => {
    expect(formatDue(iso, "en", "UTC")).toMatch(/2 Oct 2026.*06:00.*UTC/);
    expect(formatDue(iso, "en", "Asia/Riyadh")).toMatch(/09:00/);
    expect(formatDue(iso, "en", "Asia/Riyadh")).toMatch(/GMT\+3|AST/);
  });
  it("Arabic keeps Arabic text but uses digits 0–9 and the Gregorian calendar (owner decision 2026-10-01)", () => {
    const ar = formatDue(iso, "ar", "Asia/Riyadh");
    expect(ar).toMatch(/[\u0621-\u064a]/); // Arabic month name
    expect(ar).toContain("2026");
    expect(ar).toContain("09:00");
    expect(ar).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
  });
  it("never throws: unknown zones fall back to UTC, invalid dates to the raw value", () => {
    expect(formatDue(iso, "en", "Mars/Olympus")).toMatch(/UTC/);
    expect(formatDue("not a date", "en", "UTC")).toBe("not a date");
  });
});
