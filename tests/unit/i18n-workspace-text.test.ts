import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { agentToolSummary, dataText } from "@/i18n/workspace-text";

const en = createTranslator("en");
const ar = createTranslator("ar");
const ARABIC = /[؀-ۿ]/;

describe("dataText (API values → UI text)", () => {
  it("translates known values and keeps the English raw words", () => {
    expect(dataText(en, "knowledge.statusWord", "ready")).toBe("ready");
    expect(dataText(ar, "knowledge.statusWord", "ready")).toBe("جاهز");
    expect(dataText(en, "integrations.card.status", "expired")).toBe("Expired");
    expect(dataText(ar, "integrations.card.status", "expired")).toMatch(ARABIC);
    expect(dataText(ar, "sideEffect", "non_idempotent")).toMatch(ARABIC);
  });

  it("shows unknown values as-is (or the given fallback) — nothing is hidden", () => {
    expect(dataText(ar, "knowledge.statusWord", "exploded")).toBe("exploded");
    expect(dataText(ar, "integrations.card.status", "weird", "Weird")).toBe("Weird");
    // A value that would walk into a non-leaf key is not a message.
    expect(dataText(ar, "settings", "tabs", "tabs")).toBe("tabs");
  });

  it("interpolates variables", () => {
    expect(dataText(en, "settings.billing", "upTo", "x", { count: 3 })).toBe("up to 3");
  });
});

describe("agentToolSummary", () => {
  const tools = [
    { tool: "knowledge_search", permission: "allow" },
    { tool: "run_workflow", permission: "ask" },
  ];

  it("keeps the original English wording", () => {
    expect(agentToolSummary(en, tools)).toBe("knowledge search (allow), run workflow (ask)");
    expect(agentToolSummary(en, [])).toBe("no tools");
  });

  it("is Arabic with the Arabic list separator", () => {
    const s = agentToolSummary(ar, tools);
    expect(s).toMatch(ARABIC);
    expect(s).toContain("، ");
    expect(s).not.toMatch(/knowledge|allow|ask/);
    expect(agentToolSummary(ar, [])).toBe(ar("agents.noTools"));
  });

  it("falls back to the raw tool and permission for unknown values", () => {
    expect(agentToolSummary(ar, [{ tool: "new_tool", permission: "maybe" }])).toBe("new tool (maybe)");
  });
});
