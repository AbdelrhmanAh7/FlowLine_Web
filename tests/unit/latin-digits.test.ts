import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDue } from "@/company-builder/format";
import { formatDate, formatNumber } from "@/i18n/format";

/**
 * Product rule (owner decision 2026-10-01): digits are always 0–9 across Flowline, Arabic UI included — ids, versions,
 * times, dates, currencies, percentages, phone numbers and metrics. Arabic text and RTL are unchanged. Text a person
 * typed (e.g. approved information) is shown as written.
 */
const NON_LATIN_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/;

describe("Latin digits everywhere", () => {
  it("locale formatting in Arabic produces 0–9", () => {
    expect(formatNumber("ar", 1284)).toMatch(/1,?284/);
    expect(formatNumber("ar", 250, { style: "currency", currency: "EGP" })).not.toMatch(NON_LATIN_DIGITS);
    expect(formatDate("ar", "2026-10-02T06:30:00Z", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })).toMatch(/0?6:30/);
    expect(formatDue("2026-10-02T06:30:00Z", "ar", "Africa/Cairo")).not.toMatch(NON_LATIN_DIGITS);
    for (const s of [formatNumber("ar", 0.125, { style: "percent" }), formatDate("ar", Date.UTC(2026, 9, 2))]) expect(s, s).not.toMatch(NON_LATIN_DIGITS);
  });
  it("no product copy, component or formatter contains Arabic-Indic or Persian digits (input normalisation tables excepted)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && p !== join("src", "company-builder", "packs", "customer-follow-up.ts")) {
          readFileSync(p, "utf8").split("\n").forEach((l, i) => NON_LATIN_DIGITS.test(l) && offenders.push(`${p}:${i + 1}`));
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
  it("no formatter asks for a non-Latin numbering system", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /nu-(arab|arabext|persian)/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
