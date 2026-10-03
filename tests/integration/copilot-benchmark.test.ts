import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { createAiConnection } from "@/ai/hub/connections";
import { createWorkspace } from "@/server/workspaces";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { runBenchmark } from "../../scripts/copilot-benchmark.mjs";
import { fakeKey, useAiDouble } from "./ai-helpers";
import { closeDb, makeUser, unique } from "./helpers";

describe("Copilot benchmark runner with the local AI test double", () => {
  let ai: Awaited<ReturnType<typeof startFakeAi>>;
  const before = { ...process.env };
  beforeAll(async () => { ai = await startFakeAi(0); useAiDouble(ai.url); });
  afterAll(async () => { Object.assign(process.env, before); await ai.close(); await closeDb(); });

  it("uses one encrypted workspace connection, scores all frozen cases, and writes both reports", async () => {
    const owner = await makeUser("benchmark");
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, owner.id));
    const workspace = await createWorkspace(owner, unique("benchmark"));
    const connection = await createAiConnection(db, owner.id, workspace.id, { provider: "openai", label: "Fake OpenAI", apiKey: fakeKey("benchmark") });
    const options = { workspace: workspace.id, actor: owner.id, connection: connection.id, provider: "openai", model: "fake-gpt-mini", maxUsd: 0, allowUnknownCost: true };
    await expect(runBenchmark({ ...options, allowUnknownCost: false })).rejects.toThrow("UNKNOWN_COST_REFUSED");
    const { report, directory } = await runBenchmark(options);
    expect(report.results).toHaveLength(12);
    expect(report.scope.testDouble).toBe(true);
    expect(report.safeguards.automaticRetries).toBe(0);
    const requests = (await (await fetch(`${ai.url}/__fake/openai/requests`)).json()) as { requests: { path: string }[] };
    expect(requests.requests.filter((r) => r.path.endsWith("/chat/completions"))).toHaveLength(11);
    const fs = await import("node:fs/promises");
    expect(JSON.parse(await fs.readFile(`${directory}/report.json`, "utf8")).results).toHaveLength(12);
    expect(await fs.readFile(`${directory}/report.md`, "utf8")).toContain("Correct:");
  });
});
