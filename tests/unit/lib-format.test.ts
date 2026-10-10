import { describe, expect, it } from "vitest";
import { duration, initials, percent, pretty, timeAgo } from "@/lib/format";
import { CATALOGUES } from "@/i18n/translate";

describe("lib/format helpers", () => {
  describe("percent", () => {
    it("renders nullish as an em dash", () => {
      expect(percent(null)).toBe("—");
      expect(percent(undefined)).toBe("—");
    });
    it("formats the ratio with one decimal", () => {
      expect(percent(0.1234)).toBe("12.3%");
      expect(percent(0)).toBe("0.0%");
      expect(percent(1)).toBe("100.0%");
    });
  });

  describe("pretty", () => {
    it("renders undefined as an em dash", () => {
      expect(pretty(undefined)).toBe("—");
    });
    it("stringifies objects with a two-space indent", () => {
      const value = { flow: "greet", steps: 2 };
      expect(pretty(value)).toBe(JSON.stringify(value, null, 2));
    });
    it("stringifies null as \"null\"", () => {
      expect(pretty(null)).toBe("null");
    });
  });

  describe("initials", () => {
    it("takes up to two letters, ignoring blank runs", () => {
      expect(initials("ada")).toBe("A");
      expect(initials("ada lovelace")).toBe("AL");
      expect(initials("ada king lovelace")).toBe("AK");
      expect(initials("  ada   lovelace  ")).toBe("AL");
      expect(initials("")).toBe("");
    });
  });

  describe("duration", () => {
    it("formats milliseconds, seconds and minutes (en)", () => {
      expect(duration(850)).toBe("850ms");
      expect(duration(12300)).toBe("12.3s");
      expect(duration(125000)).toBe("2m 5s");
    });
    it("renders nullish as an em dash", () => {
      expect(duration(null)).toBe("—");
      expect(duration(undefined)).toBe("—");
    });
    it("Arabic keeps Western digits (ar-EG-u-nu-latn)", () => {
      const arMs = duration(850, "ar");
      expect(arMs).not.toMatch(/[٠-٩]/);
      expect(arMs).toContain("850");
      expect(arMs).toContain("ملي");

      const arSeconds = duration(12300, "ar");
      expect(arSeconds).not.toMatch(/[٠-٩]/);
      expect(arSeconds).toContain("12.3");
      expect(arSeconds).toContain("ث");

      const arMinutes = duration(125000, "ar");
      expect(arMinutes).not.toMatch(/[٠-٩]/);
      expect(arMinutes).toContain("د");
      expect(arMinutes).toContain("2");
      expect(arMinutes).toContain("5");
    });
    it("Arabic also renders nullish as an em dash", () => {
      expect(duration(null, "ar")).toBe("—");
      expect(duration(undefined, "ar")).toBe("—");
    });
  });

  describe("timeAgo", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");

    it("under 10 s reads as the now form", () => {
      expect(timeAgo(new Date(now - 3000), now)).toBe(timeAgo(new Date(now), now));
      expect(timeAgo(new Date(now - 3000), now)).toBe("now");
    });

    it("five minutes earlier reads as minutes (en)", () => {
      const ago = timeAgo(new Date(now - 5 * 60_000), now);
      expect(ago).toMatch(/5/);
      expect(ago).toMatch(/m/);
    });

    it("nullish reads the catalogue's never word", () => {
      expect(timeAgo(null, now)).toBe(CATALOGUES.en.common.never);
      expect(timeAgo(undefined, now)).toBe(CATALOGUES.en.common.never);
      expect(timeAgo(null, now, "ar")).toBe(CATALOGUES.ar.common.never);
      expect(timeAgo(undefined, now, "ar")).toBe(CATALOGUES.ar.common.never);
    });
  });
});
