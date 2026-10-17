// Vector arrow cursor and click ripple, drawn at OUTPUT resolution (never scaled with the recorded video).
import React from "react";
import type { Palette } from "./theme.ts";

const BASE_H = 30;
// Arrow outline in a 20x28 box, tip at (1, 1).
const ARROW = "M1 1 V23.6 L6.5 18.4 L10.2 27 L14 25.4 L10.3 16.9 L17.8 16.6 Z";

export const Cursor: React.FC<{
  x: number;
  y: number;
  /** cursorScale(zoom) x press scale x canvas factor. */
  scale: number;
  opacity: number;
  palette: Palette;
}> = ({ x, y, scale, opacity, palette }) => {
  if (opacity <= 0.001) return null;
  const h = BASE_H;
  const w = (20 / 28) * h;
  const tip = (1 / 28) * h;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 20 28"
      style={{
        position: "absolute",
        left: x - tip,
        top: y - tip,
        overflow: "visible",
        opacity,
        transformOrigin: `${tip}px ${tip}px`,
        transform: `scale(${scale})`,
        filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35)) drop-shadow(0 6px 10px rgba(0, 0, 0, 0.18))",
      }}
    >
      <path d={ARROW} fill={palette.cursorFill} stroke={palette.cursorStroke} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
};

/** Expanding ring at the click point; `p` is 0..1 (already eased). */
export const Ripple: React.FC<{ x: number; y: number; p: number; scale: number; palette: Palette }> = ({ x, y, p, scale, palette }) => {
  const r = (8 + 40 * p) * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${3 * scale}px solid ${palette.ripple}`,
        boxSizing: "border-box",
        opacity: 1 - p,
      }}
    />
  );
};
