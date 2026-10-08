// Run with: node --test src/camera.test.ts (Node's native type stripping; no bundler involved).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shapeCamera,
  buildTrack,
  cameraAt,
  cameraTargets,
  cameraWithCaptions,
  contentRect,
  cursorAt,
  cursorOpacity,
  cursorScale,
  dissolveWeight,
  fromCanvas,
  pressScale,
  psnr,
  ripplesAt,
  viewTransform,
  zoomForBox,
} from "./camera.ts";
import type { CamKey } from "./camera.ts";
import type { DemoEvent } from "./props.ts";

const VP = { w: 1280, h: 720 };
const CANVAS = { w: 1920, h: 1080 };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const click = (t: number, x: number, y: number, w = 120, h = 44): DemoEvent => ({
  t, type: "click", x, y, box: { x: x - w / 2, y: y - h / 2, w, h },
});
const move = (t: number, from: [number, number], to: [number, number], dur = 0.8): DemoEvent => ({ t, type: "move", from, to, dur });
/** Samples cameraAt every 1/60 s over [t0, t1]. */
const sample = (keys: CamKey[], t0: number, t1: number) => {
  const out: { t: number; s: number }[] = [];
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 60) out.push({ t, s: cameraAt(keys, t).s });
  return out;
};

test("zoom is clamped to 1.35-1.8", () => {
  assert.equal(zoomForBox({ x: 600, y: 300, w: 10, h: 10 }, VP), 1.8);
  assert.equal(zoomForBox({ x: 0, y: 0, w: 1000, h: 600 }, VP), 1.35);
  const mid = zoomForBox({ x: 500, y: 300, w: 400, h: 200 }, VP); // roi 880x440 -> min(1.45, 1.63)
  assert.ok(mid > 1.35 && mid < 1.8, `mid zoom ${mid}`);
  const ts = cameraTargets([move(1, [100, 100], [300, 300]), click(2, 300, 300, 10, 10)], VP);
  assert.equal(ts.length, 1);
  assert.equal(ts[0].s, 1.8);
  assert.equal(ts[0].dep, 1); // zoom-in starts at cursor departure
});

test("track keys are monotonic and start/end wide", () => {
  const events = [move(1.2, [640, 360], [400, 300]), click(2, 400, 300), move(4.2, [400, 300], [900, 500]), click(5, 900, 500), click(5.6, 910, 505)];
  const keys = buildTrack(events, VP, 10);
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i].t >= keys[i - 1].t, `key ${i} goes backwards`);
  assert.deepEqual(cameraAt(keys, 0), { s: 1, cx: 640, cy: 360 });
  assert.deepEqual(cameraAt(keys, 10), { s: 1, cx: 640, cy: 360 });
});

test("returns to the wide shot (centre) 0.9 s after the hold of a lone click", () => {
  const keys = buildTrack([move(2.2, [640, 360], [300, 200]), click(3, 300, 200)], VP, 10);
  const hold = 3 + 1.3;
  assert.ok(cameraAt(keys, hold).s > 1.35, "still zoomed at the end of the hold");
  const back = cameraAt(keys, hold + 0.9);
  assert.ok(near(back.s, 1) && near(back.cx, 640) && near(back.cy, 360), `wide again: ${JSON.stringify(back)}`);
  assert.ok(cameraAt(keys, hold + 0.45).s > 1.05 && cameraAt(keys, hold + 0.45).s < 1.7, "mid-return is in between");
});

test("pans directly (never wide in between) when the next zoom-in starts < 1.2 s after the hold", () => {
  // Click 1 at t=3 (hold to 4.3); click 2 at t=5.5 with its cursor leaving at 4.5: zoom-in start 4.5, 0.2 s after the hold.
  const events = [
    move(2.2, [640, 360], [200, 200]), click(3, 200, 200),
    move(4.5, [200, 200], [1000, 500]), click(5.5, 1000, 500),
  ];
  const keys = buildTrack(events, VP, 12);
  const mid = sample(keys, 3 - 0.12, 5.5 - 0.12);
  const minS = Math.min(...mid.map((p) => p.s));
  assert.ok(minS > 1.35 - 1e-6, `s dipped to ${minS} between the two targets`);
  // ...and the camera really moves from target 1 to target 2.
  assert.ok(near(cameraAt(keys, 4.3).cx, 200) && near(cameraAt(keys, 5.5 - 0.12).cx, 1000));
  // A far-apart pair goes back to wide in between.
  const apart = buildTrack([move(2.2, [640, 360], [200, 200]), click(3, 200, 200), move(7, [200, 200], [1000, 500]), click(8, 1000, 500)], VP, 12);
  assert.ok(Math.min(...sample(apart, 3.5, 7.5).map((p) => p.s)) < 1 + 1e-6, "far-apart targets return to wide between");
});

