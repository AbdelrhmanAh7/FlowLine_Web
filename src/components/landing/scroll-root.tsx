"use client";

import Lenis from "lenis";
// Lenis' recommended stylesheet (its README, "Recommended CSS"): keeps html/body height auto while Lenis runs, contain overscroll on
// [data-lenis-prevent] regions and stops iframes stealing wheel events mid-scroll. Every rule is scoped to the `.lenis` class Lenis puts
// on <html> while it runs, so it is inert on other routes and whenever Lenis is off (reduced motion, touch).
import "lenis/dist/lenis.css";
import { useEffect, type ReactNode } from "react";

/**
 * Smooth scrolling for the PUBLIC pages only (never inside the app shell, canvas or scroll containers).
 * Off under prefers-reduced-motion and on coarse pointers (touch keeps native scrolling). Both are read from
 * matchMedia inside the effect (never during render) and followed live: turning the OS setting on tears Lenis down.
 *
 * Query-based section navigation delegates scrolling to Lenis while it is active.
 * Touch and reduced-motion visitors keep native section scrolling.
 */
export function ScrollRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    let stop: (() => void) | undefined;
    const sync = () => {
      stop?.();
      stop = undefined;
      if (reduced.matches || coarse.matches) return;
      const lenis = new Lenis({ duration: 0.25, smoothWheel: true, anchors: false });
      const sectionScroll = (event: Event) => {
        const target = (event as CustomEvent<{ target: HTMLElement }>).detail.target;
        event.preventDefault();
        lenis.scrollTo(target, { offset: -96, duration: 0.25 });
      };
      window.addEventListener("flowline:section-scroll", sectionScroll);
      let raf = 0;
      const loop = (time: number) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      stop = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("flowline:section-scroll", sectionScroll);
        lenis.destroy();
      };
    };
    sync();
    reduced.addEventListener("change", sync);
    coarse.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      coarse.removeEventListener("change", sync);
      stop?.();
    };
  }, []);
  return children;
}
