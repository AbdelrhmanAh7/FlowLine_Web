import type { MessageKey } from "./types";
import type { Translator } from "./translate";

const KEYS: Record<string, MessageKey> = {
  KNOWLEDGE_CHUNK_LIMIT: "knowledge.errors.chunkLimit",
  KNOWLEDGE_JSON_DEPTH_LIMIT: "knowledge.errors.jsonDepthLimit",
  KNOWLEDGE_CSV_COLUMN_LIMIT: "knowledge.errors.csvColumnLimit",
  KNOWLEDGE_CSV_ROW_LIMIT: "knowledge.errors.csvRowLimit",
};

/** Worker persists stable ids; product text is selected in the current UI language. */
export function knowledgeErrorText(t: Translator, error: string) {
  const key = Object.hasOwn(KEYS, error) ? KEYS[error] : undefined;
  return key ? t(key) : error;
}
