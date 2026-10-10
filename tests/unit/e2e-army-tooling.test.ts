// Guards for the e2e-army tooling (#85): the CLI model adapter, the documented commands and the shard tags of the feature suite.
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
});

describe("e2e-army docs and suite", () => {
  it("documented e2e:army commands carry no angle-bracket placeholder (a shell reads <x> as a redirection)", () => {
    for (const file of ["README.md", "AGENTS.md", "docs/DEVELOPER_GUIDE.md", "scripts/e2e-army.mjs"]) {
      const bad = readFileSync(join(root, file), "utf8").split("\n").filter((l) => /e2e:army[^`\n]*--shard-id\s+<|--shard-id\s+<[^>]*>/.test(l));
      expect(bad, file).toEqual([]);
    }
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
