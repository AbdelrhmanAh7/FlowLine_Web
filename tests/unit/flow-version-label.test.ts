import { describe, expect, it } from "vitest";
import { flowVersionLabel, rerunOriginalLabel } from "@/i18n/engine-text";
import { createTranslator } from "@/i18n/translate";

const en = createTranslator("en");
const ar = createTranslator("ar");

/**
 * A run snapshot has no publication number (flow_version.version is NULL since migration 0025), so the run inspector,
 * its re-run dialog and the history panel label it as a snapshot instead of "Version —" or "original version (v)".
 */
describe("flow version labels (regression: #204)", () => {
  it("a numbered version keeps its number", () => {
    expect(flowVersionLabel(en, 3)).toBe("Version 3");
    expect(rerunOriginalLabel(en, 3)).toBe("The run's original version (v3)");
    expect(flowVersionLabel(ar, 3)).toBe(ar("common.version", { version: 3 }));
  });

  it("a run snapshot is named as one, never with an empty or placeholder number", () => {
    for (const t of [en, ar]) {
      for (const label of [flowVersionLabel(t, null), rerunOriginalLabel(t, null)]) {
        expect(label).not.toMatch(/\(v\)|—|\{version\}|null|undefined/);
      }
    }
    expect(flowVersionLabel(en, null)).toBe("Run snapshot");
    expect(rerunOriginalLabel(en, null)).toBe("The run's original snapshot");
    expect(flowVersionLabel(ar, null)).toBe("لقطة التشغيل");
    expect(rerunOriginalLabel(ar, null)).toBe("اللقطة الأصلية للتشغيل");
  });
});
