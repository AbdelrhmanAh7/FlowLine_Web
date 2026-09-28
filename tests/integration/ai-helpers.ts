import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createAiConnection, setDefaultRoute, setUseRoles, getAiConnection } from "@/ai/hub/connections";
import type { CurrentUser } from "@/server/access";

/**
 * AI hub test support. The provider is the OpenAI-compatible TEST DOUBLE in e2e/fakes/ai-server.ts, reached only
 * because FLOWLINE_ENV=test + FLOWLINE_AI_TEST_OVERRIDE rewrite the documented base URL. Connections are created
 * through the same service the API route uses (createAiConnection: key check by model listing, v2 encryption) —
 * never by writing rows directly.
 */
export const MODEL_PROVIDER_ENV_KEYS = ["FLOWLINE_AI_PROVIDER", "FLOWLINE_AI_MODEL", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY"] as const;

/** Points the hub at the double and removes every model-provider env key (the app must not need or read them). */
export function useAiDouble(aiUrl: string, extraAllow: string[] = []) {
  const port = new URL(aiUrl).port;
  process.env.FLOWLINE_ENV = "test";
  process.env.FLOWLINE_AI_TEST_OVERRIDE = aiUrl;
  const allow = new Set([...(process.env.FLOWLINE_EGRESS_ALLOWLIST ?? "").split(",").filter(Boolean), `127.0.0.1:${port}`, ...extraAllow]);
  process.env.FLOWLINE_EGRESS_ALLOWLIST = [...allow].join(",");
  for (const k of MODEL_PROVIDER_ENV_KEYS) delete process.env[k];
}

export function fakeKey(tag = "k") {
  return `sk-fake-${tag}-${randomUUID().replace(/-/g, "")}`;
}

export const DEFAULT_TEST_MODEL = "fake-gpt-mini";

/**
 * Owner adds an OpenAI connection with a fake key; optionally makes `model` the workspace default. The double has
 * no prices, so unless `allowUnknownCost: false` the owner policy explicitly allows unknown-cost calls (the test
 * plans include a usage cap, under which unknown-cost calls are otherwise refused — covered by its own test).
 */
export async function connectAi(owner: CurrentUser, workspaceId: string, opts: { key?: string; label?: string; model?: string | null; useRoles?: string[]; allowUnknownCost?: boolean } = {}) {
  const key = opts.key ?? fakeKey();
  const connection = await createAiConnection(db, owner.id, workspaceId, { provider: "openai", label: opts.label ?? "Test OpenAI", apiKey: key });
  if (opts.useRoles) await setUseRoles(db, await getAiConnection(db, workspaceId, connection.id), opts.useRoles);
  const model = opts.model === undefined ? DEFAULT_TEST_MODEL : opts.model;
  if (model) await setDefaultRoute(db, workspaceId, { connectionId: connection.id, modelId: model });
  await db.update(schema.workspace).set({ aiPolicy: { mode: "MANUAL", allowUnknownCost: opts.allowUnknownCost ?? true } }).where(eq(schema.workspace.id, workspaceId));
  return { connection, key };
}
