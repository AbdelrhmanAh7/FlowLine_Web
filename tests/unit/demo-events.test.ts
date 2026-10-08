import { describe, expect, it } from "vitest";
import { beatIds, beatTime, parseEvents } from "../../scripts/demo/events";

const box = { x: 1, y: 2, w: 30, h: 40 };
const valid = {
  schema: 1,
  viewport: { w: 1280, h: 720, dsf: 1.5 },
  duration: 16.2,
  locale: "ar",
  theme: "light",
  events: [
    { t: 0, type: "beat", id: "establish" },
    { t: 0.5, type: "move", from: [0, 0], to: [100, 50], dur: 0.6 },
    { t: 1.2, type: "click", x: 100, y: 50, box, label: "Run" },
    { t: 2, type: "focus", box },
    { t: 3, type: "type", box, t1: 4.1 },
    { t: 5, type: "drag", from: [1, 1], to: [9, 9], dur: 0.8 },
    { t: 6, type: "beat", id: "run" },
  ],
};

describe("events", () => {
  it("parses a valid events file (object or string)", () => {
    expect(parseEvents(valid).events).toHaveLength(7);
    expect(parseEvents(JSON.stringify(valid)).locale).toBe("ar");
  });
  it("rejects a wrong schema version, an unknown type and a missing field", () => {
    expect(() => parseEvents({ ...valid, schema: 2 })).toThrow(/schema/);
    expect(() => parseEvents({ ...valid, events: [{ t: 0, type: "wiggle" }] })).toThrow(/events\.0/);
    expect(() => parseEvents({ ...valid, events: [{ t: 1, type: "click", x: 1, y: 2 }] })).toThrow(/box/);
    expect(() => parseEvents({ ...valid, locale: "fr" })).toThrow(/locale/);
  });
  it("rejects wrong value types and bad JSON", () => {
    expect(() => parseEvents({ ...valid, duration: "16" })).toThrow(/duration/);
    expect(() => parseEvents("{not json")).toThrow(/not valid JSON/);
  });
  it("finds beats", () => {
    const e = parseEvents(valid);
    expect(beatTime(e, "run")).toBe(6);
    expect(beatIds(e)).toEqual(["establish", "run"]);
    expect(() => beatTime(e, "nope")).toThrow(/"nope".*establish, run/);
  });
});
