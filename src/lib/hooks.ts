"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Browser connectivity. Server render assumes online. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export type Viewport = "mobile" | "tablet" | "desktop";

/** Breakpoints from the design: mobile <768, tablet 768–1279, desktop ≥1280. */
export function viewportFor(width: number): Viewport {
  if (width < 768) return "mobile";
  if (width < 1280) return "tablet";
  return "desktop";
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribeResize, () => viewportFor(window.innerWidth), () => "desktop");
}

export function useWindowWidth() {
  return useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
}

export interface Health {
  db: "ok" | "down";
  worker: "ok" | "offline" | "unknown";
}

/** Polls /api/health so the shell can show a degraded banner when the worker is down. */
export function useHealth() {
  const online = useOnline();
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api<Health>("/api/health"),
    refetchInterval: 15_000,
    enabled: online,
    retry: false,
  });
}

/** Re-renders every `ms` so relative times ("2m ago") stay fresh. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** True when the event target is a text-entry control — shortcuts must not fire there. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "range", "color"].includes(type);
  }
  return false;
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");
