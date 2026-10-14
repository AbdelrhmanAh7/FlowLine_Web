import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { gitHead, readProvenance, writeProvenance } from "../../scripts/demo/provenance";
import { ROOT } from "../../scripts/demo/paths";
import { escapeRegExp } from "../../scripts/demo/scenarios/common";

// The real spawnSync, captured before the file-wide mock replaces it (used by the last test).
const h = vi.hoisted(() => ({ mock: vi.fn(), real: null as typeof spawnSync | null }));
vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  h.real = orig.spawnSync;
  h.mock.mockImplementation(orig.spawnSync);
  return { ...orig, spawnSync: h.mock };
});

const spawn = (r: Partial<{ error: Error; status: number | null; stdout: string | null; stderr: string | null; signal: NodeJS.Signals | null }>) =>
  h.mock.mockReturnValue({ pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null, ...r } as never);

describe("recording provenance", () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-prov-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it("round-trips the commit a clip was recorded from", () => {
    writeProvenance(dir, "d211653");
    expect(readProvenance(dir)).toBe("d211653");
  });
  it("refuses a recording without provenance instead of stamping the current HEAD", () => {
    const empty = mkdtempSync(join(tmpdir(), "demo-prov-"));
    expect(() => readProvenance(empty)).toThrow(/re-record/);
    writeFileSync(join(empty, "provenance.json"), "{}");
    expect(() => readProvenance(empty)).toThrow(/no uiCommit/);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("gitHead()", () => {
  it("returns the trimmed SHA on success", () => {
    spawn({ status: 0, stdout: "d211653abc\n" });
    expect(gitHead(ROOT)).toBe("d211653abc");
  });
  it("throws with the OS error when git cannot start (no uncaught TypeError on .stdout)", () => {
    spawn({ error: new Error("spawn git ENOENT"), status: null, stdout: null, stderr: null });
    expect(() => gitHead(ROOT)).toThrow(/could not run.*ENOENT/);
  });
  it("throws with the exit code and stderr when git fails", () => {
    spawn({ status: 128, stdout: "", stderr: "fatal: not a git repository" });
    expect(() => gitHead(ROOT)).toThrow(/exit 128.*not a git repository/);
  });
  it("throws when git exits 0 but prints nothing (empty stdout must never become an empty SHA)", () => {
    spawn({ status: 0, stdout: "  \n" });
    expect(() => gitHead(ROOT)).toThrow(/printed nothing/);
  });
  it("returns the real HEAD SHA of this checkout", () => {
    h.mock.mockImplementation(h.real!);
    expect(gitHead(ROOT)).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("escapeRegExp", () => {
  it("makes translated text with regex metacharacters match literally", () => {
    const text = "Open run (inspector)? v1.0+";
    expect(new RegExp(escapeRegExp(text)).test(text)).toBe(true);
    expect(new RegExp(escapeRegExp(text)).test("Open run inspector v1x0")).toBe(false);
    expect(new RegExp(`${escapeRegExp("a|b")}`).test("a")).toBe(false);
  });
});
