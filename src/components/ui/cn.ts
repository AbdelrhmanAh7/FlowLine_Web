import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner: conditional classes, then Tailwind conflict resolution. */
export function cn(...parts: ClassValue[]) {
  return twMerge(clsx(...parts));
}

/** Backwards-compatible alias (existing call sites import `cx`). */
export const cx = cn;
