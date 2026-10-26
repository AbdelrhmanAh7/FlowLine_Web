import { describe, expect, it } from "vitest";
import { getAction } from "@/integrations/registry";
import { decimalString } from "@/integrations/providers/mizano";

describe("mizano input validation (issue #292 / AC2)", () => {
  it("decimalString schema accepts non-negative decimal strings with up to 2 decimal places", () => {
    expect(decimalString.safeParse("10").success).toBe(true);
    expect(decimalString.safeParse("10.5").success).toBe(true);
    expect(decimalString.safeParse("10.50").success).toBe(true);
    expect(decimalString.safeParse("0").success).toBe(true);
    expect(decimalString.safeParse("0.00").success).toBe(true);
    expect(decimalString.safeParse("500.25").success).toBe(true);
  });

  it.each([
    ["1.005", "more than 2 decimals"],
    [0.001, "number with >2 decimals / non-string"],
    ["abc", "non-numeric string"],
    [" 5 ", "whitespace-padded string"],
    ["1e3", "scientific notation"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
    [Number.NEGATIVE_INFINITY, "-Infinity"],
    ["-5", "negative decimal string"],
    [-5, "negative number"],
  ])("decimalString rejects %j (%s) without rounding", (bad, _desc) => {
    const res = decimalString.safeParse(bad);
    expect(res.success).toBe(false);
  });

  it("mizano.create_draft_quote action input rejects bad money and quantity inputs for qty, unitPrice, and taxRate", () => {
    const action = getAction("mizano.create_draft_quote")?.action;
    expect(action).toBeDefined();

    const badInputs = ["1.005", 0.001, "abc", " 5 ", "1e3", Number.NaN, Number.POSITIVE_INFINITY];

    for (const bad of badInputs) {
      for (const field of ["qty", "unitPrice", "taxRate"] as const) {
        const line = {
          item: "Consulting",
          qty: "1",
          unitPrice: "100.00",
          taxRate: "15.00",
          [field]: bad,
        };
        const res = action!.input.safeParse({
          customerId: "cust_123",
          currency: "EGP",
          lines: [line],
        });
        expect(res.success, `Expected failure for field "${field}" with value ${String(bad)}`).toBe(false);
      }
    }
  });

  it("mizano.create_draft_quote action input accepts well-formed decimal strings", () => {
    const action = getAction("mizano.create_draft_quote")?.action;
    expect(action).toBeDefined();

    const res = action!.input.safeParse({
      customerId: "cust_123",
      currency: "EGP",
      lines: [
        {
          item: "Consulting",
          qty: "10.5",
          unitPrice: "500.50",
          taxRate: "15.75",
        },
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      const data = res.data as { lines: Array<{ qty: string; unitPrice: string; taxRate: string }> };
      expect(data.lines[0].qty).toBe("10.5");
      expect(data.lines[0].unitPrice).toBe("500.50");
      expect(data.lines[0].taxRate).toBe("15.75");
    }
  });
});
