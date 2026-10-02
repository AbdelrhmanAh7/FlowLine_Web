"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Query-based section links retain browser history without fragment URLs. */
export function SectionNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    const scroll = (focus = false) => {
      const section = new URL(window.location.href).searchParams.get("section");
      const target = section ? document.getElementById(section) : null;
      if (!target) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const event = new CustomEvent("flowline:section-scroll", { detail: { target }, cancelable: true });
      if (window.dispatchEvent(event)) target.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
      if (focus) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      const section = url.searchParams.get("section");
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || !section || !document.getElementById(section)) return;
      event.preventDefault();
      // Preserve the active tab and filters when adding a section destination.
      for (const [key, value] of new URL(window.location.href).searchParams) {
        if (key !== "section" && !url.searchParams.has(key)) url.searchParams.append(key, value);
      }
      url.hash = "";
      if (url.href !== window.location.href) window.history.pushState(null, "", url);
      scroll(link.dataset.sectionFocus === "true");
    };
    const restore = () => scroll();
    const frame = requestAnimationFrame(restore);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", restore);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", restore);
    };
  }, [pathname]);
  return null;
}
