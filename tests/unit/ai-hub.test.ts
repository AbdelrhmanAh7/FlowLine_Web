import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { aiSecretContext, encryptAiKey, keyHint, loadCredentials, validateApiKey } from "@/ai/hub/credentials";
import { costMicros, maxCostMicros, maxInputTokens, resolvePrice } from "@/ai/hub/pricing";
import { scrubProviderMessage, structuredOutputMode } from "@/ai/hub/protocols/openai-chat";
import { isRouteRef } from "@/ai/hub/routing";
import { pinDefaultRoutes } from "@/ai/hub/selection";
import { UNKNOWN_CAPABILITIES } from "@/ai/hub/types";
import type { schema } from "@/db";
import type { FlowGraph } from "@/engine/types";
import { decryptSecretV2, encryptSecret, encryptSecretV2 } from "@/server/crypto";

beforeAll(() => {
  process.env.FLOWLINE_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});

describe("pricing math", () => {
  const p = { inputPerMTokMicros: 2_000_000, outputPerMTokMicros: 8_000_000, source: "workspace_price_table" as const };

  it("costs non-overlapping tokens: uncached input + cache reads (input price when unpriced) + output incl. reasoning", () => {
    // 1M uncached input = 2.0; 0.5M cache read at input price = 1.0; (0.25M + 0.25M reasoning) output = 4.0
    expect(costMicros(p, { inputTokens: 1_000_000, cacheReadTokens: 500_000, cacheWriteTokens: null, outputTokens: 250_000, reasoningTokens: 250_000 })).toBe(7_000_000);
    expect(costMicros({ ...p, cacheReadPerMTokMicros: 200_000 }, { inputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: null, outputTokens: 0, reasoningTokens: null })).toBe(200_000);
  });

  it("an unknown price is unknown (null), never 0 — for cost and for the defensible max", () => {
    const u = { inputTokens: 10, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: 10, reasoningTokens: null };
    expect(costMicros(null, u)).toBeNull();
    expect(costMicros({ inputPerMTokMicros: 1, source: "catalogue" }, u)).toBeNull();
    expect(maxCostMicros(null, 1000, 100)).toBeNull();
  });

  it("the defensible max assumes every prompt character may be a token pair and every output token is used", () => {
    expect(maxInputTokens(1000)).toBe(516);
    expect(maxCostMicros(p, 1000, 1000)).toBe(Math.ceil((516 * 2_000_000 + 1000 * 8_000_000) / 1_000_000));
    // It always bounds the real cost of any response within maxTokens.
    const real = costMicros(p, { inputTokens: 250, cacheReadTokens: 0, cacheWriteTokens: null, outputTokens: 900, reasoningTokens: 100 })!;
    expect(maxCostMicros(p, 1000, 1000)!).toBeGreaterThanOrEqual(real);
  });

  it("price sources: the workspace's own table first, then the catalogue, else unknown", () => {
    const table = { "ai:openai/m1": { inputPerMTokMicros: 1, outputPerMTokMicros: 2 } };
    expect(resolvePrice(table, "openai", "m1", { inputPerMTokMicros: 9, outputPerMTokMicros: 9 })).toMatchObject({ inputPerMTokMicros: 1, source: "workspace_price_table" });
    expect(resolvePrice({}, "openai", "m2", { inputPerMTokMicros: 9, outputPerMTokMicros: 9 })).toMatchObject({ inputPerMTokMicros: 9, source: "catalogue" });
    expect(resolvePrice({}, "openai", "m2", { inputPerMTokMicros: 9 })).toBeNull(); // half a price is not a price
    expect(resolvePrice({ "ai:openai/*": { inputPerMTokMicros: 3, outputPerMTokMicros: 4 } }, "openai", "any", null)).toMatchObject({ inputPerMTokMicros: 3 });
  });
});

describe("capabilities (tri-state)", () => {
  it("structured output is native only when SUPPORTED; UNKNOWN and UNSUPPORTED are prompted + validated", () => {
    const s = { type: "object" };
    expect(structuredOutputMode({ ...UNKNOWN_CAPABILITIES, structuredOutput: "SUPPORTED" }, s)).toBe("native");
    expect(structuredOutputMode(UNKNOWN_CAPABILITIES, s)).toBe("prompted");
    expect(structuredOutputMode({ ...UNKNOWN_CAPABILITIES, structuredOutput: "UNSUPPORTED" }, s)).toBe("prompted");
    expect(structuredOutputMode(UNKNOWN_CAPABILITIES)).toBe("none");
  });
});

