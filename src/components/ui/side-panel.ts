"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useReturnFocus } from "./dialog";
import { inNestedLayer, panelEscapeAction } from "./focus-return";

/**
 * Keyboard lifecycle of a NON-modal side panel (DV2-M02): the builder's Copilot and History panels are
 * `aside role="dialog"` on purpose (no scrim, no focus trap, no `aria-modal`, nothing hidden behind them), so the canvas and
 * toolbar stay usable next to them and an outside click never discards a Copilot proposal. They still owe their keyboard
 * users a dialog's lifecycle:
 *
 *  - on every OPEN, focus moves into the panel, to the element marked `data-initial-focus` (a panel that already holds focus,
 *    e.g. through an `autoFocus` field, keeps it). This is tied to the open transition alone: a re-render, a data refetch or a
 *    prop that changes never moves focus again, so a user who has moved on inside the panel (or out to the canvas) is left
 *    where they are;
 *  - Escape closes ONE layer, the topmost. A nested menu, tooltip, popover or dialog takes the key first (it is already
 *    `defaultPrevented` when the panel sees it) and only a second Escape closes the panel (`panelEscapeAction`). The key never
 *    reaches the builder's page-level Escape (blur field / clear selection), so the canvas behind the panel is left alone;
 *  - when the panel goes away, focus returns to the control that opened it, else to `returnFocusTo` (the toolbar button, for a
 *    panel opened from a link, or by a browser that doesn't focus a clicked button). Focus is only put back when it was lost,
 *    never taken from a control the user moved to (`useReturnFocus`). "Goes away" is either an unmount (the panel is mounted
 *    only while it is open) or `open` turning false (the panel stays mounted, hidden, so its state survives a close).
 *
 * Usage, mounted only while open (History): `const { panelRef, onKeyDown } = useSidePanel<HTMLElement>({ onClose, busy, returnFocusTo });`
 * Usage, kept mounted (Copilot): pass `open`, render the root with `hidden={!open}`, and mount it with `useKeepMounted(open)`.
 * Either way `<aside ref={panelRef} onKeyDown={onKeyDown} …>` with `data-initial-focus` on the element to focus.
 */
export function useSidePanel<T extends HTMLElement = HTMLElement>({
  open = true,
  onClose,
  busy = false,
  returnFocusTo,
}: {
  /** False while the panel is kept mounted but hidden. A panel that is mounted only while open leaves it true. */
  open?: boolean;
  onClose: () => void;
  /** Work is in flight and closing would lose it: Escape keeps the panel open. */
  busy?: boolean;
  returnFocusTo?: () => HTMLElement | null;
}) {
  // The opener is read (in a layout effect, before the effects below move focus) each time `open` becomes true.
  const { contentRef: panelRef, restore } = useReturnFocus<T>(open, returnFocusTo);

  // Initial focus, once per open. The dependency is `open` alone on purpose: nothing else may pull focus back here.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    panel.querySelector<HTMLElement>("[data-initial-focus]")?.focus({ preventScroll: true });
  }, [open, panelRef]);

  // Hidden while kept mounted: the unmount path is not there to return focus, so do it when `open` turns false. Focus that is
  // still inside the hidden panel counts as lost (the browser drops it at its next rendering update).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) restore(panelRef.current);
    wasOpen.current = open;
  }, [open, restore, panelRef]);

  const onKeyDown = (e: KeyboardEvent<T>) => {
    const action = panelEscapeAction(
      { key: e.key, defaultPrevented: e.defaultPrevented || e.nativeEvent.defaultPrevented, isComposing: e.nativeEvent.isComposing, inNestedLayer: inNestedLayer(e.target as Element | null, panelRef.current) },
      busy,
    );
    if (action === "ignore") return;
    // "consumed" already belongs to the nested layer (or the input method): its default is left alone. Every other Escape is the panel's.
    if (action !== "consumed") e.preventDefault();
    e.stopPropagation();
    if (action === "close") onClose();
  };

  return { panelRef, onKeyDown };
}

/**
 * Whether a panel that is kept mounted while closed should be in the tree: false until it is first opened (nothing is fetched or
 * rendered for a panel nobody opens), true from then on, so closing hides it instead of discarding its state.
 */
export function useKeepMounted(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true); // render-time adjustment: no extra committed render without it
  return open || everOpened;
}
