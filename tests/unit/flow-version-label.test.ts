import { describe, expect, it } from "vitest";
import { flowVersionLabel, rerunOriginalLabel } from "@/i18n/engine-text";
import { createTranslator } from "@/i18n/translate";

const en = createTranslator("en");
const ar = createTranslator("ar");

/**
 * Only publications are numbered (flow_version.version is NULL for save, overwrite and run snapshots since migration
 * 0025), so the run inspector, its re-run dialog and the history panel name an unnumbered snapshot by its reason instead
 * of "Version —" or "original version (v)".
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

  it("a save or overwrite snapshot is named by its reason", () => {
    expect(flowVersionLabel(en, null, "save")).toBe("Saved snapshot");
    expect(flowVersionLabel(en, null, "overwrite")).toBe("Copy kept before overwrite");
    expect(flowVersionLabel(ar, null, "save")).toBe("لقطة محفوظة");
    expect(flowVersionLabel(ar, null, "overwrite")).toBe("نسخة محفوظة قبل الاستبدال");
    expect(flowVersionLabel(en, 2, "publish")).toBe("Version 2");
  });
});
