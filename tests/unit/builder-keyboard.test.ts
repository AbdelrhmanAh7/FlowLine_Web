import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inNestedLayer, panelEscapeAction, restoreFocus } from "@/components/ui/focus-return";

/** Source files are read with LF endings (the working tree may hold CRLF on Windows). */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
/** The same without block comments and whole-line comments, for checks on what the code does (a comment may name what it avoids). */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const key = (k: string, over: { defaultPrevented?: boolean; isComposing?: boolean } = {}) => ({ key: k, defaultPrevented: false, ...over });

describe("non-modal panel Escape (DV2-M02)", () => {
  it("Escape closes the panel", () => {
    expect(panelEscapeAction(key("Escape"), false)).toBe("close");
  });

  it("other keys are not the panel's business", () => {
    for (const k of ["Enter", "Tab", "ArrowDown", "Backspace", "Delete", " ", "/", "Esc"]) expect(panelEscapeAction(key(k), false)).toBe("ignore");
  });

  it("closes only if nothing else consumed the key: an open Radix tooltip/menu (default prevented) or an IME composition", () => {
    expect(panelEscapeAction(key("Escape", { defaultPrevented: true }), false)).toBe("consumed");
    expect(panelEscapeAction(key("Escape", { isComposing: true }), false)).toBe("consumed");
  });

  it("stays open, yet keeps the key, while work is in flight (a Copilot request, a restore)", () => {
    expect(panelEscapeAction(key("Escape"), true)).toBe("keep");
    // ...but a key that was not Escape, or was already consumed, is still not the panel's business
    expect(panelEscapeAction(key("Enter"), true)).toBe("ignore");
    expect(panelEscapeAction(key("Escape", { defaultPrevented: true }), true)).toBe("consumed");
  });
});

describe("side panel hook (ui/side-panel.ts)", () => {
  const src = code("src/components/ui/side-panel.ts");

  it("moves focus to the marked element once on open, without scrolling and only if focus is not already inside", () => {
    expect(src).toContain('panel.querySelector<HTMLElement>("[data-initial-focus]")?.focus({ preventScroll: true })');
    expect(src).toContain("panel.contains(document.activeElement)");
  });

  it("returns focus through the shared hook (opener first, then the launcher), reading the opener before focus moves", () => {
    expect(src).toContain("useReturnFocus<T>(open, returnFocusTo)");
    expect(src.indexOf("useReturnFocus<T>(")).toBeLessThan(src.indexOf("useEffect(() => {"));
  });

  it("owns the Escape it handles: the builder's page-level Escape (blur field, clear selection) never sees it", () => {
    expect(src).toContain("panelEscapeAction(");
    expect(src).toContain("e.stopPropagation()");
    expect(src).toContain('if (action === "close") onClose();');
  });

  it("handles a lost-focus Escape only when it targets the page root, without moving focus", () => {
    expect(src).toContain('if (!rootTarget || document.activeElement !== document.body) return;');
    expect(src).toContain('const rootTarget = e.target === document.body || e.target === document.documentElement;');
    expect(src).toContain('document.addEventListener("keydown", onRootEscape);');
    expect(src).toContain('document.removeEventListener("keydown", onRootEscape)');
    const handler = src.slice(src.indexOf("const onRootEscape ="), src.indexOf('document.addEventListener("keydown", onRootEscape);'));
    expect(handler).toContain("panelEscapeAction(");
    expect(handler).not.toContain(".focus(");
  });

  it("stays non-modal: no focus trap, no aria-modal, nothing hidden behind it", () => {
    expect(src).not.toMatch(/FocusScope|aria-modal|aria-hidden|inert|RadixDialog|Popover/);
  });

  it("reuses the dialog focus-return hook, now exported", () => {
    expect(read("src/components/ui/dialog.tsx")).toContain("export function useReturnFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, fallback?: () => HTMLElement | null)");
    expect(read("src/components/ui/index.ts")).toMatch(/export \{ Dialog, Drawer, useReturnFocus \} from "\.\/dialog";/);
    expect(read("src/components/ui/index.ts")).toContain('export { useKeepMounted, useSidePanel } from "./side-panel";');
  });
});

describe("Copilot panel (DV2-M02)", () => {
  const src = code("src/components/builder/copilot-panel.tsx");

  it("is a dialog for the keyboard: request field takes focus, Escape closes, focus returns to the launcher", () => {
    expect(src).toContain("useSidePanel<HTMLElement>({ open, onClose, busy: ask.isPending || decide.isPending, returnFocusTo })");
    expect(src).toMatch(/<aside ref=\{panelRef\} hidden=\{!open\} onKeyDown=\{onKeyDown\} role="dialog" aria-label=\{t\("copilot.title"\)\}/);
    expect(src).toMatch(/<Textarea id="copilot-request" data-initial-focus /);
  });

  it("Escape does not close it while a proposal is being requested or applied (both mutations count as in flight)", () => {
    expect(src).toContain("const ask = useMutation(");
    expect(src).toContain("const decide = useMutation(");
    expect(src).toContain("busy: ask.isPending || decide.isPending");
  });

  it("stays non-modal on purpose: no scrim, no focus trap, no aria-modal (an outside click must not discard a proposal)", () => {
    expect(src).not.toMatch(/aria-modal=|<Dialog|<Drawer|FocusScope|RadixDialog/);
    expect(src).not.toMatch(/bg-scrim/);
  });
});

