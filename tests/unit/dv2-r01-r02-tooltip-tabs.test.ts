import { describe, expect, it } from "vitest";
import { nextTabFocus, type NavTab } from "@/components/ui/tab-nav";
import { IDLE_TAP, tapCancel, tapClick, tapDown, tapLeave } from "@/components/ui/tap-toggle";

describe("tooltip tap toggle (DV2-R01)", () => {
  it("a tap on a closed tooltip opens it; a tap on an open one closes it", () => {
    expect(tapClick(tapDown(false), false, 1).open).toBe(true);
    expect(tapClick(tapDown(true), false, 1).open).toBe(false); // Radix closed it on pointer-down already
  });

  it("a keyboard activation toggles the current state", () => {
    expect(tapClick(IDLE_TAP, false, 0).open).toBe(true);
    expect(tapClick(IDLE_TAP, true, 0).open).toBe(false);
  });

  it("a drag-off drops the press, so the next tap does not toggle the wrong way", () => {
    const pressed = tapDown(true);
    const left = tapLeave(pressed, 1); // pointer left while still held
    expect(left).toEqual(IDLE_TAP);
    // The pointer-up landed outside, so no click; a later keyboard-less tap starts from a clean press.
    expect(tapClick(left, true, 1).open).toBe(true);
  });

  it("a touch release's pointerleave (buttons up) keeps the press for its click", () => {
    expect(tapLeave(tapDown(true), 0)).toEqual({ pressedOpen: true });
  });

  it("a cancelled gesture voids the press", () => {
    expect(tapCancel()).toEqual(IDLE_TAP);
  });

  it("a click always ends the press", () => {
    expect(tapClick(tapDown(true), false, 1).state).toEqual(IDLE_TAP);
  });
});

const tabs: NavTab[] = [
  { id: "input", focusable: true },
  { id: "output", focusable: false }, // blocked, no reason: skipped
  { id: "error", focusable: true }, // blocked with a reason: reachable
  { id: "logs", focusable: true },
];

describe("tab strip keyboard navigation (DV2-R02)", () => {
  it("arrows land on a blocked tab that has a reason, and skip one without", () => {
    expect(nextTabFocus(tabs, "input", "ArrowRight", false)).toBe("error");
    expect(nextTabFocus(tabs, "error", "ArrowLeft", false)).toBe("input");
  });

  it("wraps and supports Home/End", () => {
    expect(nextTabFocus(tabs, "logs", "ArrowRight", false)).toBe("input");
    expect(nextTabFocus(tabs, "input", "ArrowLeft", false)).toBe("logs");
    expect(nextTabFocus(tabs, "error", "Home", false)).toBe("input");
    expect(nextTabFocus(tabs, "error", "End", false)).toBe("logs");
  });

  it("follows the reading direction", () => {
    expect(nextTabFocus(tabs, "input", "ArrowLeft", true)).toBe("error");
    expect(nextTabFocus(tabs, "input", "ArrowRight", true)).toBe("logs");
    expect(nextTabFocus(tabs, "logs", "ArrowLeft", true)).toBe("input");
  });

  it("ignores other keys (Enter/Space never navigate or select)", () => {
    expect(nextTabFocus(tabs, "error", "Enter", false)).toBeNull();
    expect(nextTabFocus(tabs, "error", " ", false)).toBeNull();
    expect(nextTabFocus([], "x", "ArrowRight", false)).toBeNull();
  });
});
