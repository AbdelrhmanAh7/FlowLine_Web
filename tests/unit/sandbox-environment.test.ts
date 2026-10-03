import { afterEach, describe, expect, it, vi } from "vitest";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { evaluateIsolated, extractPdfTextIsolated, sandboxEnvironmentKeysForTest, stopSandbox } from "@/engine/sandbox";
import { makePdf } from "../fixtures/pdf";

afterEach(() => { stopSandbox(); vi.unstubAllEnvs(); });

describe("parser child environment", () => {
  it("actual fork excludes credential, PATH, proxy and preload canaries", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "FLOWLINE_ENCRYPTION_KEY", "FLOWLINE_PLATFORM_ENCRYPTION_KEY", "OPENAI_API_KEY", "PATH", "HTTP_PROXY", "HTTPS_PROXY", "NODE_EXTRA_CA_CERTS"]) {
      vi.stubEnv(key, "synthetic-parent-canary");
    }
    // If inherited, this nonexistent preload would prevent the real child from starting.
    vi.stubEnv("NODE_OPTIONS", "--require=flowline-missing-parent-canary-module");
    expect(await sandboxEnvironmentKeysForTest()).toEqual(["FLOWLINE_SANDBOX_TEST_INSPECTION", "NODE_ENV", ...(process.platform === "win32" ? ["SYSTEMROOT"] : [])]);
    expect(await evaluateIsolated('{"n": a * 2}', { a: 21 })).toEqual({ n: 42 });
  });
  it("inspection is unavailable outside test and normal production-mode evaluation remains valid", async () => {
    vi.stubEnv("FLOWLINE_ENV", "beta");
    await expect(sandboxEnvironmentKeysForTest()).rejects.toThrow("test-only");
    expect(await evaluateIsolated("1 + 1", {})).toBe(2);
  });
  it("extracts a valid PDF in the child with no inherited worker environment", async () => {
    vi.stubEnv("FLOWLINE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "synthetic-parent-canary");
    const result = await extractPdfTextIsolated(makePdf(["A bounded parser environment"]).toString("base64"));
    expect(result.pages).toBe(1);
    expect(result.text).toContain("A bounded parser environment");
    expect(await sandboxEnvironmentKeysForTest()).not.toContain("DATABASE_URL");
  });
  it("the real production child never enables the test inspection operation", async () => {
    const child = fork(fileURLToPath(new URL("../../src/engine/sandbox-child.mjs", import.meta.url)), [], { env: { NODE_ENV: "production" }, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
    try {
      const reply = once(child, "message");
      child.send({ id: 1, op: "test_environment_keys", source: "1 + 1", input: null, maxDepth: 100, maxBytes: 1024 });
      expect((await reply)[0]).toEqual({ id: 1, ok: true, json: "2" });
    } finally { child.kill(); }
  });
});
