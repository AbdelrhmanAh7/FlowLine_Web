"use client";

import { motion, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * Gentle magnetic feedback on CTAs: the control drifts a few px toward the cursor and springs back.
 * Transform only; reduced motion and touch devices get the plain control.
 */
export function Magnetic({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 200, damping: 18 });
  const y = useSpring(0, { stiffness: 200, damping: 18 });
  if (reduced) return <div className="inline-flex">{children}</div>;
  return (
    <motion.div
      ref={ref}
      className="inline-flex"
      style={{ x, y }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * 0.18);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.18);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
