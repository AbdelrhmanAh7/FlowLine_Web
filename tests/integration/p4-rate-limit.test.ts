import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { checkRate, checkRunRate, RUNS_PER_MINUTE } from "@/server/rate-limit";
import { closeDb } from "./helpers";

afterAll(closeDb);

/** Moved from the unit suite (regression: Fable F9) now that the limit lives in PostgreSQL (P4-13). */
describe("shared run rate limit", () => {
  it(`allows ${RUNS_PER_MINUTE}/min per key, then 429; other keys unaffected; the window slides`, async () => {
    const key = `rl-${randomUUID()}`;
    const t0 = new Date("2030-01-01T00:00:00Z");
    for (let i = 0; i < RUNS_PER_MINUTE; i++) await checkRunRate(key, new Date(t0.getTime() + i));
    await expect(checkRunRate(key, new Date(t0.getTime() + 100))).rejects.toThrowError(/at most/);
    await expect(checkRunRate(`other-${key}`, new Date(t0.getTime() + 100))).resolves.toBeUndefined();
    await expect(checkRunRate(key, new Date(t0.getTime() + 61_000))).resolves.toBeUndefined();
  });

  it("is global: concurrent requests (as from several web instances) can't overshoot the limit", async () => {
    const key = `race-${randomUUID()}`;
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 25 }, () => checkRate(key, 10, 60, now)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});
