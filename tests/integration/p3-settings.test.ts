import { afterAll, describe, expect, it } from "vitest";
import { getAiProvider } from "@/ai/provider";
import { updateWorkspace, createWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

const prev = { ...process.env };
afterAll(async () => {
  Object.assign(process.env, prev);
  await closeDb();
});

describe("workspace AI defaults (P3-07)", () => {
  it("only configured providers can be the default; the default model is used by AI steps", async () => {
    process.env.FLOWLINE_AI_PROVIDER = "ollama";
    process.env.FLOWLINE_AI_MODEL = "fake-model";
    delete process.env.ANTHROPIC_API_KEY;
    const user = await makeUser("ai");
    const ws = await createWorkspace(user, unique("AiDefaults"));
    await expectHttpError(updateWorkspace(ws.id, { aiProvider: "anthropic", aiModel: "any" }), 400, "AI_PROVIDER_UNAVAILABLE");
    const saved = await updateWorkspace(ws.id, { aiProvider: "ollama", aiModel: "other-local-model" });
    expect(saved).toMatchObject({ aiProvider: "ollama", aiModel: "other-local-model" });
    expect(getAiProvider({ provider: saved.aiProvider, model: saved.aiModel }).model).toBe("other-local-model");
    expect(getAiProvider({}).model).toBe("fake-model");
    const cleared = await updateWorkspace(ws.id, { aiProvider: null });
    expect(cleared).toMatchObject({ aiProvider: null, aiModel: null });
  });

  it("monthly execution limit is validated", async () => {
    const user = await makeUser("lim");
    const ws = await createWorkspace(user, unique("Limits"));
    await expectHttpError(updateWorkspace(ws.id, { maxMonthlyExecutions: 0 }), 400);
    expect(await updateWorkspace(ws.id, { maxMonthlyExecutions: 500 })).toMatchObject({ maxMonthlyExecutions: 500 });
    expect(await updateWorkspace(ws.id, { maxMonthlyExecutions: null })).toMatchObject({ maxMonthlyExecutions: null });
  });
});
