import { afterEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import { extractKnowledge, KNOWLEDGE_JSON_MAX_DEPTH, KNOWLEDGE_MAX_CHUNKS } from "@/server/knowledge-extract";

afterEach(() => vi.restoreAllMocks());
describe("bounded knowledge extraction", () => {
  it("stops CSV parsing immediately above the row budget instead of materializing the whole file", async () => {
    const parse = Papa.parse.bind(Papa);
    let steps = 0;
    vi.spyOn(Papa, "parse").mockImplementation(((input: string, config: Papa.ParseConfig) => parse(input, {
      ...config, step: (...args: Parameters<NonNullable<Papa.ParseConfig["step"]>>) => { steps++; config.step!(...args); },
    })) as typeof Papa.parse);
    await expect(extractKnowledge("text/csv", Buffer.from(`name\n${"row\n".repeat(50_000)}`))).rejects.toThrow("too large to index");
    expect(steps).toBe(KNOWLEDGE_MAX_CHUNKS + 1);
  });
  it("accepts the exact row budget and preserves row locators", async () => {
    const result = await extractKnowledge("text/csv", Buffer.from(`name\n${"row\n".repeat(KNOWLEDGE_MAX_CHUNKS)}`));
    expect(result).toHaveLength(KNOWLEDGE_MAX_CHUNKS);
    expect(result.at(-1)).toEqual({ text: "name: row", locator: { row: KNOWLEDGE_MAX_CHUNKS } });
  });
  it("rejects CSV column/row amplification", async () => {
    await expect(extractKnowledge("text/csv", Buffer.from(`${Array.from({ length: 201 }, (_, i) => `c${i}`).join(",")}\n${"v,".repeat(200)}v`))).rejects.toThrow("200 columns");
    await expect(extractKnowledge("text/csv", Buffer.from(`name\n${"x".repeat(4001)}`))).rejects.toThrow("4,000 characters");
  });
  it("refuses excessive JSON nesting before parse/stringify", async () => {
    const input = "[".repeat(KNOWLEDGE_JSON_MAX_DEPTH + 1) + "0" + "]".repeat(KNOWLEDGE_JSON_MAX_DEPTH + 1);
    const parser = vi.spyOn(JSON, "parse");
    await expect(extractKnowledge("application/json", Buffer.from(input))).rejects.toThrow("nesting exceeds");
    expect(parser).not.toHaveBeenCalled();
  });
  it("handles escaped quotes and bracket characters in JSON strings", async () => {
    const value = { text: '[{\\"quoted\\"}]' };
    const result = await extractKnowledge("application/json", Buffer.from(JSON.stringify(value)));
    expect(result).toEqual([{ text: JSON.stringify(value), locator: { item: 1, part: 1 } }]);
  });
  it("checks total chunks across JSON array items and plain text during construction", async () => {
    await expect(extractKnowledge("application/json", Buffer.from(JSON.stringify(Array.from({ length: KNOWLEDGE_MAX_CHUNKS + 1 }, () => "one"))))).rejects.toThrow("too large to index");
    await expect(extractKnowledge("text/plain", Buffer.from("x".repeat(2_000_000)))).rejects.toThrow("too large to index");
    await expect(extractKnowledge("application/json", Buffer.from(JSON.stringify(["x".repeat(1_000_000), "y".repeat(1_000_000)])))).rejects.toThrow("too large to index");
  });
  it("keeps valid text and invalid JSON behavior", async () => {
    expect(await extractKnowledge("text/plain", Buffer.from("Hello"))).toEqual([{ text: "Hello", locator: { part: 1 } }]);
    await expect(extractKnowledge("application/json", Buffer.from("{bad"))).rejects.toThrow("not valid JSON");
  });
});
