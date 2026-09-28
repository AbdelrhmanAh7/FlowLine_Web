import { publicProviders } from "@/ai/hub/status";
import { requireUser } from "@/server/access";
import { json, route } from "@/server/http";

/** AI provider DEFINITIONS (the hub registry). Connections are per workspace: /api/workspaces/[wid]/ai. No keys here. */
export const GET = route(async () => {
  await requireUser();
  return json({ providers: publicProviders() });
});
