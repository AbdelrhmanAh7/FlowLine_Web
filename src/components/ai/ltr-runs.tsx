import { Fragment, type ReactNode } from "react";

/** A run of non-Arabic text that starts like a technical token (name, id, URL, section number, amount, quote…). */
const RUN = /[A-Za-z0-9$§`"{/][^؀-ۿ«»]*/g;
const EDGES = /^(\s*)([\s\S]*?)([\s.,;:!?]*)$/;

export type Piece = { text: string; ltr: boolean };

/** Splits `run` at parentheses that have no partner inside it (they belong to the surrounding sentence). */
function splitUnpaired(run: string): string[] {
  const open: number[] = [];
  const cuts = new Set<number>();
  for (let i = 0; i < run.length; i++) {
    if (run[i] === "(") open.push(i);
    else if (run[i] === ")") {
      if (open.length) open.pop();
      else cuts.add(i);
    }
  }
  for (const i of open) cuts.add(i);
  const parts: string[] = [];
  let from = 0;
  for (const i of [...cuts].sort((a, b) => a - b)) {
    parts.push(run.slice(from, i), run[i]!);
    from = i + 1;
  }
  parts.push(run.slice(from));
  return parts;
}

/**
 * Splits RTL prose into plain text and left-to-right islands: Latin names, model ids, URLs, section numbers ("OSA §3.1")
 * and English quotations stay LTR and in order inside an Arabic sentence. Pure; exported for tests.
 */
export function ltrPieces(text: string): Piece[] {
  const out: Piece[] = [];
  const push = (t: string, ltr: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && !last.ltr && !ltr) last.text += t;
    else out.push({ text: t, ltr });
  };
  let at = 0;
  for (const m of text.matchAll(RUN)) {
    push(text.slice(at, m.index), false);
    for (const part of splitUnpaired(m[0])) {
      if (part === "(" || part === ")") {
        push(part, false);
        continue;
      }
      const [, lead = "", core = "", tail = ""] = EDGES.exec(part) ?? [];
      push(lead, false);
      push(core, /[A-Za-z0-9]/.test(core));
      push(tail, false);
    }
    at = m.index + m[0].length;
  }
  push(text.slice(at), false);
  return out;
}

/** Renders product prose; in right-to-left text, technical runs are isolated as LTR (`dir="ltr"`). */
export function LtrRuns({ text, rtl }: { text: string; rtl: boolean }): ReactNode {
  if (!rtl) return text;
  return ltrPieces(text).map((p, i) =>
    p.ltr ? (
      <span key={i} dir="ltr">
        {p.text}
      </span>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    ),
  );
}
