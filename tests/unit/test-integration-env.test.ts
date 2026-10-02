import { describe, expect, it } from "vitest";
import { resolveIntegrationBaseEnv } from "../../scripts/test-integration-env.mjs";

const fileEnv = {
  FLOWLINE_ENV: "test",
  DATABASE_URL: "postgres://file-user:file-pass@127.0.0.1:5433/flowline_test_file",
};

describe("integration shard base environment", () => {
  it("uses the shell DATABASE_URL when deriving shard URLs", () => {
    const shellUrl = "postgres://shell-user:shell-pass@127.0.0.1:5434/flowline_test_shell";
    expect(resolveIntegrationBaseEnv(fileEnv, { DATABASE_URL: shellUrl }).DATABASE_URL).toBe(shellUrl);
  });

  it("keeps .env.test as the only fallback and rejects a missing test URL", () => {
    expect(resolveIntegrationBaseEnv(fileEnv, {}).DATABASE_URL).toBe(fileEnv.DATABASE_URL);
    expect(() => resolveIntegrationBaseEnv({ FLOWLINE_ENV: "test" }, {
      FLOWLINE_ENV: "test",
      DATABASE_URL: "postgres://owner:secret@127.0.0.1:5433/flowline",
    })).toThrow(".env.test has no DATABASE_URL");
  });

  it("rejects shell overrides that leave the isolated test environment", () => {
    expect(() => resolveIntegrationBaseEnv(fileEnv, {
      FLOWLINE_ENV: "test",
      DATABASE_URL: "postgres://owner:secret@127.0.0.1:5433/flowline",
    })).toThrow(/must target flowline_test/);
    expect(() => resolveIntegrationBaseEnv(fileEnv, { FLOWLINE_ENV: "development" })).toThrow(/FLOWLINE_ENV must be test/);
  });
});
