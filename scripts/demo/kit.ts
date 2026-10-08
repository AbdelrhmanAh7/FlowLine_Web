// Recorder helpers for the demo scenarios: real-DPR screencast frames + an events log on the same clock (issue #96
// sections 8-9). Every input is logged immediately before it is dispatched; mouse moves are eased `page.mouse.move`
// steps (real hover states). The cursor is not in the frames: the compositor redraws it from the log.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { Box, DemoEvent, EventsFile, Locale, Theme } from "../../tools/demo-video/src/props";
import { VIEWPORT } from "./clips";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Minimum-jerk easing, the same curve the compositor uses for camera and cursor. */
export const ease = (u: number) => u * u * u * (u * (6 * u - 15) + 10);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rbox = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

/** Text the honesty guard refuses anywhere in the DOM: test-double names, real-looking emails, localhost, API keys. */
export const GUARD_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "fake-", re: /fake-/i },
  { name: "localhost", re: /localhost/i },
  { name: "sk-", re: /\bsk-[A-Za-z0-9]/ },
  { name: "email outside @flowline-demo.test", re: /[A-Z0-9._%+-]+@(?!flowline-demo\.test\b)[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i },
];

/** Problems the guard finds in one text sample (exported for the unit test). */
export function guardText(text: string): string[] {
  return GUARD_PATTERNS.filter((p) => p.re.test(text)).map((p) => `${p.name}: "${text.match(p.re)![0]}"`);
}

/**
 * Watches every text node and on-screen attribute the page ever renders (MutationObserver from the first paint of each
 * document), so a value that flashes for one frame still fails the build. Runs in the page; reports through
 * `window.__demoGuard`.
 */
export async function installGuard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __demoGuard: string[] };
    w.__demoGuard = [];
    const seen = new Set<string>();
    const ATTRS = ["value", "title", "aria-label", "placeholder", "alt", "aria-description"];
    const scan = (s: string | null | undefined) => {
      if (!s || seen.has(s)) return;
      seen.add(s);
      w.__demoGuard.push(s);
    };
    const visit = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const p = n.parentElement?.tagName;
        if (p !== "SCRIPT" && p !== "STYLE" && p !== "NOSCRIPT" && p !== "TEMPLATE") scan(n.textContent);
        return;
      }
      if (n instanceof Element) {
        if (n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
        for (const a of ATTRS) scan(n.getAttribute(a));
        if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) scan(n.value);
        n.childNodes.forEach(visit);
      }
    };
    const start = () => {
      visit(document.documentElement);
      new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === "characterData") visit(m.target);
          else if (m.type === "attributes") visit(m.target);
          else m.addedNodes.forEach(visit);
        }
      }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      document.addEventListener("input", (e) => visit(e.target as Node), true);
    };
    if (document.documentElement) start();
    else document.addEventListener("DOMContentLoaded", start);
  });
}

/** Text samples collected since the last call (the page's buffer is drained). */
async function drainGuard(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __demoGuard?: string[] };
    const out = w.__demoGuard ?? [];
    w.__demoGuard = [];
    return out;
  });
}

export type RecorderOpts = { dir: string; locale: Locale; theme: Theme };

/**
 * One recording: `start()` begins the screencast (frames/NNNNNN.jpg + their timestamps), the action helpers log
 * events.json on the frame clock, `stop()` writes frames.json and events.json.
 */
export class Recorder {
  readonly page: Page;
  private readonly opts: RecorderOpts;
  private readonly frames: { i: number; t: number }[] = [];
  private readonly events: DemoEvent[] = [];
  private readonly guardHits = new Set<string>();
  private t0: number | null = null;
  private cur: [number, number] = [VIEWPORT.w / 2, VIEWPORT.h / 2];
  private stopScreencast: (() => Promise<void>) | null = null;
  private guardTimer: ReturnType<typeof setInterval> | null = null;
  private base: { cx: number; cy: number } | null = null;

  constructor(page: Page, opts: RecorderOpts) {
    this.page = page;
    this.opts = opts;
  }

  /** Seconds since the first frame (the clock of frames.json and events.json). */
  now() {
    if (this.t0 === null) throw new Error("recorder not started");
    return Date.now() / 1000 - this.t0;
  }

  async start() {
    const dir = join(this.opts.dir, "frames");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    let n = 0;
    const size = { width: Math.round(VIEWPORT.w * VIEWPORT.dsf), height: Math.round(VIEWPORT.h * VIEWPORT.dsf) };
    const disposable = await this.page.screencast.start({
      size,
      quality: 90,
      onFrame: ({ data, timestamp }) => {
        const ts = timestamp / 1000; // epoch milliseconds
        this.t0 ??= ts;
        n++;
        writeFileSync(join(dir, `${String(n).padStart(6, "0")}.jpg`), data);
        this.frames.push({ i: n, t: r3(ts - this.t0) });
      },
    });
    this.stopScreencast = async () => {
      await this.page.screencast.stop();
      void disposable;
    };
    for (let i = 0; i < 100 && this.t0 === null; i++) await sleep(20);
    if (this.t0 === null) throw new Error("the screencast delivered no frame in 2 s");
    // Text the page rendered before recording counts too; then poll the guard buffer while recording.
    this.guardTimer = setInterval(() => void this.checkGuard().catch(() => {}), 500);
  }

  private async checkGuard() {
    for (const s of await drainGuard(this.page)) for (const hit of guardText(s)) this.guardHits.add(hit);
  }

  /** Storyboard marker (captions, chapters and chips resolve against these). */
  beat(id: string) {
    this.events.push({ t: r3(this.now()), type: "beat", id });
  }

