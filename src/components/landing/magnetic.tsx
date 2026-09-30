"use client";

import { useRef, type ReactNode } from "react";

/**
 * Gentle magnetic feedback on CTAs: the control drifts a few px toward the cursor and springs back.
 * Transform only; identical markup on server and client. The drift never engages under
 * `prefers-reduced-motion: reduce` (checked in the handler, so nothing is read during render) and
 * globals.css also pins `.magnetic` to no transform under that media query. Touch has no hover, so it never fires.
 */
export function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  return (
    <div
      ref={ref}
      className="magnetic inline-flex"
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.18;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.18;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        });
      }}
      onMouseLeave={() => {
        const el = ref.current;
        if (!el) return;
        cancelAnimationFrame(frame.current);
        el.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}