test("zoom-in lasts 0.8-1.2 s and arrives >= 0.12 s before the click", () => {
  for (const [dep, t] of [[1.9, 3], [1.0, 3], [2.8, 3]] as const) { // early, normal and late departures
    const keys = buildTrack([move(dep, [640, 360], [300, 200]), click(t, 300, 200)], VP, 10);
    const target = cameraTargets([click(t, 300, 200)], VP)[0];
    assert.ok(near(cameraAt(keys, t - 0.12).s, target.s, 1e-9), `settled 0.12 s before the click (dep ${dep})`);
    const start = keys.find((k) => k.s === 1 && k.t > 0.6 - 1e-9 && k.t < t)!; // last wide key before the zoom
    const dur = t - 0.12 - start.t;
    assert.ok(dur >= 0.8 - 1e-9 && dur <= 1.2 + 1e-9, `zoom-in lasted ${dur}s (dep ${dep})`);
    if (dep >= t - 0.12 - 1.2 && dep <= t - 0.12 - 0.8) assert.ok(near(start.t, dep), "starts at the cursor departure");
  }
});

test("establishing shot: wide for the first 0.6 s, and the clip ends wide", () => {
  const keys = buildTrack([move(0.1, [640, 360], [300, 200]), click(1.9, 300, 200)], VP, 10);
  for (const p of sample(keys, 0, 0.6)) assert.ok(near(p.s, 1), `zoomed at ${p.t}`);
  assert.ok(cameraAt(keys, 1.9 - 0.12).s > 1.35);
  // Last click so late that the normal hold would run past the end: the camera is still wide by the duration.
  const late = buildTrack([move(7.9, [640, 360], [300, 200]), click(8.8, 300, 200)], VP, 10);
  const end = cameraAt(late, 10);
  assert.ok(near(end.s, 1) && near(end.cx, 640) && near(end.cy, 360), `ends wide: ${JSON.stringify(end)}`);
  for (let i = 1; i < late.length; i++) assert.ok(late[i].t >= late[i - 1].t);
});

test("window-edge clamp: while zoomed no background shows, even for a target in the corner", () => {
  const rect = contentRect("window", CANVAS, VP);
  assert.ok(near(rect.w, 1664, 0.01) && near(rect.h, 936, 0.01) && near(rect.x, 128, 0.01) && near(rect.y, 72, 0.01), JSON.stringify(rect));
  const corners = [click(3, 1230, 690, 60, 40), click(3, 40, 30, 60, 40), click(3, 1240, 30, 60, 40), click(3, 30, 700, 60, 40)];
  for (const ev of corners) {
    const keys = buildTrack([move(2.2, [640, 360], [ev.type === "click" ? ev.x : 0, ev.type === "click" ? ev.y : 0]), ev], VP, 10);
    for (const { t, s } of sample(keys, 0, 10)) {
      const cam = cameraAt(keys, t);
      const tr = viewTransform(cam, rect, CANVAS, VP);
      const left = tr.tx + s * rect.x;
      const right = tr.tx + s * (rect.x + rect.w);
      const top = tr.ty + s * rect.y;
      const bottom = tr.ty + s * (rect.y + rect.h);
      if (s * rect.w >= CANVAS.w) assert.ok(left <= 1e-6 && right >= CANVAS.w - 1e-6, `horizontal gap at t=${t} s=${s}`);
      if (s * rect.h >= CANVAS.h) assert.ok(top <= 1e-6 && bottom >= CANVAS.h - 1e-6, `vertical gap at t=${t} s=${s}`);
    }
    const zoomed = viewTransform(cameraAt(keys, 3), rect, CANVAS, VP);
    assert.ok(zoomed.scale > 1.35);
    assert.ok(zoomed.tx + zoomed.scale * rect.x <= 1e-6 && zoomed.tx + zoomed.scale * (rect.x + rect.w) >= CANVAS.w - 1e-6, "zoomed window covers the canvas horizontally");
    assert.ok(zoomed.ty + zoomed.scale * rect.y <= 1e-6 && zoomed.ty + zoomed.scale * (rect.y + rect.h) >= CANVAS.h - 1e-6, "zoomed window covers the canvas vertically");
  }
});