  /** Wide-shot centre for the full-bleed tiles (written to scene.json; the compositor crops around it). */
  setBase(cx: number, cy: number) {
    this.base = { cx: Math.round(cx), cy: Math.round(cy) };
  }

  /** A deliberate on-screen pause for the viewer (pacing, never synchronisation). */
  hold(seconds: number) {
    return sleep(seconds * 1000);
  }

  async box(target: Locator): Promise<Box> {
    await target.waitFor({ state: "visible" });
    const b = await target.boundingBox();
    if (!b) throw new Error(`no bounding box for ${target}`);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** Eased cursor path with real hover events along the way. */
  async moveTo(x: number, y: number, dur = 0.75) {
    const [fx, fy] = this.cur;
    if (Math.hypot(x - fx, y - fy) < 1) return;
    this.events.push({ t: r3(this.now()), type: "move", from: [Math.round(fx), Math.round(fy)], to: [Math.round(x), Math.round(y)], dur });
    const start = Date.now();
    for (;;) {
      const u = Math.min(1, (Date.now() - start) / (dur * 1000));
      const e = ease(u);
      await this.page.mouse.move(fx + (x - fx) * e, fy + (y - fy) * e);
      if (u >= 1) break;
      await sleep(8);
    }
    this.cur = [x, y];
  }

  /** Moves to the element's centre (or a fractional point of its box) and returns its box. */
  async hover(target: Locator, opts: { dur?: number; at?: [number, number]; label?: string; focus?: boolean } = {}) {
    const b = await this.box(target);
    const [ax, ay] = opts.at ?? [0.5, 0.5];
    await this.moveTo(b.x + b.w * ax, b.y + b.h * ay, opts.dur);
    if (opts.focus) this.events.push({ t: r3(this.now()), type: "focus", box: rbox(b), label: opts.label });
    return b;
  }

  /** Camera target without a click (e.g. a result panel the viewer should read). */
  async focus(target: Locator | Box, label: string) {
    const b = "x" in target ? target : await this.box(target);
    this.events.push({ t: r3(this.now()), type: "focus", box: rbox(b), label });
    return b;
  }

  /** Real click at the element centre, logged with the element box (the camera zooms to the box). */
  async click(target: Locator, label: string, opts: { dur?: number; at?: [number, number]; box?: Locator } = {}) {
    const b = await this.hover(target, { dur: opts.dur, at: opts.at });
    const zoomBox = opts.box ? await this.box(opts.box) : b;
    await sleep(120); // the camera arrives >= 0.12 s before the click
    const [x, y] = this.cur;
    this.events.push({ t: r3(this.now()), type: "click", x: Math.round(x), y: Math.round(y), box: rbox(zoomBox), label });
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
    return b;
  }

  /** Clicks a field and types into it at a readable pace, logged as one `type` event (t .. t1). */
  async type(target: Locator, text: string, label: string, opts: { delayMs?: number; clear?: boolean } = {}) {
    const b = await this.click(target, `${label}-focus`);
    if (opts.clear) await target.fill("");
    const t = r3(this.now());
    await target.pressSequentially(text, { delay: opts.delayMs ?? 55 });
    this.events.push({ t, type: "type", box: rbox(b), t1: r3(this.now()), label });
    return b;
  }

  /** Real mouse drag (press, eased move, release), for palette drops and edge connections. */
  async drag(from: [number, number], to: [number, number], label: string, opts: { dur?: number; box?: Box } = {}) {
    const dur = opts.dur ?? 0.9;
    await this.moveTo(from[0], from[1]);
    await sleep(120);
    await this.page.mouse.down();
    await this.page.mouse.move(from[0] + 12, from[1] + 2, { steps: 3 }); // native HTML drag needs a move after dragstart
    this.cur = [from[0] + 12, from[1] + 2];
    const box = opts.box ?? { x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]), w: Math.abs(to[0] - from[0]), h: Math.abs(to[1] - from[1]) };
    this.events.push({ t: r3(this.now()), type: "drag", from: [Math.round(this.cur[0]), Math.round(this.cur[1])], to: [Math.round(to[0]), Math.round(to[1])], dur, box: rbox(box), label });
    const [fx, fy] = this.cur;
    const start = Date.now();
    for (;;) {
      const u = Math.min(1, (Date.now() - start) / (dur * 1000));
      const e = ease(u);
      await this.page.mouse.move(fx + (to[0] - fx) * e, fy + (to[1] - fy) * e);
      if (u >= 1) break;
      await sleep(12);
    }
    await this.page.mouse.move(to[0] + 1, to[1] + 1); // a separate dragover before release
    await this.page.mouse.up();
    this.cur = [to[0] + 1, to[1] + 1];
  }

  /** Stops the screencast, runs the final honesty check and writes frames.json + events.json. */
  async stop(): Promise<EventsFile> {
    const duration = r3(this.now());
    if (this.guardTimer) clearInterval(this.guardTimer);
    await this.checkGuard();
    await this.stopScreencast?.();
    if (this.guardHits.size) throw new Error(`honesty guard: the DOM contained ${[...this.guardHits].join("; ")}`);
    if (this.frames.length < 2) throw new Error("the screencast captured fewer than 2 frames");
    const file: EventsFile = { schema: 1, viewport: { ...VIEWPORT }, duration, locale: this.opts.locale, theme: this.opts.theme, events: [...this.events].sort((a, b) => a.t - b.t) };
    writeFileSync(join(this.opts.dir, "frames.json"), JSON.stringify(this.frames));
    writeFileSync(join(this.opts.dir, "events.json"), JSON.stringify(file, null, 1) + "\n");
    writeFileSync(join(this.opts.dir, "scene.json"), JSON.stringify({ base: this.base }) + "\n");
    return file;
  }
}
