// Pure, deterministic camera + cursor math for the `Demo` composition (issue #99, section 4). No React, no Remotion:
// `node --test src/camera.test.ts` runs this file with Node's native type stripping, so it uses `.ts` import
// specifiers and erasable TypeScript only (no enums, parameter properties or namespaces).
import type { Box, DemoEvent, Shape } from "./props.ts";

export type Vec = [number, number];
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Camera: zoom `s` (1 = wide shot) looking at viewport point (cx, cy), in viewport CSS px. */
export type CamState = { s: number; cx: number; cy: number };
export type CamKey = CamState & { t: number };

export const CAMERA = {
  /** ROI = element box x this factor, never smaller than minRoi (CSS px). */
  roiScale: 2.2,
  minRoiW: 520,
  minRoiH: 300,
  minZoom: 1.35,
  maxZoom: 1.8,
  /** The zoom-in has arrived this long before the click. */
  settle: 0.12,
  /** Zoom-in duration is clamped into [minIn, maxIn]. */
  minIn: 0.8,
  maxIn: 1.2,
  /** Cursor departure fallback: the zoom-in starts this long before the event when no `move` precedes it. */
  fallbackLead: 0.9,
  /** Hold after a click / focus; type and drag also hold `tailAfterEnd` after they finish. */
  holdAfter: 1.3,
  tailAfterEnd: 0.8,
  /** Return to the wide shot. */
  returnS: 0.9,
  /** Next zoom-in starting less than this after the hold ends: pan directly instead of going wide. */
  mergeGap: 1.2,
  /** The camera stays wide at least this long at the start. */
  establishing: 0.6,
  /** A visible caption lifts the ROI centre by this fraction of the viewport height. */
  captionShift: 0.06,
} as const;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Minimum-jerk easing 6u^5 - 15u^4 + 10u^3 (zero velocity and acceleration at both ends). */
export const smoother = (u: number) => {
  const x = clamp01(u);
  return x * x * x * (x * (6 * x - 15) + 10);
};
export const easeOutCubic = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);

/** Eased fade envelope: 0 before t0, in over `inS`, out ending at t1 (out starts at t1 - outS). Returns { inP, outP, a }. */
export function fadeEnvelope(t: number, t0: number, t1: number, inS: number, outS: number) {
  const inP = smoother((t - t0) / Math.max(1e-6, inS));
  const outP = smoother((t - (t1 - outS)) / Math.max(1e-6, outS));
  return { inP, outP, a: inP * (1 - outP) };
}

// ---------------------------------------------------------------- camera targets and track

export type CamTarget = CamState & {
  /** Event time the camera must be settled for (click / focus / type / drag start). */
  t: number;
  /** Cursor departure time (latest `move` at or before the event, else t - 0.9). */
  dep: number;
  /** Earliest time the camera may leave the target. */
  hold: number;
};


export function zoomForBox(box: Box, vp: Size): number {
  const roiW = Math.max(box.w * CAMERA.roiScale, CAMERA.minRoiW);
  const roiH = Math.max(box.h * CAMERA.roiScale, CAMERA.minRoiH);
  return clamp(Math.min(vp.w / roiW, vp.h / roiH), CAMERA.minZoom, CAMERA.maxZoom);
}

/** One camera target per click / focus / type / drag-with-box event, sorted by time. */
export function cameraTargets(events: DemoEvent[], vp: Size): CamTarget[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out: CamTarget[] = [];
  for (const e of sorted) {
    if (e.type !== "click" && e.type !== "focus" && e.type !== "type" && e.type !== "drag") continue;
    const b: Box | undefined = e.box;
    if (!b) continue;
    let dep = e.t - CAMERA.fallbackLead;
    for (const m of sorted) if (m.type === "move" && m.t <= e.t) dep = m.t;
    const end = e.type === "type" ? e.t1 : e.type === "drag" ? e.t + e.dur : null;
    const hold = end === null ? e.t + CAMERA.holdAfter : Math.max(e.t + CAMERA.holdAfter, end + CAMERA.tailAfterEnd);
    out.push({ t: e.t, s: zoomForBox(b, vp), cx: b.x + b.w / 2, cy: b.y + b.h / 2, dep, hold });
  }
  return out;
}