test("square tiles keep 30% of a zoom moment (1.35-1.8 becomes 1.105-1.24); other shapes are unchanged", () => {
  assert.equal(shapeCamera({ s: 1.8, cx: 1, cy: 2 }, "square").s.toFixed(3), "1.240");
  assert.equal(shapeCamera({ s: 1.35, cx: 1, cy: 2 }, "square").s.toFixed(3), "1.105");
  assert.equal(shapeCamera({ s: 1, cx: 1, cy: 2 }, "square").s, 1);
  assert.equal(shapeCamera({ s: 1.8, cx: 1, cy: 2 }, "wide").s, 1.8);
  assert.equal(shapeCamera({ s: 1.8, cx: 1, cy: 2 }, "window").s, 1.8);
});

test("bleed shapes always cover the canvas", () => {
  for (const [shape, canvas] of [["wide", { w: 1280, h: 720 }], ["square", { w: 1080, h: 1080 }]] as const) {
    const rect = contentRect(shape, canvas, VP, { cx: 400, cy: 360 });
    assert.ok(rect.x <= 1e-9 && rect.x + rect.w >= canvas.w - 1e-9 && rect.y <= 1e-9 && rect.y + rect.h >= canvas.h - 1e-9);
    const keys = buildTrack([move(2.2, [400, 360], [1230, 690]), click(3, 1230, 690, 60, 40)], VP, 10, { cx: 400, cy: 360 });
    for (const { t, s } of sample(keys, 0, 10)) {
      const tr = viewTransform(cameraAt(keys, t), rect, canvas, VP);
      assert.ok(tr.tx + s * rect.x <= 1e-6 && tr.tx + s * (rect.x + rect.w) >= canvas.w - 1e-6, `${shape} horizontal gap at ${t}`);
      assert.ok(tr.ty + s * rect.y <= 1e-6 && tr.ty + s * (rect.y + rect.h) >= canvas.h - 1e-6, `${shape} vertical gap at ${t}`);
    }
  }
});

test("a visible caption lifts the zoomed ROI centre by 6% of the viewport height", () => {
  const keys = buildTrack([move(2.2, [640, 360], [300, 200]), click(3, 300, 200)], VP, 10);
  const caps = [{ t0: 2.5, t1: 5 }];
  const lifted = cameraWithCaptions(keys, 3.5, caps, VP);
  const plain = cameraAt(keys, 3.5);
  assert.ok(near(lifted.cy - plain.cy, 0.06 * 720, 1e-6), `lift ${lifted.cy - plain.cy}`);
  assert.equal(cameraWithCaptions(keys, 1, caps, VP).cy, cameraAt(keys, 1).cy);
});

test("cursor path, press, ripple and opacity", () => {
  const events: DemoEvent[] = [move(1, [100, 100], [500, 300], 1), click(2.3, 500, 300), move(6, [500, 300], [700, 400], 0.8)];
  assert.deepEqual(cursorAt(events, 0.5, [50, 60]), [50, 60]);
  assert.deepEqual(cursorAt(events, 2, [0, 0]), [500, 300]);
  const midway = cursorAt(events, 1.5, [0, 0]);
  const dist = Math.hypot(400, 200);
  const offLine = Math.abs((midway[0] - 300) * 200 - (midway[1] - 200) * 400) / dist; // distance from the straight line
  assert.ok(near(offLine, 0.06 * dist, 1e-6), `arc ${offLine}`);
  assert.ok(near(cursorScale(1.8), 1.096, 1e-9) && cursorScale(1) === 1);
  assert.ok(near(pressScale(events, 2.3 + 0.1), 0.86, 1e-9) && pressScale(events, 2.6) === 1);
  assert.equal(ripplesAt(events, 2.3 + 0.3).length, 1);
  assert.equal(ripplesAt(events, 2.3 + 0.6).length, 0);
  assert.ok(near(ripplesAt(events, 2.3 + 0.55)[0].p, 1));
  const info = { durationS: 10, dissolveS: 1.1, loop: false };
  assert.ok(cursorOpacity(events, 2, info) === 1);
  assert.ok(cursorOpacity(events, 2.3 + 2 + 0.3 + 0.01, info) === 0, "faded out after 2 s idle");
  assert.ok(cursorOpacity(events, 2.3 + 2.15, info) > 0 && cursorOpacity(events, 2.3 + 2.15, info) < 1);
  assert.ok(cursorOpacity(events, 6.5, info) > 0.9, "back in on new activity");
  const loop = { durationS: 10, dissolveS: 1.1, loop: true };
  assert.equal(cursorOpacity(events, 0, loop), 0);
  assert.equal(cursorOpacity(events, 10, loop), 0);
  assert.ok(cursorOpacity(events, 1.5, loop) === 1);
  assert.equal(dissolveWeight(5, 10, 1.1, false), 0);
  assert.equal(dissolveWeight(5, 10, 1.1, true), 0);
  assert.ok(near(dissolveWeight(10, 10, 1.1, true), 1) && near(dissolveWeight(10 - 0.55, 10, 1.1, true), 0.5, 1e-9));
});

