/** WCAG 2.x contrast utilities over the token hex values (src/design/tokens.ts). */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #rrggbb color. */
export function relLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb color: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Contrast ratio between two #rrggbb colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `fg` at `alpha` (0–1) composited over the opaque `bg`, as a #rrggbb color. This is what a browser paints for
 * `color-mix(in oklab, <fg> N%, transparent)` (= <fg> at alpha N%) sitting on a surface: the tinted badge/chip
 * background is not a token of its own, so contrast is measured against this composite.
 */
export function blend(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`Not a #rrggbb color: ${hex}`);
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const f = parse(fg);
  const b = parse(bg);
  const c = f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** The AA pairs the style guide and tests assert on: [foreground, background, minimum ratio]. */
export interface ContrastSpec {
  fg: string;
  bg: string;
  min: number;
  label: string;
}
