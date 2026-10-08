import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { startFakeProviders } from "../../e2e/fakes/provider-server";

/** Issue #63: the fake servers' test-control endpoints validate their input instead of echoing errors or sleeping unbounded. */
let providers: Awaited<ReturnType<typeof startFakeProviders>>;
let ai: Awaited<ReturnType<typeof startFakeAi>>;
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  [providers, ai] = await Promise.all([startFakeProviders(), startFakeAi()]);
});
afterAll(async () => {
  await Promise.all([providers?.close(), ai?.close()]);
});

describe("fake server control endpoints (#63)", () => {
  it("@issue-63 AC6: an invalid fault pathPattern gets a fixed 400 message, not the caught exception", async () => {
    const res = await post(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: "(", mode: "500" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "pathPattern is not a valid regular expression" });
    expect((await post(`${providers.url}/__fake/fault`, { provider: "slack", pathPattern: "^/api/", mode: "500", times: 0 })).status).toBe(200);
  });

  it("@issue-63 AC7: a slow fault's delayMs must be a number from 0 to 60000", async () => {
    for (const delayMs of [-1, 60_001, 1e9, "1000"]) {
      const res = await post(`${ai.url}/__fake/openai/fault`, { mode: "slow", times: 1, delayMs });
      expect(res.status, String(delayMs)).toBe(400);
      expect(await res.json()).toEqual({ error: "delayMs must be a number from 0 to 60000" });
    }
    expect((await post(`${ai.url}/__fake/openai/fault`, { mode: "slow", times: 0, delayMs: 60_000 })).status).toBe(200);
  });
});
