// Placeholder props so `remotion studio` opens without the pipeline. The real render always passes --props=<file>
// with tokens resolved from src/design/tokens.json; these hex values only mirror them for the studio preview.
import type { DemoProps } from "./props.ts";

export const defaultProps: DemoProps = {
  src: "",
  clip: "studio",
  shape: "window",
  locale: "en",
  theme: "light",
  fps: 60,
  canvas: { w: 1920, h: 1080 },
  durationS: 8,
  loop: false,
  dissolveS: 1.1,
  tokens: {
    bg: "#f4f4f5",
    accent: "#6a5ae8",
    textHi: "#18181b",
    surface: "#fafafa",
    brand: { "400": "#8e80ff", "500": "#7c6cff", "700": "#584ad4" },
    sky: { "300": "#7dd3fc", "800": "#075985" },
    neutral: { "50": "#fafafa", "950": "#09090b" },
  },
  fonts: [],
  data: {
    schema: 1,
    viewport: { w: 1280, h: 720, dsf: 1.5 },
    duration: 8,
    locale: "en",
    theme: "light",
    events: [
      { t: 1.4, type: "move", from: [640, 360], to: [880, 420], dur: 0.9 },
      { t: 2.6, type: "click", x: 880, y: 420, box: { x: 820, y: 396, w: 120, h: 48 }, label: "Run" },
    ],
  },
  captions: [{ t0: 1.6, t1: 4.6, text: "Run the flow in one click" }],
  chapters: [],
};
