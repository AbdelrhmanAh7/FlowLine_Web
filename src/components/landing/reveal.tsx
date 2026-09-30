"use client";

import { Fragment, useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * Scroll reveal, JS as pure enhancement: server HTML is fully visible (usable without JS, safe for LCP);
 * on the client the element is hidden then revealed with a transition when it enters the viewport.
 * CSS (globals.css .reveal / .word-reveal) carries the motion.
 *
 * Reduced motion: nothing is ever hidden. The effect below never applies the hidden state under
 * `prefers-reduced-motion: reduce` (read imperatively after mount, so server and client markup are identical and
 * there is no hydration branch), and globals.css force-shows any `data-reveal="hidden"` element under that media
 * query as well, so the content is readable at once, in find-in-page, in print and for assistive tech.
 *
 * Motion budget: a reveal finishes within 300 ms end to end = at most STAGGER_TOTAL_MS of delay + the 200 ms
 * (`--dur-tab`) transition declared in globals.css. `tests/unit/design-system.test.ts` pins both halves.
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** All per-word delays of one WordReveal fit in this window, however many words the title has. */
export const STAGGER_TOTAL_MS = 100;
/** Delay between two neighbouring words of a short title (a long title compresses to fit STAGGER_TOTAL_MS). */
export const STAGGER_STEP_MS = 40;

/** Transition delay of word `index` (0-based) in a title of `count` words: never above STAGGER_TOTAL_MS. */
export function wordDelayMs(index: number, count: number): number {
  if (count <= 1) return 0;
  return Math.round(index * Math.min(STAGGER_STEP_MS, STAGGER_TOTAL_MS / (count - 1)));
}

function useScrollReveal(ref: RefObject<HTMLElement | null>, rootMargin: string, delaySeconds = 0) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia(REDUCED_MOTION).matches) return;
    if (delaySeconds) el.style.transitionDelay = `${delaySeconds}s`;
    el.dataset.reveal = "hidden";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.reveal = "shown";
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, delaySeconds]);
}

/** `delay` (seconds) staggers siblings; it is capped so delay + the 200 ms fade never exceeds the 300 ms budget. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollReveal(ref, "-15% 0px", Math.min(delay, STAGGER_TOTAL_MS / 1000));
  return (
    <div ref={ref} className={`reveal ${className ?? ""}`}>
      {children}
    </div>
  );
}

const LATIN = /\p{Script=Latin}/u;
const RTL_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;

export interface WordRun {
  /** True for a run of Latin-script words (brand names, product terms): it is isolated as LTR. */
  latin: boolean;
  /** `index` is the word's position in the whole title (its stagger slot). */
  words: { text: string; index: number }[];
}

/**
 * Splits a title into runs of consecutive words of the same kind. Each word is an inline-block (that is what lets it translate),
 * and an atomic inline is a bidi neutral: inside an Arabic (RTL) sentence a Latin PHRASE ("Google Sheets") made of separate
 * inline-blocks would be laid out right-to-left, i.e. reversed. Wrapping the Latin run in one `dir="ltr"` isolate keeps its order.
 * Words with no letters at all (dashes, numbers, "&") stay with the run they follow, so "Slack - Gmail" is one run.
 */
export function wordRuns(text: string): WordRun[] {
  const runs: WordRun[] = [];
  text
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word, index) => {
      const last = runs.at(-1);
      const latin = RTL_SCRIPT.test(word) ? false : LATIN.test(word) ? true : last?.latin === true;
      if (last && last.latin === latin) last.words.push({ text: word, index });
      else runs.push({ latin, words: [{ text: word, index }] });
    });
  return runs;
}

/**
 * Headline that reveals word by word when it scrolls into view (same IO mechanism, staggered per word).
 *
 * Accessibility: the words are ordinary text nodes and stay in the accessibility tree, so the heading's name is its text (identical
 * to `text`, spaces included). Nothing is aria-hidden and no aria-label stands in for the content: the animation is purely visual.
 * The spaces sit BETWEEN the inline-block words: a space inside an inline-block ends its line and is trimmed, which would glue words together.
 */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useScrollReveal(ref, "-10% 0px");
  const runs = wordRuns(text);
  const count = runs.reduce((n, r) => n + r.words.length, 0);
  return (
    <span ref={ref} className={`word-reveal ${className ?? ""}`}>
      {runs.map((run, r) => {
        const words = run.words.map((w, k) => (
          <Fragment key={w.index}>
            {k > 0 && " "}
            <span className="word" style={{ ["--w-delay" as string]: `${wordDelayMs(w.index, count)}ms` }}>
              {w.text}
            </span>
          </Fragment>
        ));
        return (
          <Fragment key={r}>
            {r > 0 && " "}
            {run.latin ? (
              <span dir="ltr" className="word-run">
                {words}
              </span>
            ) : (
              words
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
