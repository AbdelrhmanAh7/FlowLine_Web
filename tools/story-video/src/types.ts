// Scene model for a story film: persona → pain → solution over real UI → outcome → call to action.
// The engine (src/engine/*) renders any list of scenes; each product only edits src/story.ts and src/brand.ts.

export type Locale = "en" | "ar";

export type Brand = {
  name: string;
  /** Page background and soft gradient blobs. */
  bg: string;
  blobA: string;
  blobB: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  good: string;
  warn: string;
  bad: string;
};

/** A small card in an animated pile or queue (a lead, an invoice, a ticket...). Sample data only. */
export type Tone = "neutral" | "good" | "warn" | "bad" | "accent";
export type Card = {
  title: string;
  sub?: string;
  tag?: string;
  tone?: Tone;
  /** queue mode: what the card turns into halfway through the scene (e.g. "Waiting 2 days"). */
  later?: { tag: string; tone: Tone; faded?: boolean };
};

/** Camera focus inside a footage frame, as fractions of its width/height, plus zoom. */
export type Focus = { x: number; y: number; zoom: number };

export type Scene =
  | {
      kind: "kinetic";
      id: string;
      durationS: number;
      eyebrow?: string;
      lines: string[];
      /** Index of the line drawn in the accent colour. */
      accentLine?: number;
      cards?: Card[];
      /** pile: cards stack up; queue: cards line up and the late ones fade (wait); sorted: cards split in two columns by tone. */
      cardMode?: "pile" | "queue" | "sorted";
      /** sorted mode: headings of the two columns (first = cards with tone "good"). */
      groups?: [string, string];
      caption?: string;
    }
  | {
      kind: "persona";
      id: string;
      durationS: number;
      initial: string;
      name: string;
      role: string;
      place: string;
      facts: string[];
      caption?: string;
    }
  | {
      kind: "footage";
      id: string;
      durationS: number;
      /** File under public/footage/ (video or image). */
      src: string;
      media: "video" | "image";
      /** Video only: source in/out points in seconds. */
      fromS?: number;
      toS?: number;
      chapter: string;
      caption: string;
      /** Camera move from → to over the scene (defaults to a gentle push-in). */
      from?: Focus;
      to?: Focus;
    }
  | {
      kind: "outcome";
      id: string;
      durationS: number;
      title: string;
      points: string[];
      caption?: string;
    }
  | {
      /** Two products side by side with a card travelling from one to the other (concept; never product UI). */
      kind: "handoff";
      id: string;
      durationS: number;
      eyebrow: string;
      lines: string[];
      from: { product: string; color: string; card: Card };
      to: { product: string; color: string; card: Card };
      /** Small honest label, e.g. "Vision · not built yet". */
      badge?: string;
      caption?: string;
    }
  | {
      kind: "cta";
      id: string;
      durationS: number;
      wordmark: string;
      tagline: string;
      badge?: string;
      action: string;
      note?: string;
      caption?: string;
    };

export type Story = {
  id: string;
  locale: Locale;
  fps: number;
  width: number;
  height: number;
  scenes: Scene[];
};
