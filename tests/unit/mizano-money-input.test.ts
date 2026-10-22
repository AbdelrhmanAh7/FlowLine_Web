import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moneyInput } from "@/integrations/providers/mizano";
import { getAction } from "@/integrations/registry";

// Comprehensive unit tests verifying all acceptance criteria (AC1-AC4) for moneyInput:
// negative value rejection, valid input normalization to 2-decimal strings, and error containment in ZodError.
describe("mizano moneyInput zod schema", () => {
  it("AC1: safeParse on negative numbers returns { success: false } without throwing raw Error", () => {
    // Regression proof: throwing raw Error in transform escaped safeParse in PR #279
    let res: ReturnType<typeof moneyInput.safeParse>;
    expect(() => {
      res = moneyInput.safeParse(-5);
    }).not.toThrow();
    expect(res!.success).toBe(false);
    if (!res!.success) {
      expect(res!.error).toBeInstanceOf(z.ZodError);
      expect(res!.error.issues[0]?.message).toMatch(/positive decimal/);
    }
  });

  it("AC1: safeParse on negative decimal strings returns { success: false } without throwing", () => {
    let res: ReturnType<typeof moneyInput.safeParse>;
    expect(() => {
      res = moneyInput.safeParse("-5.00");
    }).not.toThrow();
    expect(res!.success).toBe(false);
    if (!res!.success) {
      expect(res!.error).toBeInstanceOf(z.ZodError);
    }
  });

  it("AC1: safeParse on invalid decimal strings and excess precision returns { success: false } without throwing", () => {
    for (const bad of ["abc", "12.345", "", "1.2.3"]) {
      let res: ReturnType<typeof moneyInput.safeParse>;
      expect(() => {
        res = moneyInput.safeParse(bad);
      }).not.toThrow();
      expect(res!.success).toBe(false);
      if (!res!.success) {
        expect(res!.error).toBeInstanceOf(z.ZodError);
      }
    }
    const abcRes = moneyInput.safeParse("abc");
    expect(abcRes.success).toBe(false);
    if (!abcRes.success) {
      expect(abcRes.error.issues[0]?.message).toMatch(/invalid decimal/);
    }
  });

  it("AC1: safeParse on NaN, Infinity, and float precision noise returns { success: false } without throwing", () => {
    for (const bad of [NaN, Infinity, -Infinity, 0.1 + 0.2, 10.1234]) {
      let res: ReturnType<typeof moneyInput.safeParse>;
      expect(() => {
        res = moneyInput.safeParse(bad);
      }).not.toThrow();
      expect(res!.success).toBe(false);
      if (!res!.success) {
        expect(res!.error).toBeInstanceOf(z.ZodError);
      }
    }
    const floatRes = moneyInput.safeParse(0.1 + 0.2);
    expect(floatRes.success).toBe(false);
    if (!floatRes.success) {
      expect(floatRes.error.issues[0]?.message).toMatch(/decimal places/);
    }
  });

  it("AC1: safeParse on non-number, non-string types returns { success: false } without throwing", () => {
    for (const bad of [null, undefined, true, false, {}, [], () => {}]) {
      let res: ReturnType<typeof moneyInput.safeParse>;
      expect(() => {
        res = moneyInput.safeParse(bad);
      }).not.toThrow();
      expect(res!.success).toBe(false);
      if (!res!.success) {
        expect(res!.error).toBeInstanceOf(z.ZodError);
      }
    }
  });

  it("AC2: parse on negative values throws a ZodError, not a plain Error", () => {
    try {
      moneyInput.parse(-5);
      expect.unreachable("expected parse to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(z.ZodError);
      expect(e).not.toBeInstanceOf(TypeError);
    }
  });

  it("AC3: normalizes valid positive numbers and decimal strings to fixed scale 2", () => {
    expect(moneyInput.parse(10)).toBe("10.00");
    expect(moneyInput.parse("10")).toBe("10.00");
    expect(moneyInput.parse(10.5)).toBe("10.50");
    expect(moneyInput.parse("10.5")).toBe("10.50");
    expect(moneyInput.parse("10.50")).toBe("10.50");
    expect(moneyInput.parse(0)).toBe("0.00");
    expect(moneyInput.parse("0")).toBe("0.00");
    expect(moneyInput.parse("0.00")).toBe("0.00");
    expect(moneyInput.parse("١٢.٥")).toBe("12.50");
  });

  it("AC2: mizano.create_draft_quote action input schema uses moneyInput with safeParse", () => {
    const action = getAction("mizano.create_draft_quote")?.action;
    expect(action).toBeDefined();

    // Valid quote with number and string lines
    const valid = action!.input.safeParse({
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Service", qty: 10, unitPrice: 50.5, taxRate: 15 },
        { item: "Product", qty: "2.5", unitPrice: "100.00", taxRate: "0.00" },
      ],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      const data = valid.data as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
      expect(data.lines[0]?.qty).toBe("10.00");
      expect(data.lines[0]?.unitPrice).toBe("50.50");
      expect(data.lines[0]?.taxRate).toBe("15.00");
      expect(data.lines[1]?.qty).toBe("2.50");
      expect(data.lines[1]?.unitPrice).toBe("100.00");
      expect(data.lines[1]?.taxRate).toBe("0.00");
    }

    // Invalid negative qty, unitPrice, and taxRate (numbers and strings) do NOT crash safeParse with raw unhandled error
    const negativeCases = [
      { field: "qty", line: { item: "Service", qty: -5, unitPrice: 50, taxRate: 15 } },
      { field: "qty", line: { item: "Service", qty: "-5.00", unitPrice: 50, taxRate: 15 } },
      { field: "unitPrice", line: { item: "Service", qty: 5, unitPrice: -50, taxRate: 15 } },
      { field: "unitPrice", line: { item: "Service", qty: 5, unitPrice: "-50.00", taxRate: 15 } },
      { field: "taxRate", line: { item: "Service", qty: 5, unitPrice: 50, taxRate: -15 } },
      { field: "taxRate", line: { item: "Service", qty: 5, unitPrice: 50, taxRate: "-15.00" } },
    ];

    for (const testCase of negativeCases) {
      let invalidRes: ReturnType<NonNullable<typeof action>["input"]["safeParse"]>;
      expect(() => {
        invalidRes = action!.input.safeParse({
          customerId: "cust_123",
          currency: "EGP",
          lines: [testCase.line],
        });
      }).not.toThrow();
      expect(invalidRes!.success).toBe(false);
      if (!invalidRes!.success) {
        expect(invalidRes!.error).toBeInstanceOf(z.ZodError);
      }
    }
  });

  it("AC3: mizano.create_draft_quote action input normalizes Arabic-Indic digits across qty, unitPrice, and taxRate", () => {
    const action = getAction("mizano.create_draft_quote")?.action;
    expect(action).toBeDefined();

    const res = action!.input.safeParse({
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        { item: "Service", qty: "١٢.٥", unitPrice: "١٠", taxRate: "١٥.٥٠" },
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const data = res.data as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
      expect(data.lines[0]?.qty).toBe("12.50");
      expect(data.lines[0]?.unitPrice).toBe("10.00");
      expect(data.lines[0]?.taxRate).toBe("15.50");
    }
  });

  // AC4 regression test: demonstrates the previous buggy pattern where raw errors escaped safeParse
  // and confirms the fix (ctx.addIssue + z.NEVER) prevents this issue by containing errors in ZodError.
  it("AC4: proves regression where throwing raw Error in transform escapes safeParse (PR #279 bug)", async () => {
    const { toDecimalString } = await import("@/lib/format");

    // The flawed pattern from PR #279:
    const buggyTransformSchema = z.union([z.number(), z.string()]).transform((val) => {
      const result = toDecimalString(val, 2);
      if (result.startsWith("-")) {
        throw new Error("must be a positive decimal string with up to 2 decimal places");
      }
      return result;
    });

    // 1. On buggy schema: safeParse(-5) throws unhandled Error (escapes safeParse boundary)
    expect(() => buggyTransformSchema.safeParse(-5)).toThrowError(
      "must be a positive decimal string with up to 2 decimal places"
    );

    // 2. On buggy schema: parse(-5) throws raw Error, NOT ZodError
    try {
      buggyTransformSchema.parse(-5);
      expect.unreachable();
    } catch (e) {
      expect(e).not.toBeInstanceOf(z.ZodError);
      expect(e).toBeInstanceOf(Error);
    }

    // 3. On fixed moneyInput: safeParse(-5) DOES NOT throw; returns clean failure object
    const safeResult = moneyInput.safeParse(-5);
    expect(safeResult.success).toBe(false);
    expect(safeResult.error).toBeInstanceOf(z.ZodError);

    // 4. On fixed moneyInput: parse(-5) throws ZodError
    expect(() => moneyInput.parse(-5)).toThrowError(z.ZodError);
  });
});
