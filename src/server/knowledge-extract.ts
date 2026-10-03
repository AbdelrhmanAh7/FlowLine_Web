import Papa from "papaparse";
import { extractPdfTextIsolated } from "@/engine/sandbox";

export const KNOWLEDGE_MAX_CHUNKS = 2000;
export const KNOWLEDGE_JSON_MAX_DEPTH = 64;
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 120;
interface Piece { text: string; locator: Record<string, unknown> }
export class KnowledgeExtractionError extends Error {
  constructor(public code: "KNOWLEDGE_CHUNK_LIMIT" | "KNOWLEDGE_JSON_DEPTH_LIMIT" | "KNOWLEDGE_CSV_COLUMN_LIMIT" | "KNOWLEDGE_CSV_ROW_LIMIT", message: string) { super(message); }
}
const overLimit = () => new KnowledgeExtractionError("KNOWLEDGE_CHUNK_LIMIT", `This source is too large to index (limit ${KNOWLEDGE_MAX_CHUNKS} chunks)`);

function chunkText(text: string, locatorBase: Record<string, unknown> = {}, remaining = KNOWLEDGE_MAX_CHUNKS): Piece[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const out: Piece[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + CHUNK_CHARS);
    if (end < clean.length) {
      const window = clean.slice(i, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (cut > CHUNK_CHARS * 0.5) end = i + cut + 1;
    }
    const text = clean.slice(i, end).trim();
    if (text) {
      if (out.length >= remaining) throw overLimit();
      out.push({ text, locator: { ...locatorBase, part: out.length + 1 } });
    }
    if (end >= clean.length) break;
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return out;
}

/** Reject deep containers before JSON.parse/stringify; delimiters inside strings do not count. */
function checkJsonDepth(text: string) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (++depth > KNOWLEDGE_JSON_MAX_DEPTH) throw new KnowledgeExtractionError("KNOWLEDGE_JSON_DEPTH_LIMIT", `JSON nesting exceeds ${KNOWLEDGE_JSON_MAX_DEPTH} levels`);
    } else if (char === "}" || char === "]") depth--;
  }
}

/** Bounded extraction: stop building pieces as soon as the source budget is exhausted. */
export async function extractKnowledge(mime: string, bytes: Buffer): Promise<Piece[]> {
  switch (mime) {
    case "text/plain":
    case "text/markdown":
      return chunkText(bytes.toString("utf8"));
    case "application/json": {
      const text = bytes.toString("utf8");
      checkJsonDepth(text);
      let value: unknown;
      try { value = JSON.parse(text); }
      catch { throw new Error("The JSON file is not valid JSON"); }
      const items = Array.isArray(value) ? value : [value];
      if (items.length > KNOWLEDGE_MAX_CHUNKS) throw overLimit();
      const pieces: Piece[] = [];
      for (const [index, item] of items.entries()) {
        // Compact output prevents indentation from amplifying a small, deeply nested input.
        pieces.push(...chunkText(typeof item === "string" ? item : JSON.stringify(item), { item: index + 1 }, KNOWLEDGE_MAX_CHUNKS - pieces.length));
      }
      return pieces;
    }
    case "text/csv": {
      const pieces: Piece[] = [];
      let overflow = false;
      let parseError: string | undefined;
      let rowError: KnowledgeExtractionError | undefined;
      Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
        header: true, skipEmptyLines: true,
        step(result, parser) {
          if (pieces.length >= KNOWLEDGE_MAX_CHUNKS) { overflow = true; parser.abort(); return; }
          if ((result.meta.fields?.length ?? 0) > 200) { rowError = new KnowledgeExtractionError("KNOWLEDGE_CSV_COLUMN_LIMIT", "CSV rows are limited to 200 columns"); parser.abort(); return; }
          if (result.errors.length && !parseError) parseError = result.errors[0]!.message;
          let text = "";
          for (const [key, value] of Object.entries(result.data)) {
            if (text.length + key.length + String(value).length + 4 > 4000) { rowError = new KnowledgeExtractionError("KNOWLEDGE_CSV_ROW_LIMIT", "CSV row text is limited to 4,000 characters"); parser.abort(); return; }
            text += `${text ? "; " : ""}${key}: ${value}`;
          }
          pieces.push({ text, locator: { row: pieces.length + 1 } });
        },
      });
      if (overflow) throw overLimit();
      if (rowError) throw rowError;
      if (parseError && pieces.length === 0) throw new Error(`The CSV couldn't be parsed: ${parseError}`);
      return pieces;
    }
    case "application/pdf": {
      const { text } = await extractPdfTextIsolated(bytes.toString("base64"));
      if (!text.trim()) throw new Error("No text could be extracted from this PDF (scanned PDFs without a text layer aren't supported)");
      return chunkText(text);
    }
    default: throw new Error(`Unsupported type ${mime}`);
  }
}
