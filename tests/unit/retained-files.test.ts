import { afterEach, describe, expect, it, vi } from "vitest";
import { retainedFileLimits } from "@/server/retained-files";
import { apiErrorMessage } from "@/i18n/errors";
import { createTranslator } from "@/i18n/translate";
import { ApiError } from "@/lib/api";

afterEach(() => vi.unstubAllEnvs());
describe("retained upload operational limits", () => {
  it("defaults to 100 MiB per workspace and 512 MiB per installation, with explicit byte overrides", () => {
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", undefined);
    vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES", undefined);
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_FILES", undefined);
    vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_FILES", undefined);
    expect(retainedFileLimits()).toEqual({ workspace: 100n * 1024n * 1024n, installation: 512n * 1024n * 1024n, workspaceFiles: 512n, installationFiles: 4096n });
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", "6");
    vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_BYTES", "12");
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_FILES", "2");
    vi.stubEnv("FLOWLINE_UPLOAD_INSTALLATION_MAX_FILES", "4");
    expect(retainedFileLimits()).toEqual({ workspace: 6n, installation: 12n, workspaceFiles: 2n, installationFiles: 4n });
  });

  for (const key of ["FLOWLINE_UPLOAD_WORKSPACE_MAX_FILES", "FLOWLINE_UPLOAD_INSTALLATION_MAX_FILES"]) {
    for (const bad of ["0", "-1", "1.5", "", "unlimited", "9007199254740992"]) it(`fails closed for invalid ${key} (${bad || "empty"})`, () => {
      vi.stubEnv(key, bad);
      expect(() => retainedFileLimits()).toThrow("Upload storage limits need administrator attention");
    });
  }

  for (const bad of ["0", "-1", "1.5", "", "unlimited", "9007199254740992"]) it(`fails closed for an invalid configured limit (${bad || "empty"})`, () => {
    vi.stubEnv("FLOWLINE_UPLOAD_WORKSPACE_MAX_BYTES", bad);
    expect(() => retainedFileLimits()).toThrow("Upload storage limits need administrator attention");
  });

  it("projects storage failures into the current English/Arabic UI language", () => {
    for (const code of ["UPLOAD_WORKSPACE_STORAGE_LIMIT", "UPLOAD_INSTALLATION_STORAGE_LIMIT", "UPLOAD_WORKSPACE_FILE_LIMIT", "UPLOAD_INSTALLATION_FILE_LIMIT", "UPLOAD_STORAGE_CONFIG"]) {
      const error = new ApiError(413, code, "raw server text");
      expect(apiErrorMessage(createTranslator("ar"), error)).toMatch(/[\u0600-\u06ff]/);
      expect(apiErrorMessage(createTranslator("en"), error)).not.toBe("raw server text");
    }
  });
});
