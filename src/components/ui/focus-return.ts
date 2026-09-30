/**
 * Focus return for modal dialogs (pure logic, no DOM globals, so it is unit-testable in the node test environment).
 *
 * Radix returns focus after a modal only to its own `Dialog.Trigger`. Flowline opens its dialogs from ordinary buttons
 * through state (mounted conditionally, or with a toggled `open`), so Radix has no trigger and focus would fall to
 * <body>: after Escape the next Tab starts again at "Skip to content" (DV2-Q02). `ui/dialog.tsx` therefore remembers the
 * element that had focus when the dialog opened and gives focus back to it once the dialog is gone.
 *
 * The same rules serve the non-modal builder panels and the Add node catalogue (DV2-M01, DV2-M02): they are not Radix
 * dialogs, so nothing returns their focus either, and they close on Escape through `panelEscapeAction` (see `side-panel.ts`).
 * A panel that is kept mounted while closed (Copilot: its unsaved proposal must survive a close) is hidden, not removed, and
 * gives focus back through `restoreFocus`'s `lostWithin`.
 */

/** The parts of an element the focus-return logic needs (any DOM `HTMLElement` satisfies it). */
export interface FocusTarget {
  isConnected: boolean;
  disabled?: boolean;
  tagName?: string;
  focus(): void;
}

const isPageRoot = (el: FocusTarget) => el.tagName === "BODY" || el.tagName === "HTML";

/**
 * The element to give focus back to, chosen when the dialog opens. Nothing is remembered when focus was on the page
 * itself (<body>), or already inside the dialog (an `autoFocus` field): there is nothing to return to in either case.
 */
export function pickReturnTarget<T extends FocusTarget>(active: T | null | undefined, content: { contains(node: NoInfer<T>): boolean } | null | undefined): T | null {
  if (!active || isPageRoot(active)) return null;
  if (content?.contains(active)) return null;
  return active;
}

/** A remembered element can take focus again: it is still in the document and not disabled. */
export function canRefocus(target: FocusTarget | null | undefined): target is FocusTarget {
  return Boolean(target && target.isConnected && !target.disabled);
}

/**
 * Focus has been lost: nothing has it, <body> has it, or the element that has it is gone. Only then is focus put back,
 * so a control the user (or a newly opened dialog) has moved focus to is never taken away.
 */
export function focusIsFree(active: FocusTarget | null | undefined): boolean {
  return !active || isPageRoot(active) || !active.isConnected;
}

/**
 * Gives focus back to the first candidate that can take it (the element remembered at open, then the caller's fallback).
 * Returns true when focus was moved, so the caller can cancel Radix's own return-to-trigger.
 *
 * `lostWithin` is for a panel that is HIDDEN rather than removed: its DOM is still there, so the element that had focus
 * is still connected, and the browser only drops focus from a `display: none` subtree at its next rendering update.
 * Focus that is still inside the panel that just went away therefore counts as lost too.
 */
export function restoreFocus<T extends FocusTarget>(
  candidates: readonly (T | null | undefined)[],
  active: T | null | undefined,
  lostWithin?: { contains(node: NoInfer<T>): boolean } | null,
): boolean {
  const lost = focusIsFree(active) || Boolean(active && lostWithin?.contains(active));
  if (!lost) return false;
  const target = candidates.find(canRefocus);
  if (!target) return false;
  target.focus();
  return true;
}

/**
 * What a non-modal panel does with a key press that reached it: not its business (`ignore`), an Escape somebody else already
 * took (`consumed`), an Escape it keeps without closing (`keep`), or an Escape that closes it (`close`).
 */
export type PanelEscape = "ignore" | "consumed" | "keep" | "close";

/**
 * A nested layer inside (or portaled out of) a panel: a menu, listbox, tooltip, popover or dialog that is not the panel.
 * The panel's own element is `role="dialog"` too, so it is excluded by identity.
 */
export const NESTED_LAYER_SELECTOR = '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [role="tooltip"], [role="alertdialog"], [role="dialog"]';

/** True when the key's target sits inside a nested layer of the panel (see `NESTED_LAYER_SELECTOR`). */
export function inNestedLayer(target: { closest?(selector: string): unknown } | null | undefined, panel: unknown): boolean {
  const layer = target?.closest?.(NESTED_LAYER_SELECTOR);
  return Boolean(layer) && layer !== panel;
}

/**
 * Escape on a NON-modal side panel (the builder's Copilot and History, DV2-M02). One Escape closes ONE layer, the topmost:
 *
 *  - Radix dismisses its own topmost layer (tooltip, menu, popover, dialog) from a `keydown` listener on the document in the
 *    CAPTURE phase, which runs before React sees the event, and it calls `preventDefault()` when it acts. So by the time the
 *    panel's `onKeyDown` runs, `defaultPrevented` says "an inner layer already took this Escape": the panel stays open and a
 *    second Escape closes it. `inNestedLayer` covers the case where the key is pressed from inside such a layer;
 *  - an input-method composition uses Escape to cancel itself.
 *
 * Both are `consumed`: the panel does not close, does not touch the key's default, and still keeps the key from the page-level
 * Escape (blur the field, clear the selection) so the canvas behind is left alone too. While the panel has work in flight (a
 * Copilot request or a restore) it stays open (`keep`), but still takes the key for the same reason.
 */
export function panelEscapeAction(e: { key: string; defaultPrevented: boolean; isComposing?: boolean; inNestedLayer?: boolean }, busy: boolean): PanelEscape {
  if (e.key !== "Escape") return "ignore";
  if (e.defaultPrevented || e.isComposing || e.inNestedLayer) return "consumed";
  return busy ? "keep" : "close";
}
