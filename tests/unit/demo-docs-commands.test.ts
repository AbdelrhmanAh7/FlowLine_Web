import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Commands in the demo docs must be copy-pasteable: a POSIX shell reads `<clip>` as input redirection,
// `…` is not a real argument and a machine-specific absolute path only works on one machine.
const DOCS = ["docs/landing/DEMO_MEDIA.md", "docs/DEVELOPER_GUIDE.md"];

const commandSpans = (md: string): string[] => [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!).filter((c) => /^\s*(pnpm\s+demo:|…)/.test(c));

describe.each(DOCS)("%s", (file) => {
  const md = readFileSync(file, "utf8");
  it("has no placeholder, ellipsis or redirection characters inside a `pnpm demo:*` command", () => {
    const bad = commandSpans(md).filter((c) => /[<>…]/.test(c) || /\.\.\./.test(c));
    expect(bad).toEqual([]);
  });
  it.runIf(file.endsWith("DEMO_MEDIA.md"))("has no <placeholder> in any code span (paths included), so every span can be pasted", () => {
    expect([...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!).filter((c) => /[<>]/.test(c))).toEqual([]);
  });
  it("has no machine-specific absolute paths in a command", () => {
    expect(md.match(/`[^`\n]*\/Users\/[^`\n]*`/g) ?? []).toEqual([]);
  });
});

describe("the checker", () => {
  it("flags the shapes that broke copy-paste", () => {
    expect(commandSpans("run `pnpm demo:build --only <clip>` now")).toEqual(["pnpm demo:build --only <clip>"]);
    expect(commandSpans("then `… --skip-record`")).toEqual(["… --skip-record"]);
  });
});

describe("docs state facts that exist", () => {
  const md = readFileSync("docs/landing/DEMO_MEDIA.md", "utf8");
  it("names only hashed media files that are committed (or marks none as an example)", () => {
    const shipped = new Set(readdirSync("public/media/demo"));
    const named = [...md.matchAll(/`([a-z]+\.[a-z]{2}\.[a-z]+\.[a-z0-9]+\.[0-9a-f]{8}\.(?:mp4|jpg))`/g)].map((m) => m[1]!);
    expect(named.filter((f) => !shipped.has(f))).toEqual([]);
  });
  it("has each heading once (no appended duplicate sections)", () => {
    const h = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.split(":")[0]);
    expect(h.filter((t, i) => h.indexOf(t) !== i)).toEqual([]);
  });
  it("EVIDENCE.md states the real number of demo unit-test files", () => {
    const n = readdirSync("tests/unit").filter((f) => /^demo-.*\.test\.ts$/.test(f)).length;
    const ev = readFileSync("artifacts/issue-99/EVIDENCE.md", "utf8");
    expect([...ev.matchAll(/\b(\d+) files\b[^|\n]*?\btests?\b|\b(\d+) files, \d+ passed/g)].map((m) => Number(m[1] ?? m[2]))).toContain(n);
    expect(ev).not.toMatch(/\b7 files, 59/);
  });
});
