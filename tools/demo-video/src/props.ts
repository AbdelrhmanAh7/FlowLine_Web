// Input contract of the `Demo` composition. Pure types (no imports) so the root pipeline (scripts/demo) can import them
// type-only without pulling Remotion into the root program. Times are seconds on the composition timeline (= the
// recording timeline: t = 0 is the first captured frame). Coordinates are CSS px of the recorded viewport.

export type Locale = "ar" | "en";
export type Theme = "light" | "dark";
/** `window`: the app floats on the token gradient (hero, walkthrough). `wide` / `square`: full-bleed tiles. */
export type Shape = "window" | "wide" | "square";

export type Box = { x: number; y: number; w: number; h: number };

export type DemoEvent =
  | { t: number; type: "move"; from: [number, number]; to: [number, number]; dur: number }
  | { t: number; type: "click"; x: number; y: number; box: Box; label?: string }
  | { t: number; type: "focus"; box: Box; label?: string }
  | { t: number; type: "type"; box: Box; t1: number; label?: string }
  | { t: number; type: "drag"; from: [number, number]; to: [number, number]; dur: number; box?: Box; label?: string }
  | { t: number; type: "beat"; id: string };

/** events.json (recorder → compositor), section 9 of issue #96. */
export type EventsFile = {
  schema: 1;
  viewport: { w: number; h: number; dsf: number };
  duration: number;
  locale: Locale;
  theme: Theme;
  events: DemoEvent[];
};

/** Raw token values the CLI resolves from src/design/tokens.json; theme.ts turns them into the palette. */
export type ThemeTokens = {
  bg: string;
  accent: string;
  textHi: string;
  surface: string;
  brand: Record<string, string>;
  sky: Record<string, string>;
  neutral: Record<string, string>;
};

export type TimedText = { t0: number; t1: number; text: string };

export type DemoProps = {
  /** Master video file name inside tools/demo-video/public/. */
  src: string;
  clip: string;
  shape: Shape;
  locale: Locale;
  theme: Theme;
  fps: number;
  canvas: { w: number; h: number };
  /** Composition length in seconds (the recorded duration). */
  durationS: number;
  /** Loops cross-dissolve their last `dissolveS` seconds into frame 0. */
  loop: boolean;
  dissolveS: number;
  /** Poster mode: no cursor, ripple, captions, chips or cards. */
  poster?: boolean;
  tokens: ThemeTokens;
  /** Font files (inside public/fonts/) per family. */
  fonts: { family: string; file: string; weight: string; /** CSS unicode-range of this subset; inferred from a `-arabic-` / `-latin-` file name when omitted. */ unicodeRange?: string }[];
  data: EventsFile;
  captions: TimedText[];
  /** Hero step chips: all shown from `tIn` to `tOut`; chip i is active from items[i].t0. */
  chips?: { tIn: number; tOut: number; items: { t0: number; text: string }[] };
  /** Chapter cards (walkthrough). */
  chapters: (TimedText & { index: number })[];
  /** End card: wordmark + badge from `t0` to the end. */
  endCard?: { t0: number; wordmark: string; badge: string };
  /** Wide-shot centre in viewport CSS px (bleed tiles crop around it); default the viewport centre. */
  base?: { cx: number; cy: number };
};
