import { describe, expect, it } from "vitest";
import { badToolArgs, mapInBandError, parseArgs, streamJson } from "@/ai/hub/protocols/shared";
import { getProviderDef } from "@/ai/hub/registry";
import { HubError } from "@/ai/hub/types";

const def = getProviderDef("openai")!;

describe("ai hub shared protocols helpers (issue #226)", () => {
  describe("badToolArgs", () => {
    it("returns an AI_BAD_RESPONSE HubError with possibleCharge: true", () => {
      const err = badToolArgs(def);
      expect(err).toBeInstanceOf(HubError);
      expect(err.code).toBe("AI_BAD_RESPONSE");
      expect(err.retryable).toBe(true);
      expect(err.possibleCharge).toBe(true);
      expect(err.message).toContain(def.name);
    });
  });

  describe("parseArgs", () => {
    it("parses valid JSON string arguments into an object", () => {
      expect(parseArgs(def, '{"query": "hello"}')).toEqual({ query: "hello" });
    });

    it("accepts an object directly", () => {
      expect(parseArgs(def, { key: "value" })).toEqual({ key: "value" });
    });

    it("returns empty object for empty or whitespace-only string", () => {
      expect(parseArgs(def, "")).toEqual({});
      expect(parseArgs(def, "   ")).toEqual({});
    });

    it("throws AI_BAD_RESPONSE for malformed JSON string", () => {
      try {
        parseArgs(def, "Error: Invalid input");
        expect.unreachable("expected parseArgs to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(HubError);
        expect((e as HubError).code).toBe("AI_BAD_RESPONSE");
        expect((e as HubError).retryable).toBe(true);
        expect((e as HubError).possibleCharge).toBe(true);
        expect((e as HubError).message).toContain("arguments aren't valid JSON");
      }
    });

    it("throws AI_BAD_RESPONSE for non-object JSON values (arrays, primitives, null)", () => {
      for (const invalid of ["[1, 2]", "123", "true", "null", null, undefined, 42, []]) {
        expect(() => parseArgs(def, invalid)).toThrowError(HubError);
        try {
          parseArgs(def, invalid);
        } catch (e) {
          expect((e as HubError).code).toBe("AI_BAD_RESPONSE");
          expect((e as HubError).possibleCharge).toBe(true);
        }
      }
    });
  });

  describe("streamJson", () => {
    it("returns null for empty or whitespace-only data", () => {
      expect(streamJson(def, "")).toBeNull();
      expect(streamJson(def, "  ")).toBeNull();
    });

    it("parses valid JSON object chunks", () => {
      expect(streamJson(def, '{"chunk": 1}')).toEqual({ chunk: 1 });
    });

    it("throws AI_BAD_RESPONSE with possibleCharge: true for malformed stream chunk", () => {
      expect(() => streamJson(def, "{not valid json}")).toThrowError(HubError);
      try {
        streamJson(def, "{not valid json}");
      } catch (e) {
        expect((e as HubError).code).toBe("AI_BAD_RESPONSE");
        expect((e as HubError).retryable).toBe(true);
        expect((e as HubError).possibleCharge).toBe(true);
      }
    });
  });

  describe("mapInBandError", () => {
    it("maps overloaded_error to AI_OVERLOADED with possibleCharge: true", () => {
      const err = mapInBandError(def, "gpt-4o", { error: { type: "overloaded_error", message: "Server overloaded" } });
      expect(err).toBeInstanceOf(HubError);
      expect(err.code).toBe("AI_OVERLOADED");
      expect(err.possibleCharge).toBe(true);
      expect(err.retryable).toBe(true);
    });

    it("maps numeric error codes in 400-599 range to their corresponding HubError", () => {
      const quotaErr = mapInBandError(def, "gpt-4o", { error: { code: 402, message: "payment required" } });
      expect(quotaErr.code).toBe("AI_QUOTA_EXCEEDED");
      expect(quotaErr.possibleCharge).toBe(true);

      const rateLimitErr = mapInBandError(def, "gpt-4o", { error: { code: 429, message: "rate limit" } });
      expect(rateLimitErr.code).toBe("AI_RATE_LIMITED");
      expect(rateLimitErr.possibleCharge).toBe(true);

      const authErr = mapInBandError(def, "gpt-4o", { error: { code: 401, message: "unauthorized" } });
      expect(authErr.code).toBe("AI_AUTH_FAILED");
      expect(authErr.possibleCharge).toBe(true);
    });

    it("maps unspecified in-band errors defaulting to status 502 (AI_PROVIDER_ERROR)", () => {
      const err = mapInBandError(def, "gpt-4o", { error: { message: "Internal error" } });
      expect(err.code).toBe("AI_PROVIDER_ERROR");
      expect(err.possibleCharge).toBe(true);
    });

    it("handles non-object bodies (null, string, numbers) gracefully defaulting to 502", () => {
      for (const body of [null, undefined, 0, 1, "raw error string"]) {
        const err = mapInBandError(def, "gpt-4o", body);
        expect(err).toBeInstanceOf(HubError);
        expect(err.code).toBe("AI_PROVIDER_ERROR");
        expect(err.possibleCharge).toBe(true);
      }
    });
  });
});
