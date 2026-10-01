"use client";

import type { MotionValue } from "motion/react";
import { useCallback, useSyncExternalStore } from "react";

/** Hydration-safe scroll enhancement; static content stays complete under reduced motion. */
export function useFlowProgress(progress: MotionValue<number>, count: number) {
  const subscribe = useCallback((notify: () => void) => {
    const unsubscribe = progress.on("change", notify);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", notify);
    return () => { unsubscribe(); preference.removeEventListener("change", notify); };
  }, [progress]);
  return useSyncExternalStore(subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? count : Math.min(count, Math.max(1, Math.floor(progress.get() * count) + 1)),
    () => count);
}