describe("History panel (DV2-M02)", () => {
  const src = code("src/components/builder/history-panel.tsx");

  it("is a dialog for the keyboard: heading takes focus, Escape closes, focus returns to the History button", () => {
    expect(src).toContain("useSidePanel<HTMLElement>({ onClose, busy: restore.isPending, returnFocusTo })");
    expect(src).toMatch(/<aside ref=\{panelRef\} onKeyDown=\{onKeyDown\} role="dialog" aria-label=\{t\("history\.dialog"\)\}/);
    expect(src).toMatch(/<h2 tabIndex=\{-1\} data-initial-focus /);
  });

  it("stays non-modal", () => {
    expect(src).not.toMatch(/aria-modal=|<Dialog|<Drawer|FocusScope|RadixDialog|bg-scrim/);
  });
});

describe("builder wiring (DV2-M01, DV2-M02)", () => {
  const src = code("src/components/builder/builder.tsx");

  it("each toolbar launcher carries a ref that its surface gets focus back to", () => {
    for (const [ref, prop] of [
      ["addNodeButton", "returnFocusTo={() => addNodeButton.current}"],
      ["historyButton", "returnFocusTo={() => historyButton.current}"],
      ["copilotButton", "returnFocusTo={() => copilotButton.current}"],
    ] as const) {
      expect(src, `${ref} ref declared`).toContain(`const ${ref} = useRef<HTMLButtonElement>(null);`);
      expect(src, `${ref} on its button`).toContain(`<Button ref={${ref}} size="sm"`);
      expect(src, `${ref} handed to its surface`).toContain(prop);
    }
  });

  it("Add node keeps its button semantics (accessible name and popup role) that e2e relies on", () => {
    expect(src).toContain('aria-expanded={paletteOpen} aria-haspopup="dialog"');
    expect(src).toContain('{t("builder.addNode")} <Kbd>/</Kbd>');
  });

  it("Flow issues stays a Radix popover (Escape and focus return to its trigger come with it), named as a dialog", () => {
    expect(src).toContain("<Popover open={issuesOpen} onOpenChange={setIssuesOpen}>");
    expect(src).toContain("<PopoverTrigger asChild>");
    expect(src).toMatch(/<PopoverContent [^>]*role="dialog" ariaLabel=\{t\("builder\.issuesDialog"\)\}>/);
    // The page-level Escape also closes it when nothing else does.
    expect(src).toContain("else if (issuesOpen) setIssuesOpen(false);");
  });

  it("History unmounts and Copilot remains mounted while hidden, without hiding the canvas", () => {
    expect(src).toContain("{historyOpen && !isMobile && (");
    expect(src).toContain("const copilotVisible = copilotOpen && !readOnly;");
    expect(src).toContain("const copilotMounted = useKeepMounted(copilotVisible);");
    expect(src).toContain("{copilotMounted && (");
    expect(src).toContain("open={copilotVisible}");
    expect(src).not.toMatch(/aria-hidden=\{(historyOpen|copilotOpen|paletteOpen)/);
    expect(src).not.toMatch(/inert=\{(historyOpen|copilotOpen|paletteOpen)/);
  });
});

describe("Add node catalogue (DV2-M01)", () => {
  const src = code("src/components/builder/palette.tsx");

  it("gives focus back when it closes (Escape or a node was added): opener first, then the launcher button", () => {
    expect(src).toContain("useReturnFocus<HTMLDivElement>(true, returnFocusTo)");
    expect(src).toMatch(/<div ref=\{contentRef\} role="dialog" aria-label=\{t\("palette\.dialog"\)\}/);
  });

  it("still closes on Escape from its search box without letting the page-level Escape act", () => {
    expect(src).toMatch(/e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*onClose\(\);/);
  });
});

describe("dashboard Copilot (shares the panel)", () => {
  it("also gives focus back to the Create with Copilot button", () => {
    const src = read("src/app/w/[slug]/flows/dashboard.tsx");
    expect(src).toContain("const copilotButton = useRef<HTMLButtonElement>(null);");
    expect(src).toContain("<Button ref={copilotButton} onClick={() => setCopilotOpen(true)}");
    expect(src).toContain("returnFocusTo={() => copilotButton.current}");
  });
});


describe("nested Escape and hidden focus return", () => {
  it("identifies a nested or portaled layer but not the panel itself", () => {
    const panel = {};
    expect(inNestedLayer({ closest: () => panel }, panel)).toBe(false);
    expect(inNestedLayer({ closest: () => ({}) }, panel)).toBe(true);
    expect(inNestedLayer(null, panel)).toBe(false);
    expect(panelEscapeAction({ ...key("Escape"), inNestedLayer: true }, false)).toBe("consumed");
  });

  it("restores focus from a connected but hidden child without stealing outside focus", () => {
    let calls = 0;
    const launcher = { isConnected: true, focus: () => { calls++; } };
    const child = { isConnected: true, focus: () => {} };
    const hidden = { contains: (n: typeof child) => n === child };
    expect(restoreFocus([launcher], child, hidden)).toBe(true);
    expect(calls).toBe(1);
    expect(restoreFocus([launcher], launcher, hidden)).toBe(false);
    expect(calls).toBe(1);
  });

  it("ties initial focus to opening only, and restores on hide", () => {
    const src = code("src/components/ui/side-panel.ts");
    expect(src).toContain("}, [open, panelRef]);");
    expect(src).toContain("if (wasOpen.current && !open) restore(panelRef.current);");
    expect(src).toContain("e.nativeEvent.defaultPrevented");
  });
});