type Planned = { g: CamTarget; /** zoom-in (or pan) start */ S: number; /** arrival */ A: number; /** hold end */ H: number; direct: boolean };

const sameTarget = (a: CamState, b: CamState) =>
  Math.abs(a.s - b.s) < 0.05 && Math.abs(a.cx - b.cx) < 40 && Math.abs(a.cy - b.cy) < 40;

/**
 * Camera keyframes (monotonic in t, min-jerk between keys). Rules: stays wide for the first 0.6 s; zoom-in starts at
 * cursor departure, arrives >= 0.12 s before the event, lasts 0.8-1.2 s; holds >= 1.3 s; returns to wide over 0.9 s
 * unless the next zoom-in starts < 1.2 s after the hold ends (then pans directly); always ends wide by `durationS`.
 */
export function buildTrack(events: DemoEvent[], vp: Size, durationS: number, base?: { cx: number; cy: number }): CamKey[] {
  const wide: CamState = { s: 1, cx: base?.cx ?? vp.w / 2, cy: base?.cy ?? vp.h / 2 };
  const plan: Planned[] = [];
  for (const g of cameraTargets(events, vp)) {
    let A = g.t - CAMERA.settle;
    const D = clamp(A - g.dep, CAMERA.minIn, CAMERA.maxIn);
    let S = Math.max(A - D, CAMERA.establishing);
    if (A - S < 0.2) A = S + 0.2; // a click right at the start cannot keep both rules: keep the establishing shot
    const prev = plan[plan.length - 1];
    if (prev && S - prev.H < CAMERA.mergeGap) {
      if (sameTarget(prev.g, g)) {
        prev.H = Math.max(prev.H, g.hold); // same element again (focus then click then type): one continuous hold
        continue;
      }
      let P = Math.max(S, prev.H);
      if (A - P < 0.5) P = Math.max(A - 0.5, prev.A + 0.15);
      A = Math.max(A, P + 0.1);
      prev.H = P;
      plan.push({ g, S: P, A, H: g.hold, direct: true });
    } else {
      plan.push({ g, S, A, H: g.hold, direct: false });
    }
  }
  const last = plan[plan.length - 1];
  if (last) last.H = Math.max(last.A, Math.min(last.H, durationS - CAMERA.returnS));

  const keys: CamKey[] = [{ t: 0, ...wide }];
  const push = (t: number, st: CamState) => {
    const prevT = keys[keys.length - 1].t;
    keys.push({ t: Math.max(t, prevT), s: st.s, cx: st.cx, cy: st.cy });
  };
  plan.forEach((it, i) => {
    const st: CamState = { s: it.g.s, cx: it.g.cx, cy: it.g.cy };
    if (!it.direct) push(it.S, wide);
    push(it.A, st);
    push(it.H, st);
    const next = plan[i + 1];
    if (!next || !next.direct) {
      const back = i === plan.length - 1 ? Math.max(it.H + 0.05, Math.min(it.H + CAMERA.returnS, durationS)) : it.H + CAMERA.returnS;
      push(back, wide);
    }
  });
  return keys;
}

/** Camera at time t: min-jerk interpolation between the surrounding keys. */
export function cameraAt(keys: CamKey[], t: number): CamState {
  const first = keys[0];
  if (t <= first.t) return { s: first.s, cx: first.cx, cy: first.cy };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t < b.t) {
      const u = smoother((t - a.t) / Math.max(1e-6, b.t - a.t));
      return { s: lerp(a.s, b.s, u), cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u) };
    }
  }
  const end = keys[keys.length - 1];
  return { s: end.s, cx: end.cx, cy: end.cy };
}

/** 0..1: how strongly a caption is visible at t (eased in over 0.35 s, out over 0.25 s). */
export function captionWeight(captions: { t0: number; t1: number }[], t: number): number {
  let w = 0;
  for (const c of captions) w = Math.max(w, fadeEnvelope(t, c.t0, c.t1, 0.35, 0.25).a);
  return w;
}

/**
 * Camera at t including the caption lift: while a caption is visible and the camera is zoomed, the ROI centre moves
 * 6 % of the viewport height so the target sits higher on screen, clear of the bottom caption pill.
 */
