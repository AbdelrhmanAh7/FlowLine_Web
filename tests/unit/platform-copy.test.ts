import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { BASE_COPY, EDITABLE_COPY_KEYS, baseCopy, validateCopy } from "@/i18n/copy-validation";
import { publishedCopyOrBase } from "@/i18n/copy-fallback";

describe("platform copy", () => {
  it("keeps draft text out of the base translator and applies published text per locale", () => {
    const base = createTranslator("ar")("meta.description");
    const overridden = createTranslator("ar", { ar: { "meta.description": "وصف منشور" }, en: {} });
    expect(overridden("meta.description")).toBe("وصف منشور");
    expect(createTranslator("ar")("meta.description")).toBe(base);
    expect(createTranslator("en", { ar: { "meta.description": "وصف منشور" } })("meta.description")).not.toBe("وصف منشور");
  });

  it("rejects unknown keys, markup and changed placeholders", () => {
    expect(() => validateCopy("ar", "__proto__.polluted", "x")).toThrow();
    expect(() => validateCopy("ar", "meta.title", "<script>alert(1)</script>")).toThrow();
    expect(() => validateCopy("en", "runs.errorShape.aiAuthFailed", "Wrong {status}")).toThrow();
    expect(() => validateCopy("en", "runs.errorShape.aiAuthFailed", "{provider} returned {status}")).not.toThrow();
    expect(() => validateCopy("en", "meta.keywords", "k".repeat(501))).toThrowError("Enter plain text between 1 and 500 characters");
    expect(() => validateCopy("en", "meta.title", "t".repeat(1201))).toThrowError("Enter plain text between 1 and 1200 characters");
    expect(() => validateCopy("ar", "flows.activity.pausedFlows.zero", "x".repeat(1201))).toThrowError("Enter plain text up to 1200 characters");
  });

  it("lists every plural form, preserves an intentionally empty zero form and uses English fallback", () => {
    expect(EDITABLE_COPY_KEYS.has("flows.activity.pausedFlows.zero")).toBe(true);
    expect(BASE_COPY.ar["flows.activity.pausedFlows.zero"]).toBe("");
    expect(() => validateCopy("ar", "flows.activity.pausedFlows.zero", "")).not.toThrow();
    expect(baseCopy("en", "flows.activity.pausedFlows.zero")).toBe(BASE_COPY.en["flows.activity.pausedFlows.other"]);
    const t = createTranslator("ar", { ar: { "flows.activity.pausedFlows.zero": "لا مسارات متوقفة", "flows.activity.pausedFlows.few": "{count} متوقفة" } });
    expect(t.plural("flows.activity.pausedFlows", 0)).toBe("لا مسارات متوقفة");
    expect(t.plural("flows.activity.pausedFlows", 3)).toContain("3 متوقفة");
    expect(createTranslator("ar").plural("flows.activity.pausedFlows", 0)).toBe("");
  });

  it("keeps public base copy available if the published store fails", async () => {
    let failed = false;
    const overrides = await publishedCopyOrBase(async () => { throw new Error("database unavailable"); }, () => { failed = true; });
    expect(failed).toBe(true);
    expect(createTranslator("en", overrides)("meta.title")).toBe(createTranslator("en")("meta.title"));
  });
});
