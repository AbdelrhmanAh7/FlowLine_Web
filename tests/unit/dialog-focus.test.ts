import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canRefocus, focusIsFree, pickReturnTarget, restoreFocus, closestFocusableAncestor, mainRegion, type FocusTarget } from "@/components/ui/focus-return";

/** A stand-in for an element: the focus-return logic only needs these parts of the DOM (the unit tests have no DOM). */
function el(tagName = "BUTTON", over: Partial<FocusTarget> = {}) {
  const calls: string[] = [];
  const node: FocusTarget & { calls: string[] } = { tagName, isConnected: true, calls, focus: () => void calls.push("focus"), ...over };
  return node;
}

describe("dialog focus return (DV2-Q02, DV2-R03)", () => {
  it("remembers the control that opened the dialog", () => {
    const opener = el();
    const result = pickReturnTarget(opener, { contains: () => false });
    expect(result.target).toBe(opener);
  });

  it("remembers nothing when focus was on the page itself or already inside the dialog", () => {
    expect(pickReturnTarget(null, null)).toEqual({ target: null, fallback: null });
    expect(pickReturnTarget(el("BODY"), null)).toEqual({ target: null, fallback: null });
    expect(pickReturnTarget(el("HTML"), null)).toEqual({ target: null, fallback: null });
    const field = el("INPUT");
    expect(pickReturnTarget(field, { contains: (n) => n === field })).toEqual({ target: null, fallback: null }); // an autoFocus field is not an opener
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

  it("canRefocus rejects hidden, inert and display:none targets, so restoreFocus does not claim a no-op focus", () => {
    expect(canRefocus(el("BUTTON", { hidden: true }))).toBe(false);
    expect(canRefocus(el("BUTTON", { inert: true }))).toBe(false);
    expect(canRefocus(el("BUTTON", { closest: (sel: string) => (sel.includes("[inert]") ? {} : null) }))).toBe(false);
    expect(canRefocus(el("BUTTON", { getClientRects: () => ({ length: 0 }) }))).toBe(false);
    expect(canRefocus(el("BUTTON", { getClientRects: () => ({ length: 1 }) }))).toBe(true);
    const hiddenOpener = el("BUTTON", { hidden: true });
    expect(restoreFocus([hiddenOpener], el("BODY"))).toBe(false);
    expect(hiddenOpener.calls).toEqual([]);
  });
});

/** A menu item removed with its menu: item (tabindex -1) -> menu -> wrapper -> body. The trigger is NOT an ancestor (portal). */
function menuItem() {
  const body = el("BODY");
  const inLayer = (sel: string) => (sel.includes('role="menu"') ? {} : null);
  const menu = el("DIV", { getAttribute: (n) => (n === "role" ? "menu" : n === "tabindex" ? "-1" : null), parentElement: body, closest: inLayer });
  const item = el("DIV", { getAttribute: (n) => (n === "tabindex" ? "-1" : null), parentElement: menu, closest: inLayer });
  return { body, menu, item };
}

describe("closest focusable ancestor and the menu-opener case (DV2-R03)", () => {
  it("starts above the element: a focusable opener is not its own fallback", () => {
    const button = el("BUTTON");
    expect(closestFocusableAncestor(button)).toBeNull();
    const section = el("SECTION", { getAttribute: (n) => (n === "tabindex" ? "0" : null) });
    const child = el("BUTTON", { parentElement: section });
    const result = pickReturnTarget(child, { contains: () => false });
    expect(result.target).toBe(child);
    expect(result.fallback).toBe(section);
    expect(result.fallback).not.toBe(result.target);
  });

  it("skips ancestors inside a nested layer (the menu goes away with its item)", () => {
    const { item } = menuItem();
    expect(closestFocusableAncestor(item)).toBeNull(); // the tabindex=-1 menu is a layer, not a safe fallback
    expect(pickReturnTarget(item, { contains: () => false })).toEqual({ target: item, fallback: null });
  });

  it("a removed menu-item opener lands on the launcher (menu trigger), not <body>", () => {
    const { item } = menuItem();
    const { target, fallback } = pickReturnTarget(item, { contains: () => false });
    item.isConnected = false; // the menu unmounted
    const trigger = el("BUTTON");
    const main = el("MAIN");
    expect(restoreFocus([target, fallback, trigger, main], el("BODY"))).toBe(true);
    expect([trigger.calls, main.calls]).toEqual([["focus"], []]);
  });

  it("with no launcher either, <main> takes focus", () => {
    const { item } = menuItem();
    const { target, fallback } = pickReturnTarget(item, { contains: () => false });
    item.isConnected = false;
    const main = el("MAIN");
    expect(restoreFocus([target, fallback, null, main], null)).toBe(true);
    expect(main.calls).toEqual(["focus"]);
  });

  it("does not move focus when it was not lost", () => {
    const { item } = menuItem();
    const { target, fallback } = pickReturnTarget(item, { contains: () => false });
    item.isConnected = false;
    const trigger = el("BUTTON");
    const elsewhere = el("INPUT");
    expect(restoreFocus([target, fallback, trigger], elsewhere)).toBe(false);
    expect(trigger.calls).toEqual([]);
  });

  it("mainRegion finds <main> through the owner document", () => {
    const main = el("MAIN");
    const opener = el("BUTTON", { ownerDocument: { querySelector: (s: string) => (s === "main" ? main : null) } });
    expect(mainRegion(opener)).toBe(main);
    expect(mainRegion(el("BUTTON", { ownerDocument: { querySelector: () => null } }))).toBeNull();
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

  it("saves both the opener and its closest focusable ancestor (DV2-R03)", () => {
    expect(src).toContain("returnFallback.current = result.fallback");
    expect(src).toContain("returnTo.current = result.target");
  });

  it("passes both target and fallback to restore focus, then the caller's fallback", () => {
    expect(src).toContain("restoreFocus(");
    expect(src).toContain("[returnTo.current, returnFallback.current, fallbackRef.current?.(), returnTo.current ? (mainRegion(returnTo.current)");
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
    expect(src).toMatch(/const closeRun = \(\) => \{\s*setAutoSelect\(false\);\s*setParam\(\{ run: null \}\);\s*\}/);
    expect(src).toMatch(/onOpenChange=\{\(o\) => !o && closeRun\(\)\}/);
    expect(src).toContain("onClose={closeRun}");
    expect(src).toContain("label={sheetLabel}");
    expect(src).toContain('t("runs.panel.runRef", { number: run.number })');
  });

  it("focus returns to the run row that opened it (rows carry a stable id)", () => {
    expect(src).toContain("id={`run-row-${r.id}`}");
    expect(src).toContain("fallbackFocus={() => document.getElementById(`run-row-${selectedRunId}`)}");
  });
});
