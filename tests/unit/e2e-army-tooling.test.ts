// Guards for the e2e-army tooling (#85): the CLI model adapter, the documented commands and the shard tags of the feature suite.
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { getEventListeners } from "node:events";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cliModel } from "../../e2e-army/cli-model.ts";

const root = join(__dirname, "..", "..");

describe("cli-model adapter", () => {
  let dir = "";
  afterEach(() => { vi.unstubAllEnvs(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("parses the whole answer of a CLI whose process exits before its output is complete (reads on 'close', not 'exit')", async () => {
    dir = mkdtempSync(join(tmpdir(), "fake-agy-"));
    // The shell exits at once while a background child still holds stdout and writes the answer 0.3 s later: 'exit' fires with
    // nothing read yet, 'close' fires only when the pipe is closed. 600 KB of text also spans many chunks.
    const answer = JSON.stringify({ text: "x".repeat(600_000), tool_calls: [{ name: "click", arguments: { target: "Sign in" } }] });
    writeFileSync(join(dir, "answer.json"), answer);
    writeFileSync(join(dir, "agy"), `#!/bin/sh\n(sleep 0.3; cat "${join(dir, "answer.json")}") &\nexit 0\n`);
    chmodSync(join(dir, "agy"), 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH}`);
    const model = cliModel({ cli: "agy", timeoutMs: 20_000 });
    const res = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      tools: [{ type: "function", name: "click", description: "click", inputSchema: { type: "object" } }],
      toolChoice: { type: "required" },
    });
    const calls = res.content.filter((c: { type: string }) => c.type === "tool-call");
    expect(calls).toHaveLength(1);
    expect(calls[0].toolName).toBe("click");
    expect(JSON.parse(calls[0].input)).toEqual({ target: "Sign in" });
  });

  it("retries a required tool call when the first answer names only tools that do not exist", async () => {
    dir = mkdtempSync(join(tmpdir(), "fake-agy-"));
    // First answer calls a hallucinated tool (non-empty tool_calls, but nothing usable); the second one is valid.
    writeFileSync(join(dir, "first.json"), JSON.stringify({ text: "", tool_calls: [{ name: "teleport", arguments: {} }] }));
    writeFileSync(join(dir, "second.json"), JSON.stringify({ text: "", tool_calls: [{ name: "click", arguments: { target: "Go" } }] }));
    writeFileSync(join(dir, "agy"), `#!/bin/sh\necho x >> "${join(dir, "calls")}"\nif [ "$(wc -l < "${join(dir, "calls")}")" -le 1 ]; then cat "${join(dir, "first.json")}"; else cat "${join(dir, "second.json")}"; fi\n`);
    chmodSync(join(dir, "agy"), 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH}`);
    const res = await cliModel({ cli: "agy", timeoutMs: 20_000 }).doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      tools: [{ type: "function", name: "click", description: "click", inputSchema: { type: "object" } }],
      toolChoice: { type: "required" },
    });
    expect(readFileSync(join(dir, "calls"), "utf8").trim().split("\n")).toHaveLength(2);
    const calls = res.content.filter((c: { type: string }) => c.type === "tool-call");
    expect(calls.map((c: { toolName: string }) => c.toolName)).toEqual(["click"]);
    expect(res.finishReason.unified).toBe("tool-calls");
  });

  const fakeAgy = (body: string) => {
    dir = mkdtempSync(join(tmpdir(), "fake-agy-"));
    writeFileSync(join(dir, "agy"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(dir, "args")}"\n${body}\n`);
    chmodSync(join(dir, "agy"), 0o755);
    vi.stubEnv("PATH", `${dir}:${process.env.PATH}`);
  };
  const call = (signal?: AbortSignal, timeoutMs = 20_000) => cliModel({ cli: "agy", timeoutMs }).doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "go" }] }],
    tools: [{ type: "function", name: "click", description: "click", inputSchema: { type: "object" } }],
    toolChoice: { type: "required" },
    abortSignal: signal,
  });

  it("refuses an already-aborted signal without starting the CLI", async () => {
    fakeAgy(`echo '{"text":"","tool_calls":[{"name":"click","arguments":{}}]}'`);
    const ac = new AbortController();
    ac.abort();
    await expect(call(ac.signal)).rejects.toThrow("aborted");
    expect(readdirSync(dir)).not.toContain("args");
  });

  it("leaves no abort listener behind, also after the retry that reuses the signal", async () => {
    fakeAgy(`echo x >> "$(dirname "$0")/calls"\nif [ "$(wc -l < "$(dirname "$0")/calls")" -le 1 ]; then echo '{"text":"","tool_calls":[]}'; else echo '{"text":"","tool_calls":[{"name":"click","arguments":{}}]}'; fi`);
    const ac = new AbortController();
    await call(ac.signal);
    expect(readFileSync(join(dir, "calls"), "utf8").trim().split("\n")).toHaveLength(2);
    expect(getEventListeners(ac.signal, "abort")).toHaveLength(0);
  });

  it("gives agy a --print-timeout below the adapter's own kill timeout, so agy reports first", async () => {
    fakeAgy(`echo '{"text":"","tool_calls":[{"name":"click","arguments":{}}]}'`);
    await call(undefined, 20_000);
    const args = readFileSync(join(dir, "args"), "utf8").split("\n");
    expect(args[args.indexOf("--print-timeout") + 1]).toBe("10s");
  });
});

