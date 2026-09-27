import { configuredProviders } from "@/ai/chat";
import { requireUser } from "@/server/access";
import { json, route } from "@/server/http";

/** AI providers configured on this server (for agent and AI-node settings). No keys are returned. */
export const GET = route(async () => {
  await requireUser();
  return json({ providers: configuredProviders() });
});
