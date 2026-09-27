import { afterEach, describe, expect, it } from "vitest";
import { resolveBase } from "@/integrations/http";
import { provider } from "./helpers";

const ENV_KEYS = ["FLOWLINE_ENV", "FLOWLINE_PROVIDER_OVERRIDE"] as const;
const saved: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveBase", () => {
  it("redirects to the fake only in the test environment with an override", () => {
    process.env.FLOWLINE_ENV = "test";
    process.env.FLOWLINE_PROVIDER_OVERRIDE = "http://127.0.0.1:4010";
    expect(resolveBase(provider("slack"))).toBe("http://127.0.0.1:4010/slack");
    // Even an explicit per-request baseUrl is redirected in test env.
    expect(resolveBase(provider("zendesk"), "https://acme.zendesk.com")).toBe("http://127.0.0.1:4010/zendesk");
  });

  it("uses the real apiBase when not in the test environment, ignoring the override env", () => {
    delete process.env.FLOWLINE_ENV;
    process.env.FLOWLINE_PROVIDER_OVERRIDE = "http://127.0.0.1:4010";
    expect(resolveBase(provider("slack"))).toBe("https://slack.com/api");
    expect(resolveBase(provider("google_sheets"))).toBe("https://sheets.googleapis.com");
    expect(resolveBase(provider("stripe"))).toBe("https://api.stripe.com");
  });

  it("honours an explicit baseUrl override outside the test environment", () => {
    delete process.env.FLOWLINE_ENV;
    delete process.env.FLOWLINE_PROVIDER_OVERRIDE;
    expect(resolveBase(provider("zendesk"), "https://acme.zendesk.com/")).toBe("https://acme.zendesk.com");
  });
});
