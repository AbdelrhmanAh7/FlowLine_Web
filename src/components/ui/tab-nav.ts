/**
 * Arrow-key navigation over a tab strip that contains blocked tabs (DV2-R02), as pure logic.
 *
 * A blocked tab with a reason is focusable (so a keyboard user hears why it is blocked) but never selectable; a blocked
 * tab without a reason is skipped. Arrow/Home/End move focus over every reachable tab, in reading order.
 */

export interface NavTab {
  id: string;
  /** Reachable by focus: not blocked, or blocked with a reason. */
  focusable: boolean;
}

/** The tab to focus after `key`, or null when the key is not a tab-strip key. `current` is the focused tab id. */
export function nextTabFocus(tabs: readonly NavTab[], current: string | null, key: string, rtl: boolean): string | null {
  const reachable = tabs.filter((t) => t.focusable);
  if (!reachable.length) return null;
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  const i = reachable.findIndex((t) => t.id === current);
  if (key === "Home") return reachable[0].id;
  if (key === "End") return reachable[reachable.length - 1].id;
  if (i < 0) return null;
  if (key === forward) return reachable[(i + 1) % reachable.length].id;
  if (key === backward) return reachable[(i - 1 + reachable.length) % reachable.length].id;
  return null;
}
