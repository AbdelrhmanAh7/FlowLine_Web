import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * DNS rebinding / private resolution: even the provider's OWN allowlisted host is refused when it resolves to a
 * private, loopback, link-local (cloud metadata) or unique-local IPv6 address. The check runs inside the socket's
 * DNS lookup (safeFetch), so the address that is checked is the one that would be connected to.
 */
const dns = vi.hoisted(() => ({ answer: [{ address: "127.0.0.1", family: 4 }] as { address: string; family: number }[], asked: [] as string[] }));
vi.mock("node:dns", async (orig) => {
  const real = await orig<typeof import("node:dns")>();
  const lookup = (host: string, opts: unknown, cb: (e: Error | null, a: unknown) => void) => {
    dns.asked.push(host);
    cb(null, (opts as { all?: boolean })?.all ? dns.answer : dns.answer[0]!.address);
  };
  return { ...real, default: { ...real, lookup }, lookup };
});

import { callChat, listModels } from "@/ai/hub/protocols";
import { getProviderDef } from "@/ai/hub/registry";
import { UNKNOWN_CAPABILITIES } from "@/ai/hub/types";

const prev = { ...process.env };
beforeAll(() => {
  process.env.FLOWLINE_ENV = "staging"; // no test double: the real documented host is used
  delete process.env.FLOWLINE_AI_TEST_OVERRIDE;
  process.env.FLOWLINE_EGRESS_ALLOWLIST = "";
});
afterAll(() => {
  Object.assign(process.env, prev);
});

describe("AI transport vs DNS rebinding", () => {
  const def = getProviderDef("openai")!;
  const creds = { apiKey: "sk-test-rebinding-000000", settings: {} };
  for (const [label, address, family] of [
    ["loopback", "127.0.0.1", 4],
    ["cloud metadata (link-local)", "169.254.169.254", 4],
    ["private 10/8", "10.1.2.3", 4],
    ["IPv6 loopback", "::1", 6],
    ["IPv6 unique-local (fd00:ec2::254)", "fd00:ec2::254", 6],
    ["IPv4-mapped IPv6", "::ffff:127.0.0.1", 6],
  ] as const) {
    it(`api.openai.com resolving to ${label} is refused before connecting`, async () => {
      dns.answer = [{ address, family }];
      dns.asked = [];
      await expect(callChat(def, "openai-chat", creds, "gpt-x", { system: "s", messages: [], maxTokens: 5 }, UNKNOWN_CAPABILITIES, AbortSignal.timeout(5_000))).rejects.toMatchObject({ code: "AI_EGRESS_BLOCKED" });
      await expect(listModels(def, creds)).rejects.toMatchObject({ code: "AI_EGRESS_BLOCKED" });
      expect(dns.asked).toContain("api.openai.com");
    });
  }

  it("a mixed answer (one public, one private address) is refused as a whole", async () => {
    dns.answer = [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ];
    await expect(listModels(def, creds)).rejects.toMatchObject({ code: "AI_EGRESS_BLOCKED" });
  });
});
