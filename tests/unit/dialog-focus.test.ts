import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canRefocus, focusIsFree, pickReturnTarget, restoreFocus, type FocusTarget } from "@/components/ui/focus-return";

/** A stand-in for an element: the focus-return logic only needs these parts of the DOM (the unit tests have no DOM). */
function el(tagName = "BUTTON", over: Partial<FocusTarget> = {}) {
  const calls: string[] = [];
  const node: FocusTarget & { calls: string[] } = { tagName, isConnected: true, calls, focus: () => void calls.push("focus"), ...over };
  return node;
}

describe("dialog focus return (DV2-Q02)", () => {
  it("remembers the control that opened the dialog", () => {
    const opener = el();
    expect(pickReturnTarget(opener, { contains: () => false })).toBe(opener);
  });

  it("remembers nothing when focus was on the page itself or already inside the dialog", () => {
    expect(pickReturnTarget(null, null)).toBeNull();
    expect(pickReturnTarget(el("BODY"), null)).toBeNull();
    expect(pickReturnTarget(el("HTML"), null)).toBeNull();
    const field = el("INPUT");
    expect(pickReturnTarget(field, { contains: (n) => n === field })).toBeNull(); // an autoFocus field is not an opener
  });

  it("only a connected, enabled element can take focus back", () => {
    expect(canRefocus(el())).toBe(true);
    expect(canRefocus(el("BUTTON", { isConnected: false }))).toBe(false);
    expect(canRefocus(el("BUTTON", { disabled: true }))).toBe(false);
    expect(canRefocus(null)).toBe(false);
    expect(canRefocus(undefined)).toBe(false);
  });

  it("focus counts as lost when nothing, <body> or a removed element has it", () => {
    expect(focusIsFree(null)).toBe(true);
    expect(focusIsFree(el("BODY"))).toBe(true);
    expect(focusIsFree(el("BUTTON", { isConnected: false }))).toBe(true);
    expect(focusIsFree(el("BUTTON"))).toBe(false);
  });

  it("Escape closes the dialog: focus falls to <body> and is given back to the opener", () => {
    const opener = el();
    expect(restoreFocus([opener], el("BODY"))).toBe(true);
    expect(opener.calls).toEqual(["focus"]);
  });

  it("the dialog is unmounted by its parent (no open=false step): the same restore applies", () => {
    const opener = el();
    expect(restoreFocus([opener, null], null)).toBe(true); // nothing has focus once the dialog's DOM is gone
    expect(opener.calls).toEqual(["focus"]);
  });

  it("never takes focus from a control the user (or another dialog) has moved to", () => {
    const opener = el();
    const other = el("BUTTON");
    expect(restoreFocus([opener], other)).toBe(false);
    expect(opener.calls).toEqual([]);
  });

  it("an opener that is gone or disabled hands over to the fallback, else nothing happens (Radix's default runs)", () => {
    const gone = el("BUTTON", { isConnected: false });
    const disabled = el("BUTTON", { disabled: true });
    const fallback = el("BUTTON");
    expect(restoreFocus([gone, disabled, fallback], el("BODY"))).toBe(true);
    expect([gone.calls, disabled.calls, fallback.calls]).toEqual([[], [], ["focus"]]);
    expect(restoreFocus([gone, disabled, null, undefined], el("BODY"))).toBe(false);
    expect(restoreFocus([], null)).toBe(false);
  });
});

describe("ui/dialog.tsx wiring", () => {
  const src = readFileSync("src/components/ui/dialog.tsx", "utf8");

  it("both modals restore focus (Dialog and Drawer) through the shared hook", () => {
    expect(src.match(/= useReturnFocus\(open/g)?.length).toBe(2);
    expect(src.match(/onCloseAutoFocus=\{onCloseAutoFocus\}/g)?.length).toBe(2);
    expect(src.match(/ref=\{contentRef\}/g)?.length).toBe(2);
  });

  it("the opener is captured once per opening, before Radix moves focus inside", () => {
    expect(src).toContain("useLayoutEffect");
    expect(src).toContain("if (opened.current) return;");
    expect(src).toContain("pickReturnTarget(document.activeElement");
  });

  it("the Drawer never overrides Radix's own aria-labelledby with undefined (that leaves it unnamed)", () => {
    expect(src).not.toMatch(/aria-labelledby=\{labelledBy\}/);
    expect(src).toContain('{...(labelledBy ? { "aria-labelledby": labelledBy } : {})}');
  });
});

describe("phone run sheet (DV2-Q05)", () => {
  const src = readFileSync("src/app/w/[slug]/runs/inspector.tsx", "utf8");

  it("is the modal design-system Drawer, not a hand-rolled overlay", () => {
    expect(src).toMatch(/<Drawer[\s\S]{0,500}?variant="sheet"/);
    expect(src).not.toContain("bg-scrim");
  });

  it("Escape / scrim close it like the panel's close button (clear `run`), and it is named after the run", () => {
    expect(src).toMatch(/onOpenChange=\{\(o\) => !o && setParam\(\{ run: null \}\)\}/);
    expect(src).toContain("onClose={() => setParam({ run: null })}");
    expect(src).toContain("label={sheetLabel}");
    expect(src).toContain('t("runs.panel.runRef", { number: run.number })');
  });

  it("focus returns to the run row that opened it (rows carry a stable id)", () => {
    expect(src).toContain("id={`run-row-${r.id}`}");
    expect(src).toContain("fallbackFocus={() => document.getElementById(`run-row-${selectedRunId}`)}");
  });
});
