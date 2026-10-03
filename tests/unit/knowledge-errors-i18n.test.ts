import { describe, expect, it } from "vitest";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";
import { knowledgeErrorText } from "@/i18n/knowledge-errors";
import { apiErrorMessage } from "@/i18n/errors";
import { ApiError } from "@/lib/api";
import { extractKnowledge } from "@/server/knowledge-extract";

describe("resource limit UI messages", () => {
  it("translates stable worker limit codes and body-limit errors in Arabic and English", () => {
    const arabic = createTranslator("ar");
    const english = createTranslator("en");
    for (const code of ["KNOWLEDGE_CHUNK_LIMIT", "KNOWLEDGE_JSON_DEPTH_LIMIT", "KNOWLEDGE_CSV_COLUMN_LIMIT", "KNOWLEDGE_CSV_ROW_LIMIT"]) {
      expect(knowledgeErrorText(arabic, code)).toMatch(/[\u0600-\u06ff]/);
      expect(knowledgeErrorText(english, code)).not.toBe(code);
    }
    const error = new ApiError(413, "BODY_TOO_LARGE", "Request body is too large");
    expect(apiErrorMessage(arabic, error)).toBe(ar.errors.BODY_TOO_LARGE);
    expect(apiErrorMessage(english, error)).toBe(en.errors.BODY_TOO_LARGE);
    expect(knowledgeErrorText(arabic, "legacy diagnostic")).toBe("legacy diagnostic");
  });
  it("emits a stable code from actual limited extraction", async () => {
    await expect(extractKnowledge("application/json", Buffer.from("[".repeat(65) + "0" + "]".repeat(65)))).rejects.toMatchObject({ code: "KNOWLEDGE_JSON_DEPTH_LIMIT" });
  });
});
