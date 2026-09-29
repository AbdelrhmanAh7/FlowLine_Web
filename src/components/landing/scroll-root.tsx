"use client";

import Lenis from "lenis";
import { useReducedMotion } from "motion/react";
import { useEffect, type ReactNode } from "react";

/**
 * Smooth scrolling for the PUBLIC pages only (never inside the app shell, canvas or scroll containers).
 * Disabled under prefers-reduced-motion and on coarse pointers (touch keeps native scrolling).
 */
export function ScrollRoot({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);
  return children;
}