export function cameraWithCaptions(keys: CamKey[], t: number, captions: { t0: number; t1: number }[], vp: Size): CamState {
  const c = cameraAt(keys, t);
  const zoomed = smoother((c.s - 1) / 0.35);
  return { ...c, cy: c.cy + CAMERA.captionShift * vp.h * captionWeight(captions, t) * zoomed };
}

// ---------------------------------------------------------------- view transform

/** Window shape: the viewport is shown at 13/15 (= 0.8667) of the canvas width, centred (1664x936 on 1920x1080). */
export const WINDOW_FRAC = 13 / 15;

/**
 * Where the recorded viewport sits on the canvas at camera zoom 1 (canvas px). `window`: centred 16:9 card. Bleed shapes
 * (`wide`, `square`): the content covers the canvas (scale = max(W/vw, H/vh)), centred on `base`, clamped so no empty
 * area shows. `rect.w / vp.w` is the canvas px per CSS px.
 */
export function contentRect(shape: Shape, canvas: Size, vp: Size, base?: { cx: number; cy: number }): Rect {
  if (shape === "window") {
    const w = Math.min(canvas.w * WINDOW_FRAC, canvas.h * WINDOW_FRAC * (vp.w / vp.h));
    const h = w * (vp.h / vp.w);
    return { x: (canvas.w - w) / 2, y: (canvas.h - h) / 2, w, h };
  }
  const k = Math.max(canvas.w / vp.w, canvas.h / vp.h);
  const w = vp.w * k;
  const h = vp.h * k;
  const cx = base?.cx ?? vp.w / 2;
  const cy = base?.cy ?? vp.h / 2;
  return {
    x: clamp(canvas.w / 2 - cx * k, canvas.w - w, 0),
    y: clamp(canvas.h / 2 - cy * k, canvas.h - h, 0),
    w,
    h,
  };
}

export type ViewTransform = { tx: number; ty: number; scale: number };

function axis(canvasLen: number, rectPos: number, rectLen: number, center: number, k: number, s: number): number {
  const scaled = s * rectLen;
  if (scaled < canvasLen) return (canvasLen - scaled) / 2 - s * rectPos; // smaller than the canvas: stay centred
  const t = canvasLen / 2 - s * (rectPos + center * k);
  return clamp(t, canvasLen - s * (rectPos + rectLen), -s * rectPos); // zoomed: never show background
}

/**
 * CSS transform (`translate(tx, ty) scale(scale)` with transform-origin 0 0, applied to the element placed at `rect`)
 * that centres camera point (cx, cy) on the canvas. Clamped so, whenever the scaled content is larger than the canvas,
 * its edges never leave the canvas (no background visible); a smaller window stays centred.
 */
export function viewTransform(cam: CamState, rect: Rect, canvas: Size, vp: Size): ViewTransform {
  const k = rect.w / vp.w;
  return {
    tx: axis(canvas.w, rect.x, rect.w, cam.cx, k, cam.s),
    ty: axis(canvas.h, rect.y, rect.h, cam.cy, k, cam.s),
    scale: cam.s,
  };
}

/** Viewport CSS px point -> canvas px under a view transform. */
export function toCanvas(p: Vec, tr: ViewTransform, rect: Rect, vp: Size): Vec {
  const k = rect.w / vp.w;
  return [tr.tx + tr.scale * (rect.x + p[0] * k), tr.ty + tr.scale * (rect.y + p[1] * k)];
}

/** Inverse of `toCanvas` (canvas px -> viewport CSS px); used by the synthetic seam test. */
export function fromCanvas(p: Vec, tr: ViewTransform, rect: Rect, vp: Size): Vec {
  const k = rect.w / vp.w;
  return [((p[0] - tr.tx) / tr.scale - rect.x) / k, ((p[1] - tr.ty) / tr.scale - rect.y) / k];
}

// ---------------------------------------------------------------- cursor

