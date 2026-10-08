import { describe, expect, it } from "vitest";
import { buildFfconcat, masterArgs } from "../../scripts/demo/master";

describe("buildFfconcat", () => {
  it("gives each frame the time until the next one and the last frame the time to the end", () => {
    const out = buildFfconcat([{ i: 0, t: 0 }, { i: 1, t: 0.05 }, { i: 2, t: 0.2 }], 0.5);
    expect(out.split("\n")).toEqual([
      "ffconcat version 1.0",
      "file 'frames/000000.jpg'", "duration 0.0500",
      "file 'frames/000001.jpg'", "duration 0.1500",
      "file 'frames/000002.jpg'", "duration 0.3000",
      "file 'frames/000002.jpg'",
      "",
    ]);
  });

  it("clamps zero or tiny durations to 1 ms", () => {
    const out = buildFfconcat([{ i: 3, t: 1 }, { i: 4, t: 1 }], 1);
    expect(out).toContain("file 'frames/000003.jpg'\nduration 0.0010");
    expect(out).toContain("file 'frames/000004.jpg'\nduration 0.0010");
  });

  it("uses a custom file name function", () => {
    const out = buildFfconcat([{ i: 7, t: 0 }], 2, (i) => `x/${i}.png`);
    expect(out).toBe("ffconcat version 1.0\nfile 'x/7.png'\nduration 2.0000\nfile 'x/7.png'\n");
  });

  it("rejects an empty list and unsorted frames", () => {
    expect(() => buildFfconcat([], 1)).toThrow(/no frames/);
    expect(() => buildFfconcat([{ i: 0, t: 0.5 }, { i: 1, t: 0.1 }], 1)).toThrow(/not sorted/);
  });
});

describe("masterArgs", () => {
  it("encodes a constant 60 fps BT.709 limited-range master", () => {
    const a = masterArgs("w/hero.ar.light");
    expect(a).toContain("w/hero.ar.light/frames.ffconcat");
    expect(a.at(-1)).toBe("w/hero.ar.light/master.mp4");
    expect(a.join(" ")).toContain("-fps_mode cfr -r 60");
    expect(a.join(" ")).toContain("-crf 14 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv");
  });
});
