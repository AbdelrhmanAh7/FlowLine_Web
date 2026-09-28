import { z } from "zod";
import { listProviders } from "@/integrations/registry";
import { requireUser } from "@/server/access";
import { codeSandboxAvailable } from "@/server/code-sandbox";
import { oauthConfigured } from "@/server/connections";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

function schemaOf(t: z.ZodType) {
  try {
    return z.toJSONSchema(t, { unrepresentable: "any" });
  } catch {
    return null;
  }
}

/** Real catalog: counts come from the adapters that exist, with their honest verification level. */
export const GET = route(async () => {
  await requireUser();
  const providers = listProviders().map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    category: p.category,
    description: p.description,
    authType: p.authType,
    oauthConfigured: p.authType === "oauth2" ? oauthConfigured(p) : null,
    connectFields: (p.connectFields ?? []).map((f) => ({ key: f.key, label: f.label, secret: f.secret, placeholder: f.placeholder, help: f.help })),
    verification: p.verification,
    actions: p.actions.map((a) => ({
      id: a.id,
      version: a.version,
      title: a.title,
      description: a.description,
      sideEffect: a.sideEffect,
      sensitive: Boolean(a.sensitive),
      verifiable: Boolean(a.verify),
      requiredScopes: a.requiredScopes,
      inputSchema: schemaOf(a.input),
    })),
  }));
  const code = await codeSandboxAvailable();
  return json({
    count: providers.length,
    actionCount: providers.reduce((n, p) => n + p.actions.length, 0),
    providers,
    runtime: {
      codeSandbox: { available: code.ok, reason: code.reason ?? null },
    },
  });
});
