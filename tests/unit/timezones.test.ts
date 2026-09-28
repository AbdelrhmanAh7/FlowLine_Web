import { describe, expect, it } from "vitest";
import { isTimeZone, TIME_ZONES } from "@/lib/timezones";

describe("time zones (one fixed list for server and browser)", () => {
  it("starts with UTC and has no duplicates", () => {
    expect(TIME_ZONES[0]).toBe("UTC");
    expect(new Set(TIME_ZONES).size).toBe(TIME_ZONES.length);
    expect(TIME_ZONES).toContain("Africa/Cairo");
  });
  it("accepts offered zones and legacy aliases a browser may have saved, rejects junk", () => {
    expect(isTimeZone("Africa/Cairo")).toBe(true);
    expect(isTimeZone("Africa/Asmera")).toBe(true); // WebKit's alias of Africa/Asmara
    expect(isTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});