// ---- loop seam: render a synthetic deterministic "app" through the full view transform + dissolve, last vs first frame.
const SW = 192;
const SH = 108;
const content = (x: number, y: number, t: number): [number, number, number] => {
  const bx = 300 + 250 * Math.sin(t * 0.9);
  const by = 380 + 120 * Math.cos(t * 0.7);
  if (Math.abs(x - bx) < 90 && Math.abs(y - by) < 50) return [230, 70, 60]; // moving block (a live app animates)
  const checker = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0 ? 0 : 28;
  return [Math.round(40 + (x / VP.w) * 150) + checker, Math.round(60 + (y / VP.h) * 130) + checker, 170 - checker];
};
const background = (px: number, py: number): [number, number, number] => [Math.round(235 - 30 * (px / SW)), Math.round(232 - 30 * (py / SH)), 255];

function scene(keys: CamKey[], t: number): Float64Array {
  const rect = contentRect("window", CANVAS, VP);
  const tr = viewTransform(cameraAt(keys, t), rect, CANVAS, VP);
  const out = new Float64Array(SW * SH * 3);
  for (let j = 0; j < SH; j++) {
    for (let i = 0; i < SW; i++) {
      const [vx, vy] = fromCanvas([(i + 0.5) * (CANVAS.w / SW), (j + 0.5) * (CANVAS.h / SH)], tr, rect, VP);
      const inside = vx >= 0 && vx < VP.w && vy >= 0 && vy < VP.h;
      const c = inside ? content(vx, vy, t) : background(i, j);
      out.set(c, (j * SW + i) * 3);
    }
  }
  return out;
}

function frame(keys: CamKey[], t: number, durationS: number, dissolveS: number): Uint8Array {
  const base = scene(keys, t);
  const w = dissolveWeight(t, durationS, dissolveS, true);
  const first = w > 0 ? scene(keys, 0) : base;
  return Uint8Array.from(base, (v, i) => Math.round(v * (1 - w) + first[i] * w));
}

test("loop seam: last frame vs first frame PSNR >= 35 dB through the full transform and dissolve", () => {
  const fps = 60;
  const durationS = 8;
  const dissolveS = 1.1;
  const events = [move(1.2, [640, 360], [500, 300]), click(2, 500, 300), move(4, [500, 300], [1000, 520]), click(5, 1000, 520)];
  const keys = buildTrack(events, VP, durationS);
  const n = Math.round(durationS * fps);
  const lastT = (n - 1) / fps;
  const first = frame(keys, 0, durationS, dissolveS);
  const last = frame(keys, lastT, durationS, dissolveS);
  const seam = psnr(last, first);
  assert.ok(seam >= 35, `seam PSNR ${seam.toFixed(1)} dB`);
  // The synthetic app really changes between the first and last frame: without the dissolve the seam would show.
  const raw = psnr(Uint8Array.from(scene(keys, lastT), Math.round), Uint8Array.from(scene(keys, 0), Math.round));
  assert.ok(raw < 35, `undissolved PSNR ${raw.toFixed(1)} dB should be visibly worse`);
  // Mid-dissolve is neither frame.
  const mid = frame(keys, durationS - dissolveS / 2, durationS, dissolveS);
  assert.ok(psnr(mid, first) < Infinity);
});
