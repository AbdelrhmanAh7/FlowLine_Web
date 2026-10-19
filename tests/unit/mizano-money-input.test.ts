import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moneyInput } from "@/integrations/providers/mizano";
import { getAction } from "@/integrations/registry";

describe("mizano moneyInput zod schema", () => {
  it("AC1 & AC2: safeParse on negative numbers returns { success: false } without throwing raw Error", () => {
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

  it("AC1 & AC2: safeParse on negative decimal strings returns { success: false } without throwing", () => {
    let res: ReturnType<typeof moneyInput.safeParse>;
    expect(() => {
      res = moneyInput.safeParse("-5.00");
    }).not.toThrow();
    expect(res!.success).toBe(false);
    if (!res!.success) {
      expect(res!.error).toBeInstanceOf(z.ZodError);
    }
  });

  it("AC1 & AC2: safeParse on invalid decimal strings and excess precision returns { success: false } without throwing", () => {
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
  });

  it("AC1 & AC2: safeParse on NaN, Infinity, and float precision noise returns { success: false } without throwing", () => {
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

    // Invalid negative qty does NOT crash safeParse with raw unhandled error
    let invalidRes: ReturnType<NonNullable<typeof action>["input"]["safeParse"]>;
    expect(() => {
      invalidRes = action!.input.safeParse({
        customerId: "cust_123",
        currency: "EGP",
        lines: [
          { item: "Service", qty: -5, unitPrice: 50, taxRate: 15 },
        ],
      });
    }).not.toThrow();
    expect(invalidRes!.success).toBe(false);
  });

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
