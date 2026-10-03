import { afterEach, describe, expect, it, vi } from "vitest";
import { knowledgeQueueLimits } from "@/server/knowledge-admission";
import { apiErrorMessage } from "@/i18n/errors";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

afterEach(() => vi.unstubAllEnvs());
describe("knowledge indexing operational admission", () => {
  it("defaults to 16 workspace / 64 installation queued sources and accepts positive overrides", () => {
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", undefined);
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_QUEUED", undefined);
    expect(knowledgeQueueLimits()).toEqual({ workspace: 16n, installation: 64n });
    vi.stubEnv("FLOWLINE_KNOWLEDGE_WORKSPACE_MAX_QUEUED", "1");
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_QUEUED", "2");
    expect(knowledgeQueueLimits()).toEqual({ workspace: 1n, installation: 2n });
  });
  for (const bad of ["0", "-1", "1.5", "", "unlimited", "9007199254740992"]) it(`fails closed for invalid configuration (${bad || "empty"})`, () => {
    vi.stubEnv("FLOWLINE_KNOWLEDGE_INSTALLATION_MAX_QUEUED", bad);
    expect(() => knowledgeQueueLimits()).toThrow("Knowledge indexing limits need administrator attention");
  });
  it("projects all admission errors into EN/AR UI text", () => {
    for (const code of ["KNOWLEDGE_WORKSPACE_QUEUE_LIMIT", "KNOWLEDGE_INSTALLATION_QUEUE_LIMIT", "KNOWLEDGE_QUEUE_CONFIG"]) {
      const error = new ApiError(429, code, "raw server text");
      expect(apiErrorMessage(createTranslator("ar"), error)).toMatch(/[\u0600-\u06ff]/);
      expect(apiErrorMessage(createTranslator("en"), error)).not.toBe("raw server text");
    }
  });
});
