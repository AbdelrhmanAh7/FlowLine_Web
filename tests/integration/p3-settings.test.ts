import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getAiProvider } from "@/ai/provider";
import { db, schema } from "@/db";
import { startFakeAi } from "../../e2e/fakes/ai-server";
import { connectAi, useAiDouble } from "./ai-helpers";
import { updateWorkspace, createWorkspace } from "@/server/workspaces";
import { closeDb, expectHttpError, makeUser, unique } from "./helpers";

const prev = { ...process.env };
afterAll(async () => {
  Object.assign(process.env, prev);
  await closeDb();
});

describe("workspace AI defaults (P3-07, superseded by the AI hub: cloud-only, workspace connections)", () => {
  it("server-configured providers can't be chosen any more (even when their env vars are set); the default is a workspace connection route", async () => {
    const ai = await startFakeAi(0);
    try {
      useAiDouble(ai.url);
      // Even with legacy env configuration present, nothing reads it.
      process.env.FLOWLINE_AI_PROVIDER = "anthropic";
      process.env.FLOWLINE_AI_MODEL = "env-model";
      process.env.ANTHROPIC_API_KEY = "sk-ant-env-key-that-must-never-be-used-000000";
      const user = await makeUser("ai");
      const ws = await createWorkspace(user, unique("AiDefaults"));
      await expectHttpError(updateWorkspace(ws.id, { aiProvider: "anthropic", aiModel: "any" }), 400, "AI_PROVIDER_UNAVAILABLE");
      await expectHttpError(updateWorkspace(ws.id, { aiProvider: "ollama", aiModel: "other-local-model" }), 400, "AI_LOCAL_MIGRATION_REQUIRED");
      const cleared = await updateWorkspace(ws.id, { aiProvider: null });
      expect(cleared).toMatchObject({ aiProvider: null, aiModel: null });
      const row = async () => (await db.select().from(schema.workspace).where(eq(schema.workspace.id, ws.id)))[0]!;
      // No connection → the facade is unavailable with a clear reason (no env fallback).
      const none = await getAiProvider(db, await row(), user.id, { requestId: "t" });
      expect(none).toMatchObject({ available: false, code: "AI_NOT_CONFIGURED" });
      // With a workspace connection + default model, that route is used.
      const { connection } = await connectAi(user, ws.id, { model: "fake-gpt-large" });
      const p = await getAiProvider(db, await row(), user.id, { requestId: "t" });
      expect(p).toMatchObject({ available: true, id: "openai", model: "fake-gpt-large" });
      expect((await row()).aiDefaultRoute).toEqual({ connectionId: connection.id, modelId: "fake-gpt-large" });
      const r = await p.generate({ instructions: "summarise", content: "hello", maxTokens: 50, signal: AbortSignal.timeout(10_000) });
      expect(r).toMatchObject({ provider: "openai", model: "fake-gpt-large" });
      const reqs = (await (await fetch(ai.url + "/__fake/openai/requests")).json()) as { requests: { auth: string; path: string }[] };
      expect(reqs.requests.every((x) => x.auth === "bearer" && x.path.startsWith("/openai/v1/"))).toBe(true);
    } finally {
      await ai.close();
    }
  });

  it("monthly execution limit is validated", async () => {
    const user = await makeUser("lim");
    const ws = await createWorkspace(user, unique("Limits"));
    await expectHttpError(updateWorkspace(ws.id, { maxMonthlyExecutions: 0 }), 400);
    expect(await updateWorkspace(ws.id, { maxMonthlyExecutions: 500 })).toMatchObject({ maxMonthlyExecutions: 500 });
    expect(await updateWorkspace(ws.id, { maxMonthlyExecutions: null })).toMatchObject({ maxMonthlyExecutions: null });
  });
});
