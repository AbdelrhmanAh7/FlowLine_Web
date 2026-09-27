import { describe, expect, it } from "vitest";
import { codeSandboxAvailable, runCodeInSandbox } from "@/server/code-sandbox";

/**
 * Code node isolation, verified against the REAL container sandbox (Docker).
 * If Docker isn't available the suite fails loudly rather than skipping —
 * the node must then show as unavailable, which the first test asserts.
 */
describe("code sandbox (docker)", { timeout: 60_000 }, () => {
  it("is available on this machine", async () => {
    const a = await codeSandboxAvailable();
    expect(a.ok, a.reason).toBe(true);
  });

  it("runs code with input and returns JSON", async () => {
    const out = await runCodeInSandbox("return { n: input.items.length, sum: input.items.reduce((a, b) => a + b, 0) };", { items: [1, 2, 3] }, 10_000, new AbortController().signal);
    expect(out).toEqual({ n: 3, sum: 6 });
  });

  it("has no network access", async () => {
    await expect(
      runCodeInSandbox("const r = await fetch('https://example.com'); return r.status;", {}, 10_000, new AbortController().signal),
    ).rejects.toMatchObject({ code: "CODE_ERROR" });
  });

  it("can't see host secrets or environment", async () => {
    process.env.SUPER_SECRET_TEST_VALUE = "do-not-leak";
    const out = (await runCodeInSandbox("return { env: Object.keys(process.env), secret: process.env.SUPER_SECRET_TEST_VALUE ?? null, db: process.env.DATABASE_URL ?? null };", {}, 10_000, new AbortController().signal)) as {
      env: string[];
      secret: string | null;
      db: string | null;
    };
    expect(out.secret).toBeNull();
    expect(out.db).toBeNull();
    expect(out.env.some((k) => /FLOWLINE|DATABASE|AUTH|SECRET/.test(k))).toBe(false);
  });

  it("can't write outside a tiny tmpfs, and runs as nobody", async () => {
    const out = (await runCodeInSandbox(
      "const fs = require('fs'); let root = 'ok'; try { fs.writeFileSync('/pwned', 'x'); root = 'wrote'; } catch (e) { root = e.code; } return { root, uid: process.getuid() };",
      {},
      10_000,
      new AbortController().signal,
    )) as { root: string; uid: number };
    expect(out.root).not.toBe("wrote");
    expect(out.uid).toBe(65534);
  });

  it("kills runaway CPU at the time limit", async () => {
    const t0 = Date.now();
    await expect(runCodeInSandbox("while (true) {}", {}, 1500, new AbortController().signal)).rejects.toMatchObject({ code: "CODE_TIMEOUT" });
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  it("contains memory exhaustion", async () => {
    await expect(runCodeInSandbox("const a = []; for (;;) a.push(new Array(1e6).fill(1));", {}, 20_000, new AbortController().signal)).rejects.toMatchObject({
      code: expect.stringMatching(/CODE_MEMORY|CODE_ERROR|CODE_TIMEOUT/),
    });
  });
});
