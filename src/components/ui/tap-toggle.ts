/**
 * Pure rules for the tap-to-toggle tooltip (`openOnTap`), unit-testable without a DOM (DV2-R01).
 *
 * Radix closes an open tooltip on pointer-down, before the click, so the tap remembers whether it started on an open one
 * (`pressedOpen`). That memory belongs to one press: if the press never ends in a click on the trigger (a drag off it,
 * a cancelled touch), it must be dropped, or the next tap would toggle the wrong way.
 */

/** A press that has not produced a click yet: the memory of "this tap started on an open tooltip". */
export type TapState = { pressedOpen: boolean };

export const IDLE_TAP: TapState = { pressedOpen: false };

/** Pointer-down on the trigger starts a press; it remembers whether the tooltip was open. */
export function tapDown(open: boolean): TapState {
  return { pressedOpen: open };
}

/**
 * The pointer left the trigger. A press still held (`buttons !== 0`) is a drag-off, so it is dropped. A touch release
 * also fires pointerleave, but after the buttons are up and before the click it belongs to, so that one is kept.
 */
export function tapLeave(state: TapState, buttons: number): TapState {
  return buttons !== 0 ? IDLE_TAP : state;
}

/** The browser took the pointer away (scroll, system gesture): the press is void. */
export function tapCancel(): TapState {
  return IDLE_TAP;
}

/**
 * The click: whether the tooltip is open afterwards. A keyboard click (`detail === 0`, no pointer-down) toggles the
 * current state; a pointer click re-opens unless the press started on an open tooltip (Radix already closed it).
 * Either way the press is over, so the state returns to idle.
 */
export function tapClick(state: TapState, open: boolean, detail: number): { open: boolean; state: TapState } {
  return { open: detail === 0 ? !open : !state.pressedOpen, state: IDLE_TAP };
}
