"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Confirmation state for server-confirmed actions (copy, invite, key created, …): call `flash()` in the
 * success path (never optimistically — honesty rule) and render the control's `confirm` state while true.
 * Auto-clears after `ms`.
 */
export function useConfirm(ms = 1400) {
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setConfirmed(true);
    timer.current = setTimeout(() => setConfirmed(false), ms);
  }, [ms]);
  return { confirmed, flash };
}
