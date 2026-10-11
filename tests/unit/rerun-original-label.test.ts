import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { rerunOriginalKey } from "@/lib/run-status";

// #117: run snapshots have no public version number; the re-run dialog must not render "(v)".
describe("rerunOriginalKey", () => {
  it("uses the numbered label for a published version and the snapshot label for an unnumbered one", () => {
    expect(rerunOriginalKey(3)).toBe("runs.rerun.original");
    expect(rerunOriginalKey(null)).toBe("runs.rerun.originalSnapshot");
  });

  it.each(["ar", "en"] as const)("%s: the unnumbered label has no version placeholder and no empty (v)", (locale) => {
    const t = createTranslator(locale);
    const text = t(rerunOriginalKey(null), { version: "" });
    expect(text).not.toBe("runs.rerun.originalSnapshot");
    expect(text).not.toMatch(/\{version\}|\(v\)/);
    expect(t(rerunOriginalKey(3), { version: 3 })).toContain("v3");
  });
});
