import { afterEach, describe, expect, it, vi } from "vitest";
import { knowledgeChunkLimits } from "@/server/knowledge-storage";
import { knowledgeErrorText } from "@/i18n/knowledge-errors";
import { createTranslator } from "@/i18n/translate";
afterEach(() => vi.unstubAllEnvs());
describe("knowledge chunk operational storage limits", () => {
  it("defaults to 128 MiB workspace / 512 MiB installation and supports positive overrides", () => {
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_CHUNK_BYTES", undefined);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", undefined);
    expect(knowledgeChunkLimits()).toEqual({ workspace: 128n * 1024n * 1024n, installation: 512n * 1024n * 1024n });
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_CHUNK_BYTES", "5");
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", "6");
    expect(knowledgeChunkLimits()).toEqual({ workspace: 5n, installation: 6n });
  });
  for (const bad of ["0", "-1", "1.5", "", "unlimited", "9007199254740992"]) it(`rejects invalid limit (${bad || "empty"})`, () => {
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_CHUNK_BYTES", bad);
    expect(() => knowledgeChunkLimits()).toThrow("KNOWLEDGE_CHUNK_STORAGE_CONFIG");
  });
  it("translates all persisted storage failure codes EN/AR", () => {
    for (const code of ["KNOWLEDGE_WORKSPACE_CHUNK_STORAGE_LIMIT", "KNOWLEDGE_INSTALLATION_CHUNK_STORAGE_LIMIT", "KNOWLEDGE_CHUNK_STORAGE_CONFIG"]) {
      expect(knowledgeErrorText(createTranslator("ar"), code)).toMatch(/[\u0600-\u06ff]/);
      expect(knowledgeErrorText(createTranslator("en"), code)).not.toBe(code);
    }
  });
});