describe("routes", () => {
  it("a route reference is a uuid connection + bounded model id, nothing else", () => {
    expect(isRouteRef({ connectionId: randomUUID(), modelId: "gpt-x" })).toBe(true);
    expect(isRouteRef({ connectionId: "not-a-uuid", modelId: "m" })).toBe(false);
    expect(isRouteRef({ connectionId: randomUUID(), modelId: "" })).toBe(false);
    expect(isRouteRef(null)).toBe(false);
  });

  it("publish pins the default route only on AI steps without their own route or legacy model", () => {
    const def = { connectionId: randomUUID(), modelId: "m" };
    const own = { connectionId: randomUUID(), modelId: "own" };
    const g: FlowGraph = {
      nodes: [
        { id: "a", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "a", config: { instructions: "i", source: "$", maxTokens: 10, model: "" } } },
        { id: "b", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "b", config: { instructions: "i", source: "$", maxTokens: 10, model: "", route: own } } },
        { id: "c", type: "ai.generate", position: { x: 0, y: 0 }, data: { label: "c", config: { instructions: "i", source: "$", maxTokens: 10, model: "old-local" } } },
        { id: "d", type: "transform.json", position: { x: 0, y: 0 }, data: { label: "d", config: { expression: "$" } } },
      ],
      edges: [],
    };
    const pinned = pinDefaultRoutes(g, def);
    const route = (id: string) => (pinned.nodes.find((n) => n.id === id)!.data.config as { route?: unknown }).route;
    expect([route("a"), route("b"), route("c"), route("d")]).toEqual([def, own, undefined, undefined]);
    expect((g.nodes[0]!.data.config as { route?: unknown }).route).toBeUndefined(); // the draft is untouched
    expect(pinDefaultRoutes(g, null)).toBe(g);
  });
});

describe("credentials (v2, bound to the row)", () => {
  const row = (over: Partial<typeof schema.aiConnection.$inferSelect> = {}) =>
    ({ id: randomUUID(), workspaceId: randomUUID(), provider: "openai", label: "c", status: "CONNECTED", settings: {}, secretEnc: null, keyId: null, ...over }) as typeof schema.aiConnection.$inferSelect;

  it("round-trips for its own row", () => {
    const r = row();
    const enc = encryptAiKey("sk-test-abcdefgh1234", r);
    expect(enc.ciphertext.startsWith("v2.")).toBe(true);
    expect(loadCredentials({ ...r, secretEnc: enc.ciphertext, keyId: enc.keyId }).apiKey).toBe("sk-test-abcdefgh1234");
  });

  it("a blob copied to another row, workspace, provider or purpose does not decrypt", () => {
    const r = row();
    const enc = encryptAiKey("sk-test-abcdefgh1234", r);
    const moved = [row({ workspaceId: r.workspaceId }), { ...r, workspaceId: randomUUID() }, { ...r, provider: "anthropic" }];
    for (const other of moved) {
      expect(() => loadCredentials({ ...other, secretEnc: enc.ciphertext, keyId: enc.keyId })).toThrowError(expect.objectContaining({ code: "AI_CREDENTIAL_UNREADABLE" }));
    }
    expect(() => decryptSecretV2(enc.ciphertext, enc.keyId, { ...aiSecretContext(r), purpose: "webhook" })).toThrow();
    expect(() => decryptSecretV2(enc.ciphertext, enc.keyId, { ...aiSecretContext(r), table: "connection" })).toThrow();
  });

  it("v1 (context-free) blobs are refused; malformed / tampered v2 blobs are refused", () => {
    const r = row();
    const v1 = encryptSecret({ apiKey: "sk-test-abcdefgh1234" });
    expect(() => loadCredentials({ ...r, secretEnc: v1.ciphertext, keyId: v1.keyId })).toThrowError(expect.objectContaining({ code: "AI_CREDENTIAL_UNREADABLE" }));
    const ctx = aiSecretContext(r);
    const enc = encryptSecretV2({ apiKey: "k" }, ctx);
    const [v, iv, tag, data] = enc.ciphertext.split(".");
    const flip = (b64: string) => Buffer.from(Buffer.from(b64, "base64").map((x, i) => (i === 0 ? x ^ 1 : x))).toString("base64");
    for (const bad of [`${v}.${iv}.${tag}`, `${v}.${iv}.${tag}.${data}.x`, `v3.${iv}.${tag}.${data}`, `${v}.${iv}.${flip(tag!)}.${data}`, `${v}.${iv}.${tag}.${flip(data!)}`, `${v}.AAAA.${tag}.${data}`, `${v}.${iv}.${tag}.${data}!`, "v2." + "A".repeat(70_000)]) {
      expect(() => decryptSecretV2(bad, enc.keyId, ctx), bad.slice(0, 40)).toThrow();
    }
    expect(() => decryptSecretV2(enc.ciphertext, "unknown-key", ctx)).toThrow();
    expect(() => encryptSecretV2({}, { ...ctx, rowId: "a:b" })).toThrow(); // context fields can't smuggle separators
  });

  it("a revoked connection never yields a key; key hints show only the last 4 characters", () => {
    const r = row({ status: "REVOKED" });
    expect(() => loadCredentials(r)).toThrowError(expect.objectContaining({ code: "AI_CONNECTION_REVOKED" }));
    expect(keyHint("sk-live-1234567890WXYZ")).toBe("••••WXYZ");
    expect(() => validateApiKey("short")).toThrowError(expect.objectContaining({ code: "AI_KEY_INVALID" }));
    expect(() => validateApiKey("sk has spaces in it")).toThrowError(expect.objectContaining({ code: "AI_KEY_INVALID" }));
    expect(validateApiKey("  sk-ok-12345678  ")).toBe("sk-ok-12345678");
  });

  it("provider messages are scrubbed of the key and key-like fragments", () => {
    const key = "sk-proj-SECRETSECRETSECRET123";
    const out = scrubProviderMessage(`Incorrect API key provided: ${key} (also sk-proj-SEC****123)`, key);
    expect(out).not.toContain("SECRET");
    expect(out).not.toContain("SEC****");
  });
});