describe("e2e-army hosts", () => {
  it("the browser origin (e2e.config.ts) and the API origin (apiBase) come from one appUrl(), so cookies set in one reach the other", async () => {
    const config = readFileSync(join(root, "e2e.config.ts"), "utf8");
    expect(config).toMatch(/import \{ appUrl \} from "\.\/e2e-army\/lib"/);
    expect(config).toMatch(/const url = appUrl\(\);/);
    expect(config).not.toMatch(/https?:\/\/(localhost|127\.0\.0\.1)/);
    const { apiBase, appUrl } = await import("../../e2e-army/lib.ts");
    for (const url of ["", "http://127.0.0.1:3100", "http://localhost:3200/"]) {
      vi.stubEnv("E2E_ARMY_URL", url);
      vi.stubEnv("E2E_ARMY_API", "");
      expect(new URL(apiBase()).host).toBe(new URL(appUrl()).host);
    }
    vi.stubEnv("E2E_ARMY_URL", "");
    expect(appUrl()).toBe("http://localhost:3100");
    // The default must also be the stack's own origin (BETTER_AUTH_URL / FLOWLINE_PUBLIC_URL), or the app sets cookies for another host.
    const { testStack } = await import("../../scripts/test-stack.cjs");
    expect(appUrl()).toBe(testStack({ NODE_ENV: "test" }).baseUrl);
    vi.unstubAllEnvs();
  });
});

describe("e2e-army docs and suite", () => {
  it("documented e2e:army commands carry no angle-bracket placeholder (a shell reads <x> as a redirection)", () => {
    for (const file of ["README.md", "AGENTS.md", "docs/DEVELOPER_GUIDE.md", "scripts/e2e-army.mjs"]) {
      const bad = readFileSync(join(root, file), "utf8").split("\n").filter((l) => /e2e:army[^`\n]*--shard-id\s+<|--shard-id\s+<[^>]*>/.test(l));
      expect(bad, file).toEqual([]);
    }
  });

  it("README and DEVELOPER_GUIDE state the hub's real cap (up to 8 top-level e2e-army/*.e2e.ts files), and the repo stays within it", () => {
    // The hub's verify job copies readdirSync(e2e-army).filter(/^[\w.-]+\.e2e\.ts$/).slice(0, 8) (nql-agents src/lib/e2earmy.ts).
    for (const file of ["README.md", "docs/DEVELOPER_GUIDE.md"]) {
      const text = readFileSync(join(root, file), "utf8").replace(/\s+/g, " ");
      expect(text, file).toMatch(/up to 8 top-level `e2e-army\/\*\.e2e\.ts` files/);
      expect(text, file).not.toMatch(/every `e2e-army\/\*\.e2e\.ts`/);
    }
    const top = readdirSync(join(root, "e2e-army")).filter((n) => /^[\w.-]+\.e2e\.ts$/.test(n));
    expect(top.length).toBeLessThanOrEqual(8);
  });

  it("every feature test carries feat:/shard:/lvl: tags and its shard tag matches its file", () => {
    const own: Record<string, string[]> = { "ui-auth": ["ui-auth", "ui-auth2"], "ui-misc": ["ui-misc", "ui-auth2"] };
    const dirName = join(root, "e2e-army", "features");
    for (const f of readdirSync(dirName).filter((n) => n.endsWith(".e2e.ts") && !n.startsWith("_"))) {
      const shard = f.replace(".e2e.ts", "");
      const src = readFileSync(join(dirName, f), "utf8");
      const tests = src.match(/^test\("\[[a-z0-9-]+\.\d+\][^\n]*/gm) ?? [];
      expect(tests.length, f).toBeGreaterThan(0);
      for (const t of tests) {
        expect(t, t).toMatch(/tags: \["feat:[a-z0-9-]+", "shard:[a-z0-9-]+", "lvl:(ui|api|job)"\]/);
        const tagged = /"shard:([a-z0-9-]+)"/.exec(t)![1]!;
        expect(own[shard] ?? [shard], `${f}: ${t.slice(0, 40)}`).toContain(tagged);
      }
    }
  });
});

describe("e2e-army hygiene (#85)", () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
  const suite = files(join(root, "e2e-army")).filter((f) => !f.endsWith("cli-model.ts"));

  it("no test or helper waits with a fixed delay (conditions are polled with expect.poll)", () => {
    for (const f of suite) expect(readFileSync(f, "utf8"), f).not.toMatch(/setTimeout|waitForTimeout/);
  });

  it("lint is not switched off for e2e-army and `any` appears only behind a scoped disable", () => {
    expect(readFileSync(join(root, "eslint.config.mjs"), "utf8")).not.toMatch(/e2e-army/);
    for (const f of [...suite, join(root, "e2e-army", "cli-model.ts")]) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (/(:|=|as|<)\s*any\b(?!\s+(terminal|[a-z]+ of))/.test(l.replace(/\/\/.*$/, "").replace(/"[^"]*"|`[^`]*`/g, ""))) {
          expect(lines[i - 1], `${f}:${i + 1}`).toMatch(/eslint-disable-next-line @typescript-eslint\/no-explicit-any/);
        }
      });
    }
  });
});