/** Cursor position (viewport CSS px). Moves use min-jerk with a 6 % perpendicular arc; drags are straight. */
export function cursorAt(events: DemoEvent[], t: number, start: Vec): Vec {
  let last: Extract<DemoEvent, { type: "move" | "drag" | "click" }> | undefined;
  for (const e of events) {
    if ((e.type === "move" || e.type === "drag" || e.type === "click") && e.t <= t && (!last || e.t >= last.t)) last = e;
  }
  if (!last) return start;
  if (last.type === "click") return [last.x, last.y];
  const { from, to, dur } = last;
  const u = dur > 0 ? clamp01((t - last.t) / dur) : 1;
  const e = smoother(u);
  let x = lerp(from[0], to[0], e);
  let y = lerp(from[1], to[1], e);
  if (last.type === "move") {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
      const arc = 0.06 * dist * Math.sin(Math.PI * u);
      x += (-dy / dist) * arc;
      y += (dx / dist) * arc;
    }
  }
  return [x, y];
}

/** Cursor size grows a little with the camera zoom. */
export const cursorScale = (zoom: number) => 1 + 0.12 * (zoom - 1);

/** Press dip 1 -> 0.86 -> 1 (smooth sine) over 0.2 s after each click; drags stay pressed between 0.1 s ramps. */
export function pressScale(events: DemoEvent[], t: number): number {
  let v = 1;
  for (const e of events) {
    if (e.type === "click") {
      const dt = t - e.t;
      if (dt >= 0 && dt < 0.2) v = Math.min(v, 1 - 0.14 * Math.sin((Math.PI * dt) / 0.2));
    } else if (e.type === "drag") {
      const dt = t - e.t;
      if (dt >= 0 && dt <= e.dur + 0.1) {
        const down = smoother(dt / 0.1);
        const up = smoother((dt - e.dur) / 0.1);
        v = Math.min(v, 1 - 0.14 * down * (1 - up));
      }
    }
  }
  return v;
}

export type Ripple = { x: number; y: number; p: number };
/** Active click ripples (progress 0..1 over 0.55 s, ease-out-cubic). */
export function ripplesAt(events: DemoEvent[], t: number): Ripple[] {
  const out: Ripple[] = [];
  for (const e of events) {
    if (e.type !== "click") continue;
    const dt = t - e.t;
    if (dt >= 0 && dt <= 0.55) out.push({ x: e.x, y: e.y, p: easeOutCubic(dt / 0.55) });
  }
  return out;
}

export type LoopInfo = { durationS: number; dissolveS: number; loop: boolean };

/** Loop seam weight: 0 -> 1 (min-jerk) over the last `dissolveS` seconds; always 0 for non-loops. */
export function dissolveWeight(t: number, durationS: number, dissolveS: number, loop: boolean): number {
  if (!loop || dissolveS <= 0) return 0;
  return smoother((t - (durationS - dissolveS)) / dissolveS);
}

const IDLE_S = 2;
const IDLE_FADE_S = 0.3;
const FADE_IN_S = 0.25;

/**
 * Cursor opacity: visible while there is move / click / drag / type activity; fades out (0.3 s) after 2 s of idling and
 * back in (0.25 s) on new activity; fades out with the loop dissolve; loop clips fade in over their first 0.4 s.
 */
export function cursorOpacity(events: DemoEvent[], t: number, loop: LoopInfo): number {
  let a = 0;
  for (const e of events) {
    let t0: number;
    let t1: number;
    if (e.type === "move" || e.type === "drag") { t0 = e.t; t1 = e.t + e.dur; }
    else if (e.type === "click") { t0 = e.t; t1 = e.t; }
    else if (e.type === "type") { t0 = e.t; t1 = e.t1; }
    else continue;
    if (t < t0) continue;
    const fin = smoother((t - t0) / FADE_IN_S);
    const idle = t - Math.max(t1, t0);
    const fout = t <= t1 ? 1 : 1 - smoother((idle - IDLE_S) / IDLE_FADE_S);
    a = Math.max(a, fin * fout);
  }
  if (loop.loop) {
    a *= smoother(t / 0.4);
    a *= 1 - dissolveWeight(t, loop.durationS, loop.dissolveS, true);
  }
  return a;
}

// ---------------------------------------------------------------- measurement

/** PSNR (dB) between two equally long 8-bit sample arrays; Infinity when identical. */
export function psnr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) throw new Error("psnr: arrays must have the same non-zero length");
  let se = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    se += d * d;
  }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}
